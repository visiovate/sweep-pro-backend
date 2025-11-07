const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const issueRoutes = require('./routes/issueRoutes');
const maidRoutes = require('./routes/maidRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
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
const queueRoutes = require('./routes/queueRoutes');
const bookingDeduplicationRoutes = require('./routes/bookingDeduplicationRoutes');

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocketServer({ server });

// Import database utility
const { initializePrisma } = require('./utils/database');

// Import notification service
const notificationService = require('./services/notificationService');

// Import BullMQ job scheduler and Redis connection
const JobScheduler = require('./services/jobScheduler');
const { testRedisConnection } = require('./config/redis');

// Import booking deduplication service
const bookingDeduplicationService = require('./services/bookingDeduplicationService');

// Import Bull Board for queue monitoring
const { serverAdapter: bullBoardAdapter } = require('./monitoring/bullBoard');

// Import Cron Manager
const cronManager = require('./cron/cronManager');

// Initialize notification service with WebSocket server
notificationService.init(wss);

// Initialize monthly subscription scheduler
require('./scheduler/monthlySubscriptionScheduler');

// Initialize automatic service scheduler
const AutomaticServiceScheduler = require('./services/AutomaticServiceScheduler');
const automaticScheduler = new AutomaticServiceScheduler();

// Initialize buffer period scheduler
const bufferPeriodScheduler = require('./scheduler/bufferPeriodScheduler');

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173', 
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',
    // Add additional common development ports
    'http://localhost:4173',
    'http://localhost:3001',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
  res.header('Access-Control-Allow-Credentials', 'true');
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

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Bull Board queue monitoring dashboard
app.use('/admin/queues', bullBoardAdapter.getRouter());

// Custom Bull Board endpoints moved from bullBoard.js
const { assignmentQueue } = require('./queues/assignmentQueue');
const { adminReassignQueue } = require('./queues/adminReassignQueue');

// Health check
app.get('/health', async (req, res) => {
  try {
    const assignmentStats = await assignmentQueue.getJobCounts();
    const reassignStats = await adminReassignQueue.getJobCounts();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      queues: {
        assignment: {
          name: 'maid-assignment',
          stats: assignmentStats,
          status: 'healthy'
        },
        reassignment: {
          name: 'admin-reassignment',
          stats: reassignStats,
          status: 'healthy'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Pause queue
app.post('/admin/queues/:queueName/pause', async (req, res) => {
  try {
    const { queueName } = req.params;
    if (queueName === 'maid-assignment') {
      await assignmentQueue.pause();
    } else if (queueName === 'admin-reassignment') {
      await adminReassignQueue.pause();
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    res.json({
      success: true,
      message: `Queue ${queueName} paused`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Resume queue
app.post('/admin/queues/:queueName/resume', async (req, res) => {
  try {
    const { queueName } = req.params;
    if (queueName === 'maid-assignment') {
      await assignmentQueue.resume();
    } else if (queueName === 'admin-reassignment') {
      await adminReassignQueue.resume();
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    res.json({
      success: true,
      message: `Queue ${queueName} resumed`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Clean queue
app.post('/admin/queues/:queueName/clean', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { age = 24 * 60 * 60 * 1000, limit = 100 } = req.body || {};
    let cleanedJobs = [];
    if (queueName === 'maid-assignment') {
      const completedCleaned = await assignmentQueue.clean(age, limit, 'completed');
      const failedCleaned = await assignmentQueue.clean(age, limit, 'failed');
      cleanedJobs = [...completedCleaned, ...failedCleaned];
    } else if (queueName === 'admin-reassignment') {
      const completedCleaned = await adminReassignQueue.clean(age, limit, 'completed');
      const failedCleaned = await adminReassignQueue.clean(age, limit, 'failed');
      cleanedJobs = [...completedCleaned, ...failedCleaned];
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    res.json({
      success: true,
      message: `Cleaned ${cleanedJobs.length} jobs from ${queueName}`,
      cleanedCount: cleanedJobs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Retry job
app.post('/admin/queues/:queueName/jobs/:jobId/retry', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    let job = null;
    if (queueName === 'maid-assignment') {
      job = await assignmentQueue.getJob(jobId);
    } else if (queueName === 'admin-reassignment') {
      job = await adminReassignQueue.getJob(jobId);
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    await job.retry();
    res.json({
      success: true,
      message: `Job ${jobId} retried`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Remove job
app.delete('/admin/queues/:queueName/jobs/:jobId', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    let job = null;
    if (queueName === 'maid-assignment') {
      job = await assignmentQueue.getJob(jobId);
    } else if (queueName === 'admin-reassignment') {
      job = await adminReassignQueue.getJob(jobId);
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    await job.remove();
    res.json({
      success: true,
      message: `Job ${jobId} removed`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

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
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/maids', maidRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/test', testRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', userDashboardRoutes);
app.use('/api/buffer', bufferRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/admin/customer-assignments', customerAssignmentRoutes);
app.use('/api/automatic-bookings', automaticBookingRoutes);
app.use('/api/automatic-assignments', automaticAssignmentRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/booking-deduplication', bookingDeduplicationRoutes);

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

// Manual trigger for automatic assignment requests (for testing)
app.post('/api/admin/trigger-assignment-requests', async (req, res) => {
  try {
    const AutomaticAssignmentService = require('./services/automaticAssignmentService');
    const result = await AutomaticAssignmentService.processAutomaticRequests();
    
    res.json({
      success: true,
      message: 'Assignment requests processing triggered',
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering assignment requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger assignment requests',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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
      
      // Test Redis connection
      const redisConnected = await testRedisConnection();
      if (!redisConnected) {
        console.error('⚠️ Redis connection failed. BullMQ features will not work.');
        console.log('⚠️ Please ensure Redis is running and configured correctly.');
      }
      
      // Initialize BullMQ job scheduler
      if (redisConnected) {
        await JobScheduler.initialize();
        console.log('✅ BullMQ Job Scheduler initialized successfully');
        console.log('📋 Background worker should be running separately: npm run worker');
        
        // Initialize booking deduplication service
        await bookingDeduplicationService.init();
        console.log('✅ Booking Deduplication Service initialized successfully');
      }
      
      // Initialize centralized cron manager
      await cronManager.initialize();
      console.log('✅ Cron Manager initialized successfully');
      
      // Initialize automatic service scheduler after database is ready
      await automaticScheduler.init();
      console.log('✅ Automatic service scheduler initialized');
      
      // Initialize automatic assignment service to process missed requests on startup
      const AutomaticAssignmentService = require('./services/automaticAssignmentService');
      await AutomaticAssignmentService.processOnServerStartup();
      console.log('✅ Automatic assignment service initialized');
      
      // Set up cron job for automatic assignment requests (every 15 minutes)
      const cron = require('node-cron');
      cron.schedule('*/15 * * * *', async () => {
        console.log('⏰ [CRON] Running automatic assignment requests processing...');
        try {
          await AutomaticAssignmentService.processAutomaticRequests();
        } catch (error) {
          console.error('❌ Error in automatic assignment cron job:', error);
        }
      });
      console.log('✅ Automatic assignment cron job scheduled (every 15 minutes)');
      
      // Initialize buffer period scheduler
      bufferPeriodScheduler.start();
      console.log('✅ Buffer period scheduler initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize database or scheduler:', error);
      console.log('⚠️ Server will continue running but some features may not work');
    }
  });
}

module.exports = app;

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing HTTP server, Redis, and Prisma Client...');
  const { closeRedisConnection } = require('./config/redis');
  const { closeQueue } = require('./queues/assignmentQueue');
  await closeQueue();
  await closeRedisConnection();
  await disconnectDatabase();
  process.exit(0);
});
