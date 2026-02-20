const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

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

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocketServer({ server });

// Import database utility
const { initializePrisma, disconnectDatabase } = require('./utils/database');

// Initialize Firebase Admin SDK
const { initializeFirebaseAdmin } = require('./config/firebase');

// Import Redis utility
const { testRedisConnection } = require('./config/redis');

// Import notification service
const notificationService = require('./services/notificationService');

// ⚠️ REMOVED: BullMQ job scheduler initialization (moved to worker)
// ⚠️ REMOVED: Monthly subscription scheduler (moved to dedicated cron)
// ⚠️ REMOVED: Automatic service scheduler (moved to dedicated cron)
// ⚠️ REMOVED: Buffer period scheduler (moved to dedicated cron)

// Initialize notification service with WebSocket server
notificationService.init(wss);

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

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
  res.sendStatus(200);
});

// CORS debugging middleware
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No Origin'}`);
  if (req.method === 'OPTIONS') {
    console.log('🔍 Preflight request detected');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Make notification service available globally
app.use((req, res, next) => {
  req.notificationService = notificationService;
  next();
});

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
app.use('/api/auth', authRoutes);
app.use('/api/auth', firebaseAuthRoutes); // Firebase auth routes (login, me, complete-profile, apartments)
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/booking-completion', bookingCompletionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/maids', maidRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/test', testRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', userDashboardRoutes);
app.use('/api/buffer', bufferRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/admin/customer-assignments', customerAssignmentRoutes);
app.use('/api/admin', adminRoutes);
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
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    dependencies: {
      database: { status: 'unknown', message: 'Not checked' },
      redis: { status: 'unknown', message: 'Not checked' }
    }
  };

  try {
    // Check database connectivity
    const { prismaClient } = require('./utils/database');
    if (prismaClient) {
      try {
        await prismaClient.$queryRaw`SELECT 1`;
        healthStatus.dependencies.database = { status: 'healthy', message: 'Connected' };
      } catch (dbError) {
        healthStatus.dependencies.database = { status: 'unhealthy', message: dbError.message };
        healthStatus.status = 'degraded';
      }
    }
  } catch (error) {
    healthStatus.dependencies.database = { status: 'unhealthy', message: 'Failed to check: ' + error.message };
    healthStatus.status = 'degraded';
  }

  try {
    // Check Redis connectivity
    const redis = require('./config/redis');
    if (redis && redis.redisClient) {
      try {
        await redis.redisClient.ping();
        healthStatus.dependencies.redis = { status: 'healthy', message: 'Connected' };
      } catch (redisError) {
        healthStatus.dependencies.redis = { status: 'unhealthy', message: redisError.message };
        healthStatus.status = 'degraded';
      }
    }
  } catch (error) {
    healthStatus.dependencies.redis = { status: 'unhealthy', message: 'Failed to check: ' + error.message };
    healthStatus.status = 'degraded';
  }

  // Return appropriate status code
  const statusCode = healthStatus.status === 'ok' ? 200 : (healthStatus.status === 'degraded' ? 503 : 500);
  res.status(statusCode).json(healthStatus);
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working correctly',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
    console.log(`🔗 WebSocket server initialized`);
    
    // Initialize database connection
    try {
      await initializePrisma();
      console.log('✅ Database initialized successfully');
      
      // Initialize Firebase Admin SDK
      try {
        initializeFirebaseAdmin();
        console.log('✅ Firebase Admin SDK initialized successfully');
      } catch (firebaseError) {
        console.error('⚠️ Firebase Admin initialization failed:', firebaseError.message);
        console.log('⚠️ Firebase authentication features will not work');
      }
      
      // Test Redis connection
      const redisConnected = await testRedisConnection();
      if (!redisConnected) {
        console.error('⚠️ Redis connection failed. BullMQ features will not work.');
        console.log('⚠️ Please ensure Redis is running and configured correctly.');
      }
      
      // Initialize BullMQ job scheduler
      // ⚠️ MOVED: Job scheduler initialization moved to worker (separate npm run worker)
      if (redisConnected) {
        console.log('ℹ️ BullMQ Job Scheduler runs in separate worker process');
        console.log('📋 Start the background worker with: npm run worker');
      }
      
      // Initialize automatic service scheduler after database is ready
      // ⚠️ MOVED: Automatic service scheduler moved to separate cron service
      console.log('ℹ️ Automatic service scheduler runs in separate process');
      
      // Initialize buffer period scheduler
      // ⚠️ MOVED: Buffer period scheduler moved to separate cron service
      console.log('ℹ️ Buffer period scheduler runs in separate process');
      
      console.log('✅ All schedulers initialized (running in separate processes)');
      
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      console.log('⚠️ Server will continue running but some features may not work');
    }
  });
}

module.exports = app;

let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    console.log(`${signal} received. Closing HTTP server and Prisma Client...`);

    await new Promise((resolve) => {
      server.close(() => resolve());
      setTimeout(() => resolve(), 3000);
    });

    // ⚠️ REMOVED: Queue closing (not used by stateless API)
    // ⚠️ REMOVED: Redis closing (not used by stateless API)

    try {
      await disconnectDatabase();
    } catch (e) {
      console.warn('⚠️ Failed to disconnect database:', e?.message || e);
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
