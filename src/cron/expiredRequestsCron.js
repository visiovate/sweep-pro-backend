/**
 * Expired Assignment Requests Cron Job
 * 
 * Handles assignment requests that have expired without maid response
 * Runs every 30 minutes
 * 
 * Command: node src/cron/expiredRequestsCron.js
 */

const { PrismaClient } = require('@prisma/client');
const { retryPrismaOperation, withTimeout } = require('../utils/retryUtils');

const prisma = new PrismaClient({ log: ['error', 'warn'] });
const CRON_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

async function runCron() {
  const startTime = Date.now();
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('║   ⏰ EXPIRED REQUESTS CRON JOB');
  console.log(`║   Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  let stats = { found: 0, processed: 0, errors: 0 };
  
  try {
    const now = new Date();
    
    // Find expired assignment requests
    const expiredRequests = await retryPrismaOperation(
      () => prisma.assignmentRequest.findMany({
        where: {
          status: 'pending',
          expiresAt: { lt: now },
        },
        include: {
          booking: {
            select: {
              id: true,
              customerId: true,
              status: true,
            },
          },
          maid: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        take: 100,
      }),
      'Find expired requests'
    );
    
    stats.found = expiredRequests.length;
    console.log(`📋 Found ${expiredRequests.length} expired request(s)`);
    
    // Process each expired request
    for (const request of expiredRequests) {
      try {
        await retryPrismaOperation(
          () => prisma.$transaction(async (tx) => {
            // Mark request as expired
            await tx.assignmentRequest.update({
              where: { id: request.id },
              data: {
                status: 'expired',
                respondedAt: now,
              },
            });
            
            // Update booking status
            await tx.booking.update({
              where: { id: request.bookingId },
              data: {
                assignmentStatus: 'REJECTED',
                rejectionReason: 'Assignment request expired - no response from maid',
                maidId: null,
              },
            });
            
            // Create notification for customer
            await tx.notification.create({
              data: {
                userId: request.booking.customerId,
                type: 'ASSIGNMENT_FAILED',
                title: 'Assignment Request Expired',
                message: 'The maid did not respond to the assignment request. We will find another maid for you.',
                data: {
                  bookingId: request.bookingId,
                },
              },
            });
          }),
          `Process expired request ${request.id}`
        );
        
        stats.processed++;
        console.log(`✅ Processed expired request ${request.id}`);
        
      } catch (error) {
        stats.errors++;
        console.error(`❌ Failed to process request ${request.id}:`, error.message);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('║   ✅ CRON JOB COMPLETED');
    console.log(`║   Duration: ${duration}ms`);
    console.log(`║   Found: ${stats.found}`);
    console.log(`║   Processed: ${stats.processed}`);
    console.log(`║   Errors: ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    await prisma.$disconnect();
    process.exit(0);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n═══════════════════════════════════════════════════════');
    console.error('║   ❌ CRON JOB FAILED');
    console.error(`║   Duration: ${duration}ms`);
    console.error(`║   Error: ${error.message}`);
    console.error('═══════════════════════════════════════════════════════\n');
    
    await prisma.$disconnect();
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(143);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(130);
});

withTimeout(runCron(), CRON_TIMEOUT_MS, 'Expired requests cron')
  .catch(async (error) => {
    console.error('❌ Cron timeout or fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
