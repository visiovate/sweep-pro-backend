const { PrismaClient } = require('@prisma/client');

let prisma = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

/**
 * Initialize Prisma client with retry logic
 */
async function initializePrisma() {
  if (prisma) {
    return prisma;
  }

  try {
    console.log('🔄 Initializing database connection...');
    prisma = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'pretty',
    });

    // Test the connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    connectionAttempts = 0;
    return prisma;
  } catch (error) {
    connectionAttempts++;
    console.error(`❌ Database connection failed (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}):`, error.message);
    
    if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      console.log(`🔄 Retrying database connection in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return initializePrisma();
    } else {
      console.error('❌ Max database connection attempts reached. Please check your DATABASE_URL and database server.');
      prisma = null;
      throw error;
    }
  }
}

/**
 * Get Prisma client instance
 */
function getPrismaClient() {
  if (!prisma) {
    console.warn('⚠️ Prisma client not initialized. Call initializePrisma() first.');
  }
  return prisma;
}

function requirePrismaClient() {
  const client = getPrismaClient();
  if (!client) {
    throw new Error('Prisma client not initialized');
  }
  return client;
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
 */
async function disconnectDatabase() {
  if (prisma) {
    try {
      await prisma.$disconnect();
      console.log('✅ Database disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error);
    } finally {
      prisma = null;
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
    
    // If it's a connection error, try to reinitialize
    if (error.message.includes('Can\'t reach database server') || 
        error.message.includes('Connection refused') ||
        error.message.includes('Database connection not available')) {
      console.log('🔄 Attempting to reconnect to database...');
      try {
        await initializePrisma();
        // Retry the operation once
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
