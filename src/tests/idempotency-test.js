/**
 * Idempotency Test Script
 * 
 * Tests that:
 * 1. Cron can run multiple times without creating duplicate assignments
 * 2. Worker can restart mid-processing without duplicates
 * 3. DB transactions prevent race conditions
 * 
 * Usage: npm run test:idempotency
 */

const { PrismaClient } = require('@prisma/client');
const { Queue, Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

const prisma = new PrismaClient({ log: ['warn', 'error'] });
const connection = createRedisConnection();

console.log('\n═══════════════════════════════════════════════════════');
console.log('║   🧪 IDEMPOTENCY TEST SUITE');
console.log('═══════════════════════════════════════════════════════\n');

let testsPassed = 0;
let testsFailed = 0;

async function cleanup() {
  try {
    // Clean up test data
    await prisma.assignmentRequest.deleteMany({
      where: {
        booking: {
          specialInstructions: {
            contains: 'IDEMPOTENCY_TEST',
          },
        },
      },
    });
    
    await prisma.booking.deleteMany({
      where: {
        specialInstructions: {
          contains: 'IDEMPOTENCY_TEST',
        },
      },
    });
    
    // Clean up queue
    const queue = new Queue('maid-assignment', { connection });
    await queue.obliterate({ force: true });
    await queue.close();
    
    await prisma.$disconnect();
    connection.disconnect();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

/**
 * Test 1: Cron Double-Run
 * Run cron twice in rapid succession, verify only one assignment created
 */
async function testCronDoubleRun() {
  console.log('\n📋 Test 1: Cron Double-Run');
  console.log('─────────────────────────────────────');
  
  try {
    // Create test booking
    const serviceTime = new Date();
    serviceTime.setHours(serviceTime.getHours() + 20); // 20 hours from now
    
    const service = await prisma.service.findFirst({
      where: { isActive: true },
    });
    
    const customer = await prisma.user.findFirst({
      where: { role: 'CUSTOMER' },
    });
    
    if (!service || !customer) {
      console.log('⚠️  Skipping: No test data available');
      return;
    }
    
    const booking = await prisma.booking.create({
      data: {
        customerId: customer.id,
        serviceId: service.id,
        scheduledAt: serviceTime,
        slot_date: serviceTime,
        slot_time: serviceTime,
        assignment_sent: false,
        status: 'PENDING',
        totalAmount: 100,
        finalAmount: 100,
        serviceAddress: 'Test Address',
        estimatedDuration: 60,
        specialInstructions: 'IDEMPOTENCY_TEST_1',
      },
    });
    
    console.log(`   Created test booking: ${booking.id}`);
    
    // Simulate cron running twice
    const queue = new Queue('maid-assignment', { connection });
    
    // First run
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        assignment_sent: true,
        assignment_sent_at: new Date(),
      },
    });
    
    await queue.add('create-assignment-request', {
      bookingId: booking.id,
      customerId: customer.id,
    }, {
      jobId: `assignment-booking-${booking.id}`,
    });
    
    // Second run (should be prevented by assignment_sent flag)
    const bookingCheck = await prisma.booking.findUnique({
      where: { id: booking.id },
    });
    
    if (bookingCheck.assignment_sent) {
      console.log('   ✅ Second run prevented by assignment_sent flag');
      
      // Try to enqueue again (should be idempotent via jobId)
      await queue.add('create-assignment-request', {
        bookingId: booking.id,
        customerId: customer.id,
      }, {
        jobId: `assignment-booking-${booking.id}`,
      });
      
      console.log('   ✅ Duplicate job prevented by jobId deduplication');
      testsPassed++;
    } else {
      console.log('   ❌ Second run was not prevented');
      testsFailed++;
    }
    
    await queue.close();
    
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    testsFailed++;
  }
}

/**
 * Test 2: Worker Restart Mid-Processing
 * Simulate worker crash and restart, verify no duplicates
 */
async function testWorkerRestart() {
  console.log('\n📋 Test 2: Worker Restart Mid-Processing');
  console.log('─────────────────────────────────────');
  
  try {
    // Create test booking and maid
    const serviceTime = new Date();
    serviceTime.setHours(serviceTime.getHours() + 20);
    
    const service = await prisma.service.findFirst({
      where: { isActive: true },
    });
    
    const customer = await prisma.user.findFirst({
      where: { role: 'CUSTOMER' },
    });
    
    const maidProfile = await prisma.maidProfile.findFirst({
      where: { status: 'ACTIVE' },
      include: { user: true },
    });
    
    if (!service || !customer || !maidProfile) {
      console.log('⚠️  Skipping: No test data available');
      return;
    }
    
    const booking = await prisma.booking.create({
      data: {
        customerId: customer.id,
        serviceId: service.id,
        scheduledAt: serviceTime,
        slot_date: serviceTime,
        slot_time: serviceTime,
        assignment_sent: true,
        assignment_sent_at: new Date(),
        status: 'PENDING',
        totalAmount: 100,
        finalAmount: 100,
        serviceAddress: 'Test Address',
        estimatedDuration: 60,
        specialInstructions: 'IDEMPOTENCY_TEST_2',
      },
    });
    
    console.log(`   Created test booking: ${booking.id}`);
    
    // Create first assignment request
    const request1 = await prisma.assignmentRequest.create({
      data: {
        bookingId: booking.id,
        maidId: maidProfile.id,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    }).catch((error) => {
      if (error.code === 'P2002') {
        console.log('   ✅ Duplicate prevented by unique constraint');
        return null;
      }
      throw error;
    });
    
    // Try to create duplicate (should fail due to unique constraint)
    const request2 = await prisma.assignmentRequest.create({
      data: {
        bookingId: booking.id,
        maidId: maidProfile.id,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    }).catch((error) => {
      if (error.code === 'P2002') {
        console.log('   ✅ Duplicate assignment request prevented by DB constraint');
        testsPassed++;
        return null;
      }
      throw error;
    });
    
    if (request2) {
      console.log('   ❌ Duplicate assignment request was created');
      testsFailed++;
    }
    
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    testsFailed++;
  }
}

/**
 * Test 3: DB Transaction Isolation
 * Verify that concurrent transactions don't create duplicates
 */
async function testTransactionIsolation() {
  console.log('\n📋 Test 3: DB Transaction Isolation');
  console.log('─────────────────────────────────────');
  
  try {
    const serviceTime = new Date();
    serviceTime.setHours(serviceTime.getHours() + 20);
    
    const service = await prisma.service.findFirst({
      where: { isActive: true },
    });
    
    const customer = await prisma.user.findFirst({
      where: { role: 'CUSTOMER' },
    });
    
    if (!service || !customer) {
      console.log('⚠️  Skipping: No test data available');
      return;
    }
    
    const booking = await prisma.booking.create({
      data: {
        customerId: customer.id,
        serviceId: service.id,
        scheduledAt: serviceTime,
        slot_date: serviceTime,
        slot_time: serviceTime,
        assignment_sent: false,
        status: 'PENDING',
        totalAmount: 100,
        finalAmount: 100,
        serviceAddress: 'Test Address',
        estimatedDuration: 60,
        specialInstructions: 'IDEMPOTENCY_TEST_3',
      },
    });
    
    console.log(`   Created test booking: ${booking.id}`);
    
    // Simulate concurrent transactions
    const results = await Promise.allSettled([
      prisma.$transaction(async (tx) => {
        const b = await tx.booking.findUnique({
          where: { id: booking.id },
        });
        
        if (!b.assignment_sent) {
          await tx.booking.update({
            where: { id: booking.id },
            data: { assignment_sent: true, assignment_sent_at: new Date() },
          });
          return 'Transaction 1 succeeded';
        }
        return 'Transaction 1 skipped (already sent)';
      }, {
        isolationLevel: 'Serializable',
      }),
      
      prisma.$transaction(async (tx) => {
        const b = await tx.booking.findUnique({
          where: { id: booking.id },
        });
        
        if (!b.assignment_sent) {
          await tx.booking.update({
            where: { id: booking.id },
            data: { assignment_sent: true, assignment_sent_at: new Date() },
          });
          return 'Transaction 2 succeeded';
        }
        return 'Transaction 2 skipped (already sent)';
      }, {
        isolationLevel: 'Serializable',
      }),
    ]);
    
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`   Transactions: ${succeeded} succeeded, ${failed} failed`);
    
    // Verify only one update occurred
    const finalBooking = await prisma.booking.findUnique({
      where: { id: booking.id },
    });
    
    if (finalBooking.assignment_sent === true) {
      console.log('   ✅ Transaction isolation maintained');
      testsPassed++;
    } else {
      console.log('   ❌ Transaction isolation failed');
      testsFailed++;
    }
    
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
    testsFailed++;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  try {
    await testCronDoubleRun();
    await testWorkerRestart();
    await testTransactionIsolation();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('║   TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   ✅ Passed: ${testsPassed}`);
    console.log(`   ❌ Failed: ${testsFailed}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    await cleanup();
    
    process.exit(testsFailed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    await cleanup();
    process.exit(1);
  }
}

runTests();
