const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');

// Load environment variables
dotenv.config();

// Import routes - [keeping all imports as original]
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const serviceRoutes = require('./src/routes/serviceRoutes');
const bookingRoutes = require('./src/routes/bookingRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const issueRoutes = require('./src/routes/issueRoutes');
const maidRoutes = require('./src/routes/maidRoutes');
const subscriptionRoutes = require('./src/routes/subscriptionRoutes');
const bookingCompletionRoutes = require('./src/routes/bookingCompletionRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const testRoutes = require('./src/routes/testRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const documentRoutes = require('./src/routes/documentRoutes');
const userDashboardRoutes = require('./src/routes/userDashboardRoutes');
const bufferRoutes = require('./src/routes/bufferRoutes');
const assignmentRoutes = require('./src/routes/assignmentRoutes');
const customerAssignmentRoutes = require('./src/routes/customerAssignmentRoutes');
const automaticBookingRoutes = require('./src/routes/automaticBookingRoutes');
const automaticAssignmentRoutes = require('./src/routes/automaticAssignmentRoutes');
const profileRoutes = require('./src/routes/profileRoutes');
const feedbackRoutes = require('./src/routes/feedbackRoutes');
const termsRoutes = require('./src/routes/termsRoutes');
const firebaseAuthRoutes = require('./src/routes/firebaseAuthRoutes');
const eventRoutes = require('./src/routes/eventRoutes');

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocketServer({ server });

// Import database utility
const { initializePrisma, disconnectDatabase } = require('./src/utils/database');

// Initialize Firebase Admin SDK
const { initializeFirebaseAdmin } = require('./src/config/firebase');

// Import Redis utility
const { testRedisConnection } = require('./src/config/redis');

// Import notification service
const notificationService = require('./src/services/notificationService');

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
  'https://www.sweep-pro-frontend.vercel.app'
];

const allowedOriginRegexes = [
  /^https:\/\/sweep-pro-frontend(-testing)?\.vercel\.app$/i,
  /^https:\/\/www\.sweep-pro-frontend(-testing)?\.vercel\.app$/i,
  /^https:\/\/sweep-pro-frontend(-testing)?-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/sweep-pro-frontend(-testing)?-[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/sweep-pro-frontend(-testing)?-[a-z0-9]+-visiovate-techs-projects\.vercel\.app$/i
];

function isOriginAllowed(origin) {
  return Boolean(
    origin &&
    (allowedOrigins.includes(origin) || allowedOriginRegexes.some((re) => re.test(origin)))
  );
}

// Apply Helmet middleware with configuration for WebSocket and CORS support
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:", "https:"]
    }
  },
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

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

