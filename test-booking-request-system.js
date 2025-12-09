/**
 * Test Script for Booking Request System
 * 
 * This script tests the complete booking request flow:
 * 1. Scheduling booking requests
 * 2. Checking queue status
 * 3. Verifying database entries
 */

const { PrismaClient } = require('@prisma/client');
const { scheduleAllBookingRequests } = require('./src/services/bookingRequestService');
const { getQueueStats, getAllJobs } = require('./src/queues/assignmentQueue');
const { testRedisConnection } = require('./src/config/redis');

const prisma = new PrismaClient();

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     BOOKING REQUEST SYSTEM - VERIFICATION TEST         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Test Redis Connection
    console.log('📡 Step 1: Testing Redis Connection...');
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      console.error('❌ Redis connection failed. Please ensure Redis is running.');
      console.log('   💡 Start Redis: redis-server');
      process.exit(1);
    }
    console.log('✅ Redis connection successful\n');

    // Step 2: Check Database Connection
    console.log('🗄️  Step 2: Testing Database Connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful\n');

    // Step 3: Check Active Customer-Maid Assignments
    console.log('👥 Step 3: Checking Active Customer-Maid Assignments...');
    const assignments = await prisma.customerMaidAssignment.findMany({
      where: { isActive: true },
      include: {
        customer: {
          select: { id: true, name: true, timeSlot: true }
        },
        maid: {
          include: {
            user: { select: { id: true, name: true } }
          }
        }
      }
    });

    console.log(`   Found ${assignments.length} active assignments:`);
    if (assignments.length === 0) {
      console.log('   ⚠️  No active assignments found.');
      console.log('   💡 Create at least one customer-maid assignment to test.');
    } else {
      assignments.forEach((assignment, index) => {
        console.log(`   ${index + 1}. ${assignment.customer.name} ↔ ${assignment.maid.user.name}`);
        console.log(`      Time Slot: ${assignment.customer.timeSlot || 'Not set'}`);
      });
    }
    console.log('');

    // Step 4: Check Existing Pending Requests
    console.log('📋 Step 4: Checking Existing Pending Assignment Requests...');
    const pendingRequests = await prisma.assignmentRequest.findMany({
      where: {
        status: 'pending',
        expiresAt: { gt: new Date() }
      },
      include: {
        booking: {
          include: {
            customer: { select: { name: true } }
          }
        }
      }
    });
    console.log(`   Found ${pendingRequests.length} pending requests`);
    if (pendingRequests.length > 0) {
      pendingRequests.forEach((req, index) => {
        console.log(`   ${index + 1}. Customer: ${req.booking.customer.name}`);
        console.log(`      Booking ID: ${req.bookingId}`);
        console.log(`      Expires: ${req.expiresAt.toISOString()}`);
      });
    }
    console.log('');

    // Step 5: Test Scheduling Service
    console.log('⏰ Step 5: Testing Booking Request Scheduling...');
    console.log('   (This will schedule requests for all active assignments)\n');
    
    const scheduleResult = await scheduleAllBookingRequests();
    
    console.log('\n📊 Scheduling Result:');
    console.log(`   ✅ Scheduled: ${scheduleResult.scheduled}`);
    console.log(`   ⏭️  Skipped: ${scheduleResult.skipped}`);
    console.log(`   ❌ Errors: ${scheduleResult.errors}`);
    console.log(`   📋 Total Processed: ${scheduleResult.total}\n`);

    // Step 6: Check Queue Status
    console.log('📬 Step 6: Checking BullMQ Queue Status...');
    const queueStats = await getQueueStats();
    console.log('   Assignment Queue Stats:');
    console.log(`   - Waiting: ${queueStats.waiting}`);
    console.log(`   - Active: ${queueStats.active}`);
    console.log(`   - Completed: ${queueStats.completed}`);
    console.log(`   - Failed: ${queueStats.failed}`);
    console.log(`   - Delayed: ${queueStats.delayed}`);
    console.log(`   - Total: ${queueStats.total}\n`);

    // Step 7: Show Delayed Jobs
    if (queueStats.delayed > 0) {
      console.log('⏳ Step 7: Showing Delayed Jobs (scheduled for future)...');
      const jobs = await getAllJobs();
      if (jobs.delayed.length > 0) {
        console.log(`   Found ${jobs.delayed.length} delayed jobs:\n`);
        jobs.delayed.forEach((job, index) => {
          const scheduledFor = new Date(job.timestamp + job.delay);
          console.log(`   ${index + 1}. Job ID: ${job.id}`);
          console.log(`      Type: ${job.name}`);
          console.log(`      Customer: ${job.data.customerName}`);
          console.log(`      Maid: ${job.data.maidName}`);
          console.log(`      Time Slot: ${job.data.timeSlot}`);
          console.log(`      Scheduled For: ${scheduledFor.toISOString()}`);
          console.log(`      Delay: ${(job.delay / 1000 / 60 / 60).toFixed(2)} hours\n`);
        });
      }
    }

    // Summary
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                          ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║  ✅ Redis Connection          : PASSED                  ║');
    console.log('║  ✅ Database Connection       : PASSED                  ║');
    console.log(`║  ${assignments.length > 0 ? '✅' : '⚠️ '} Active Assignments       : ${assignments.length.toString().padEnd(24)}║`);
    console.log(`║  ${scheduleResult.scheduled > 0 ? '✅' : 'ℹ️ '} Jobs Scheduled          : ${scheduleResult.scheduled.toString().padEnd(24)}║`);
    console.log(`║  ${queueStats.delayed > 0 ? '✅' : 'ℹ️ '} Delayed Jobs           : ${queueStats.delayed.toString().padEnd(24)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log('🎉 System verification complete!\n');
    
    // Next Steps
    console.log('📝 NEXT STEPS:\n');
    console.log('1. Start the assignment worker:');
    console.log('   npm run worker\n');
    console.log('2. Start the reassignment worker:');
    console.log('   npm run reassign-worker\n');
    console.log('3. Monitor queues at:');
    console.log('   http://localhost:3000/admin/queues\n');
    console.log('4. Test maid endpoints:');
    console.log('   GET  /api/booking-requests/pending');
    console.log('   POST /api/booking-requests/:id/accept');
    console.log('   POST /api/booking-requests/:id/reject\n');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database\n');
    process.exit(0);
  }
}

// Run the test
main();
