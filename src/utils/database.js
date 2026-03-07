const { PrismaClient } = require('@prisma/client');

let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

// Single PrismaClient instance for the entire application.
// Connection pool size is controlled by `connection_limit` in DATABASE_URL.
// Aiven free tier: max_connections=20, system uses ~9, so connection_limit=5 is safe.
// IMPORTANT: PrismaClient is created lazily to prevent connection pool exhaustion
// when running as cron jobs that may fail before proper cleanup.
let prisma = null;

/**
 * Create a new PrismaClient instance with proper configuration
 */
function createPrismaClient() {
  return new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'pretty',
  });
}

/**
 * Initialize Prisma client with retry logic
 * Creates the PrismaClient lazily to prevent connection pool exhaustion
 */
async function initializePrisma() {
  try {
    if (connectionAttempts === 0) {
      console.log('🔄 Initializing database connection...');
    }

    // Create PrismaClient lazily if it doesn't exist
    if (!prisma) {
      prisma = createPrismaClient();
    }

    await prisma.$connect();

    if (connectionAttempts === 0) {
      console.log('✅ Database connected successfully');
    }
    connectionAttempts = 0;
    return prisma;
  } catch (error) {
    connectionAttempts++;
    console.error(`❌ Database connection failed (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}):`, error.message);

    if (error.message?.includes('too many clients') || error.message?.includes('connection slots are reserved')) {
      console.error('⚠️ Database connection pool exhausted. Idle connections may need to be cleared on the server.');
      // Disconnect and destroy the client to release any partial connections
      if (prisma) {
        try {
          await prisma.$disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors during cleanup
        }
        prisma = null;
      }
    }

    if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      console.log(`🔄 Retrying database connection in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return initializePrisma();
    } else {
      console.error('❌ Max database connection attempts reached. Please check your DATABASE_URL and database server.');
      throw error;
    }
  }
}

/**
 * Get Prisma client instance (singleton)
 * Creates the client lazily if it doesn't exist yet.
 * NOTE: For cron jobs, always call initializePrisma() first to ensure proper connection.
 * For the main app, this lazy creation handles the case where modules are imported
 * before initializePrisma() is called.
 */
function getPrismaClient() {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

function requirePrismaClient() {
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }
  return prisma;
}

/**
 * Check if database is connected
 */
async function isDatabaseConnected() {
  if (!prisma) {
    return false;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Database connection check failed:', error.message);
    return false;
  }
}

/**
 * Gracefully disconnect from database
 * IMPORTANT: Always call this when shutting down to prevent connection leaks
 */
async function disconnectDatabase() {
  if (prisma) {
    try {
      await prisma.$disconnect();
      console.log('✅ Database disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error.message);
    } finally {
      prisma = null;
      connectionAttempts = 0;
    }
  }
}

/**
 * Execute database operation with error handling
 */
async function executeWithErrorHandling(operation, operationName = 'Database operation') {
  try {
    if (!prisma) {
      throw new Error('Database connection not available');
    }

    const isConnected = await isDatabaseConnected();
    if (!isConnected) {
      throw new Error('Database connection lost');
    }

    return await operation(prisma);
  } catch (error) {
    console.error(`❌ ${operationName} failed:`, error.message);

    if (error.message.includes('Can\'t reach database server') ||
      error.message.includes('Connection refused') ||
      error.message.includes('Database connection not available')) {
      console.log('🔄 Attempting to reconnect to database...');
      try {
        await initializePrisma();
        return await operation(prisma);
      } catch (retryError) {
        console.error('❌ Database reconnection failed:', retryError.message);
        throw retryError;
      }
    }

    throw error;
  }
}

module.exports = {
  initializePrisma,
  getPrismaClient,
  requirePrismaClient,
  isDatabaseConnected,
  disconnectDatabase,
  executeWithErrorHandling
};
