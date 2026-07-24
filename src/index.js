const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const url = require('url');

// Load environment variables
dotenv.config();

// SECURITY: Validate environment variables on startup
const { validateEnvironmentVariables, getJwtSecret } = require('./config/validateEnv');
validateEnvironmentVariables();
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const issueRoutes = require('./routes/issueRoutes');
const maidRoutes = require('./routes/maidRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const bookingCompletionRoutes = require('./routes/bookingCompletionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const testRoutes = require('./routes/testRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const documentRoutes = require('./routes/documentRoutes');
const userDashboardRoutes = require('./routes/userDashboardRoutes');
const bufferRoutes = require('./routes/bufferRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const customerAssignmentRoutes = require('./routes/customerAssignmentRoutes');
const automaticBookingRoutes = require('./routes/automaticBookingRoutes');
const automaticAssignmentRoutes = require('./routes/automaticAssignmentRoutes');
const profileRoutes = require('./routes/profileRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const termsRoutes = require('./routes/termsRoutes');
const firebaseAuthRoutes = require('./routes/firebaseAuthRoutes');
const eventRoutes = require('./routes/eventRoutes');

// SECURITY: Import rate limiters
const { authLimiter, paymentLimiter, globalLimiter } = require('./middleware/rateLimiters');

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server with noServer: true so we can perform
// authentication during the HTTP upgrade handshake (M8)
const wss = new WebSocketServer({ noServer: true });

// Import database utility
const { initializePrisma, disconnectDatabase } = require('./utils/database');

// Initialize Firebase Admin SDK
const { initializeFirebaseAdmin } = require('./config/firebase');

// Import Redis utility
const { testRedisConnection } = require('./config/redis');

// Import notification service (simplified version without BullMQ/Redis)
const notificationService = require('./services/simplifiedNotificationService');

// Import notification cleanup cron
const notificationCleanupCron = require('./cron/notificationCleanupCron');

// ⚠️ REMOVED: BullMQ job scheduler initialization (moved to worker)
// ⚠️ REMOVED: Monthly subscription scheduler (moved to dedicated cron)
// ⚠️ REMOVED: Automatic service scheduler (moved to dedicated cron)
// ⚠️ REMOVED: Buffer period scheduler (moved to dedicated cron)

// Initialize notification service with WebSocket server
// Note: Simplified service doesn't need WebSocket init, but we keep it for compatibility
// notificationService.init(wss);

// Start notification cleanup cron (runs daily at 2 AM)
notificationCleanupCron.start();

// -------------------------------------------------------------------
// M8: WebSocket Authentication – JWT verification on upgrade handshake
// -------------------------------------------------------------------
/**
 * Parse a cookie string into a key→value map.
 * Used to extract the authToken cookie from the WS upgrade request,
 * which does not go through Express middleware.
 */
const parseCookieHeader = (cookieHeader = '') => {
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [key, ...val] = pair.trim().split('=');
    if (key) acc[key.trim()] = decodeURIComponent(val.join('=').trim());
    return acc;
  }, {});
};

server.on('upgrade', (request, socket, head) => {
  try {
    // M4 FIX: Accept the WebSocket upgrade without requiring a URL token.
    // Previously the token was required in the query-string (?token=...) which
    // leaks it into web-server logs, CDN logs, proxies, and browser history.
    //
    // Authentication flow:
    //   1. Client connects — no token in URL.
    //   2. Server accepts the upgrade unconditionally.
    //   3. Client sends { type: 'auth', token } as the very first message.
    //   4. Server verifies the token on that first message and either
    //      marks the connection as authenticated or terminates it.
    //   5. Any message received before auth is silently ignored.
    //
    // Cookie-based auth (HttpOnly authToken cookie) is still supported as
    // an alternative — cookies ARE forwarded on WS upgrade requests so they
    // can be used by environments where the client can't send a first message.

    // --- Optional: try cookie auth on upgrade for backward compat ---
    const cookies = parseCookieHeader(request.headers.cookie);
    const cookieToken = cookies['authToken'];

    wss.handleUpgrade(request, socket, head, (ws) => {
      // If a valid cookie token was found, pre-authenticate the connection
      if (cookieToken) {
        try {
          const decoded = jwt.verify(cookieToken, getJwtSecret());
          ws.user = { id: decoded.userId || decoded.id, role: decoded.role };
          ws.authenticated = true;
        } catch (e) {
          // Cookie token invalid — fall through to message-based auth
          ws.authenticated = false;
        }
      } else {
        ws.authenticated = false;
      }

      // Enforce auth-via-first-message within 5 seconds
      if (!ws.authenticated) {
        ws._authTimeout = setTimeout(() => {
          if (!ws.authenticated) {
            logger.warn('WebSocket connection timed out waiting for auth message');
            ws.close(4001, 'Authentication timeout');
          }
        }, 5000);
      }

      wss.emit('connection', ws, request);
    });
  } catch (err) {
    logger.error('WebSocket upgrade error', { message: err.message });
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

// M4 FIX: Handle the 'auth' message sent by websocketService.ts as the first message.
// The notificationService 'connection' handler runs first; this listener runs on
// the wss level to catch auth before any other message is processed.
wss.on('connection', (ws) => {
  if (ws.authenticated) return; // already authed via cookie — nothing to do

  const authMessageHandler = (rawMessage) => {
    // Only process until authenticated
    if (ws.authenticated) return;

    try {
      const msg = JSON.parse(rawMessage);
      if (msg.type !== 'auth' || !msg.token) return;

      const decoded = jwt.verify(msg.token, getJwtSecret());
      ws.user = { id: decoded.userId || decoded.id, role: decoded.role };
      ws.authenticated = true;

      if (ws._authTimeout) {
        clearTimeout(ws._authTimeout);
        ws._authTimeout = null;
      }

      // Remove this one-shot handler — subsequent messages go to normal handlers
      ws.removeListener('message', authMessageHandler);
      logger.info('WebSocket authenticated via message', { userId: ws.user.id });
    } catch (e) {
      logger.warn('WebSocket auth message invalid', { message: e.message });
      ws.close(4001, 'Invalid authentication token');
    }
  };

  ws.on('message', authMessageHandler);
});


// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://localhost:4173',
  'http://localhost:3001',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:3001',
  'https://sweepro.in',
  'https://www.sweepro.in',
  'https://sweep-pro-frontend.vercel.app',
  'https://www.sweep-pro-frontend.vercel.app',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [])
];

const allowedOriginRegexes = [
  /^https:\/\/sweep-pro-frontend(-testing)?\.vercel\.app$/i,
  /^https:\/\/www\.sweep-pro-frontend(-testing)?\.vercel\.app$/i,
  /^https:\/\/sweep-pro-frontend(-testing)?-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/sweep-pro-frontend(-testing)?-[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/sweep-pro-frontend(-testing)?-[a-z0-9]+-visiovate-techs-projects\.vercel\.app$/i,
  ...(process.env.ALLOWED_ORIGIN_REGEXES ? process.env.ALLOWED_ORIGIN_REGEXES.split('|').map(pattern => new RegExp(pattern, 'i')) : [])
];

function isOriginAllowed(origin) {
  return Boolean(
    origin &&
    (allowedOrigins.includes(origin) || allowedOriginRegexes.some((re) => re.test(origin)))
  );
}

// SECURITY: Helmet – set secure HTTP response headers (M8 additional hardening)
app.use(helmet({
  // Content Security Policy – tighten in production via env override
  contentSecurityPolicy: process.env.NODE_ENV === 'production'
    ? undefined      // use helmet defaults in production
    : false,         // relax in development for tooling (e.g. Vite HMR)
  crossOriginEmbedderPolicy: false  // required for some embedded resources
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Requested-With', 'Accept',
    'Origin', 'Cache-Control', 'Pragma',
    'X-CSRF-Token'  // M7: allow CSRF header in requests
  ],
  exposedHeaders: [
    'X-CSRF-Token'  // M7: allow frontend JS to read the CSRF token from response headers (cross-origin)
  ],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, X-CSRF-Token');
  res.sendStatus(200);
});

// Cookie parser – required for HttpOnly cookie auth (M6) and CSRF (M7)
app.use(cookieParser());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));

// Prevent browser caching of API responses
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// Serve uploaded files only to authenticated users. Documents may contain PII.
const { authenticateToken } = require('./middleware/auth');
app.use('/uploads', authenticateToken, express.static('uploads', {
  dotfiles: 'deny',
  index: false,
  fallthrough: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

// Make notification service available globally
app.use((req, res, next) => {
  req.notificationService = notificationService;
  next();
});

// SECURITY: Apply global rate limiter to all API routes
// This provides baseline DDoS protection for all endpoints
app.use('/api', globalLimiter);

// SECURITY: Apply CSRF protection to all API routes (M7)
// The double-submit cookie pattern validates X-CSRF-Token header against
// the csrf-token cookie on all state-changing requests.
const { csrfProtection } = require('./middleware/csrf');
app.use('/api', csrfProtection);

// Legacy compatibility - keep for existing code
function notifyClients(notificationData) {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(notificationData));
    }
  });
}

module.exports.notifyClients = notifyClients;
module.exports.notificationService = notificationService;

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth', authLimiter, firebaseAuthRoutes); // Firebase auth routes (login, me, complete-profile, apartments)
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/booking-completion', bookingCompletionRoutes);
app.use('/api/payments', paymentLimiter, paymentRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/maids', maidRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test', testRoutes);
}
app.use('/api/notifications', notificationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', userDashboardRoutes);
app.use('/api/buffer', bufferRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/admin/customer-assignments', customerAssignmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/automatic-bookings', automaticBookingRoutes);
app.use('/api/automatic-assignments', automaticAssignmentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/terms', termsRoutes);

// Health check route
app.get('/health', async (req, res) => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    dependencies: process.env.NODE_ENV === 'production' ? undefined : {
      database: 'unknown',
      redis: 'unknown'
    }
  };

  try {
    const { prismaClient } = require('./utils/database');
    if (prismaClient) {
      await prismaClient.$queryRaw`SELECT 1`;
      if (healthStatus.dependencies) healthStatus.dependencies.database = 'healthy';
    }
  } catch (_) {
    if (healthStatus.dependencies) healthStatus.dependencies.database = 'unhealthy';
    healthStatus.status = 'degraded';
  }

  try {
    const redis = require('./config/redis');
    if (redis?.redisClient) {
      await redis.redisClient.ping();
      if (healthStatus.dependencies) healthStatus.dependencies.redis = 'healthy';
    }
  } catch (_) {
    if (healthStatus.dependencies) healthStatus.dependencies.redis = 'unhealthy';
    healthStatus.status = 'degraded';
  }

  res.status(healthStatus.status === 'ok' ? 200 : 503).json(healthStatus);
});
// CORS diagnostics are intentionally disabled in production because echoing request headers can leak sensitive metadata.
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/cors-test', (req, res) => {
    res.json({
      success: true,
      message: 'CORS is working correctly',
      origin: req.headers.origin,
      timestamp: new Date().toISOString()
    });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled application error', {
    message: err.message,
    path: req.path,
    method: req.method,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
  res.status(500).json({
    success: false,
    message: 'Something went wrong.',
    code: 'INTERNAL_ERROR'
  });
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Uses PORT from .env (3000) and connection_limit=5 for database pool
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info('WebSocket server ready (JWT authentication enforced on upgrade)');

    // Initialize database connection
    try {
      await initializePrisma();
      logger.info('Database initialized successfully');

      // Initialize Firebase Admin SDK
      try {
        initializeFirebaseAdmin();
      } catch (firebaseError) {
        logger.warn('Firebase Admin initialization failed – Firebase auth unavailable', {
          message: firebaseError.message
        });
      }

      // Test Redis connection
      const redisConnected = await testRedisConnection();
      if (!redisConnected) {
        logger.warn('Redis connection failed – BullMQ features will not work');
      }

      if (redisConnected) {
        logger.info('BullMQ Job Scheduler runs in separate worker process (npm run worker)');
      }

      logger.info('All schedulers run in separate processes');

    } catch (error) {
      logger.error('Failed to initialize database – some features may not work', {
        message: error.message
      });
    }
  });
}

module.exports = app;

let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    logger.info(`${signal} received – closing HTTP server and Prisma client`);

    await new Promise((resolve) => {
      server.close(() => resolve());
      setTimeout(() => resolve(), 3000);
    });

    // ⚠️ REMOVED: Queue closing (not used by stateless API)
    // ⚠️ REMOVED: Redis closing (not used by stateless API)

    try {
      await disconnectDatabase();
    } catch (e) {
      logger.warn('Failed to disconnect database during shutdown', { message: e?.message });
    }
  } finally {
    if (signal === 'SIGUSR2') {
      process.kill(process.pid, 'SIGUSR2');
    } else {
      process.exit(0);
    }
  }
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGUSR2', () => shutdown('SIGUSR2'));
