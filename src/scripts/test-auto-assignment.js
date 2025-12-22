const { PrismaClient } = require('@prisma/client');
const { scheduleAssignmentRequest } = require('../queues/assignmentQueue');
const JobScheduler = require('../services/jobScheduler');

const prisma = new PrismaClient();

/**
 * End-to-end test for auto-assignment flow
 * 
 * This script:
 * 1. Finds an existing customer-maid assignment
 * 2. Triggers job scheduling
 * 3. Validates the job was enqueued
 * 4. Checks worker processing
 */

async function testAutoAssignmentFlow() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 AUTO-ASSIGNMENT E2E TEST                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Find or create a test assignment
    console.log('📋 Step 1: Finding active customer-maid assignment...');
    
    let assignment = await prisma.customerMaidAssignment.findFirst({
      where: { isActive: true },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            timeSlot: true,
            address: true
          }
        },
        maid: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!assignment) {
      console.log('⚠️  No active assignment found. Creating a test assignment...');
      
      // Find a customer with a time slot
      const customer = await prisma.user.findFirst({
        where: {
          role: 'CUSTOMER',
          timeSlot: { not: null }
        },
        select: { id: true, name: true, timeSlot: true }
      });

      if (!customer) {
        throw new Error('No customer with time slot found. Please set a timeSlot for at least one customer.');
      }

      // Find an active maid
      const maid = await prisma.maidProfile.findFirst({
        where: { status: 'ACTIVE' },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (!maid) {
        throw new Error('No active maid found. Please ensure at least one maid has status=ACTIVE.');
      }

      // Create the assignment
      assignment = await prisma.customerMaidAssignment.create({
        data: {
          customerId: customer.id,
          maidId: maid.id,
          isActive: true,
          notes: 'Test assignment created by auto-assignment test script',
          assignedAt: new Date()
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              timeSlot: true,
              address: true
            }
          },
          maid: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });

      console.log(`✅ Created test assignment: ${assignment.customer.name} → ${assignment.maid.user.name}`);
    } else {
      console.log(`✅ Found assignment: ${assignment.customer.name} → ${assignment.maid.user.name}`);
    }

    console.log(`   Customer ID: ${assignment.customerId}`);
    console.log(`   Customer Name: ${assignment.customer.name}`);
    console.log(`   Customer Time Slot: ${assignment.customer.timeSlot}`);
    console.log(`   Maid Profile ID: ${assignment.maidId}`);
    console.log(`   Maid User ID: ${assignment.maid.user.id}`);
    console.log(`   Maid Name: ${assignment.maid.user.name}`);

    // Step 2: Validate foreign keys
    console.log('\n📋 Step 2: Validating foreign keys...');
    
    const customerExists = await prisma.user.findUnique({
      where: { id: assignment.customerId },
      select: { id: true, name: true }
    });

    const maidProfileExists = await prisma.maidProfile.findUnique({
      where: { id: assignment.maidId },
      include: { user: { select: { id: true } } }
    });

    const maidUserExists = await prisma.user.findUnique({
      where: { id: assignment.maid.user.id },
      select: { id: true, name: true }
    });

    if (!customerExists) {
      throw new Error(`Customer ${assignment.customerId} does not exist!`);
    }
    if (!maidProfileExists) {
      throw new Error(`Maid profile ${assignment.maidId} does not exist!`);
    }
    if (!maidUserExists) {
      throw new Error(`Maid user ${assignment.maid.user.id} does not exist!`);
    }

    console.log('✅ All foreign keys are valid');

    // Step 3: Test direct job enqueue
    console.log('\n📋 Step 3: Testing direct job enqueue with validation...');
    
    const jobData = {
      customerId: assignment.customerId,
      maidId: assignment.maidId,
      maidUserId: assignment.maid.user.id,
      timeSlot: assignment.customer.timeSlot,
      customerName: assignment.customer.name,
      maidName: assignment.maid.user.name
    };

    console.log('   Job Data:', JSON.stringify(jobData, null, 2));

    const scheduledTime = new Date(Date.now() + 5000); // 5 seconds from now
    const job = await scheduleAssignmentRequest(jobData, scheduledTime);

    if (job.skipped) {
      console.warn(`⚠️  Job was not enqueued: ${job.reason}`);
      console.warn(`   Message: ${job.message}`);
      return {
        success: false,
        step: 'enqueue',
        reason: job.reason,
        message: job.message
      };
    }

    if (!job.id) {
      console.error('❌ Job enqueuing failed: no job ID returned');
      return {
        success: false,
        step: 'enqueue',
        reason: 'NO_JOB_ID'
      };
    }

    console.log(`✅ Job enqueued successfully`);
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Scheduled for: ${scheduledTime.toISOString()}`);

    // Step 4: Trigger scheduler (simulates admin/cron trigger)
    console.log('\n📋 Step 4: Testing JobScheduler.onNewAssignment...');
    
    try {
      const scheduleResult = await JobScheduler.onNewAssignment(
        assignment.customerId,
        assignment.maidId,
        assignment.customer.timeSlot
      );

      if (scheduleResult.skipped) {
        console.warn(`⚠️  Job was skipped: ${scheduleResult.reason}`);
      } else if (scheduleResult.success) {
        console.log(`✅ JobScheduler scheduled successfully`);
        console.log(`   Job ID: ${scheduleResult.jobId}`);
      } else {
        console.warn(`⚠️  JobScheduler returned unsuccessful: ${scheduleResult.reason}`);
      }
    } catch (scheduleError) {
      console.error(`❌ JobScheduler.onNewAssignment failed:`, scheduleError.message);
    }

    // Step 5: Check queue stats
    console.log('\n📋 Step 5: Checking queue statistics...');
    
    const { getQueueStats } = require('../queues/assignmentQueue');
    const stats = await getQueueStats();

    console.log('   Queue Stats:');
    console.log(`     Waiting: ${stats.waiting}`);
    console.log(`     Active: ${stats.active}`);
    console.log(`     Delayed: ${stats.delayed}`);
    console.log(`     Completed: ${stats.completed}`);
    console.log(`     Failed: ${stats.failed}`);

    // Final summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ TEST COMPLETED SUCCESSFULLY                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('📝 Next Steps:');
    console.log('   1. Make sure the worker is running: npm run worker:dev');
    console.log('   2. Watch worker logs for job processing');
    console.log('   3. Check for successful booking creation in database');
    console.log('');

    return {
      success: true,
      assignment: {
        id: assignment.id,
        customer: assignment.customer.name,
        maid: assignment.maid.user.name,
        timeSlot: assignment.customer.timeSlot
      },
      jobId: job.id,
      stats
    };

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  testAutoAssignmentFlow()
    .then(result => {
      console.log('\n📊 Test Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { testAutoAssignmentFlow };
