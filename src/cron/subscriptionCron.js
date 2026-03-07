/**
 * Subscription Management Cron Job
 * 
 * Handles subscription renewals, buffer periods, and cycle management
 * Runs daily at midnight UTC
 * 
 * Command: node src/cron/subscriptionCron.js
 */

const { initializePrisma, getPrismaClient, disconnectDatabase } = require("../utils/database");
// const { PrismaClient } = require('@prisma/client');
const { retryPrismaOperation, withTimeout } = require('../utils/retryUtils');

const CRON_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function runCron() {
  const startTime = Date.now();
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('║   💳 SUBSCRIPTION MANAGEMENT CRON JOB');
  console.log(`║   Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════\n');

  let stats = {
    buffersActivated: 0,
    buffersCompleted: 0,
    subscriptionsRenewed: 0,
    errors: 0,
  };

  try {
    // Initialize Prisma database connection
    await initializePrisma();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Activate buffer periods that should start today
    console.log('📅 Checking buffer period activations...');
    const buffersToActivate = await retryPrismaOperation(
      () => getPrismaClient().bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          startDate: { lte: today },
          isAutomatic: true,
        },
        include: {
          subscription: true,
        },
      }),
      'Find buffers to activate'
    );

    for (const buffer of buffersToActivate) {
      try {
        await retryPrismaOperation(
          () => getPrismaClient().subscription.update({
            where: { id: buffer.subscriptionId },
            data: {
              isInBufferPeriod: true,
              bufferStartDate: buffer.startDate,
              bufferEndDate: buffer.endDate,
            },
          }),
          `Activate buffer for subscription ${buffer.subscriptionId}`
        );

        stats.buffersActivated++;
        console.log(`✅ Activated buffer period for subscription ${buffer.subscriptionId}`);
      } catch (error) {
        stats.errors++;
        console.error(`❌ Failed to activate buffer ${buffer.id}:`, error.message);
      }
    }

    // 2. Complete buffer periods that should end today
    console.log('📅 Checking buffer period completions...');
    const buffersToComplete = await retryPrismaOperation(
      () => getPrismaClient().bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { lte: today },
        },
        include: {
          subscription: true,
        },
      }),
      'Find buffers to complete'
    );

    for (const buffer of buffersToComplete) {
      try {
        await retryPrismaOperation(
          () => getPrismaClient().$transaction(async (tx) => {
            await tx.bufferPeriod.update({
              where: { id: buffer.id },
              data: {
                status: 'COMPLETED',
                resumedAt: today,
              },
            });

            await tx.subscription.update({
              where: { id: buffer.subscriptionId },
              data: {
                isInBufferPeriod: false,
                bufferStartDate: null,
                bufferEndDate: null,
              },
            });
          }),
          `Complete buffer for subscription ${buffer.subscriptionId}`
        );

        stats.buffersCompleted++;
        console.log(`✅ Completed buffer period for subscription ${buffer.subscriptionId}`);
      } catch (error) {
        stats.errors++;
        console.error(`❌ Failed to complete buffer ${buffer.id}:`, error.message);
      }
    }

    // 3. Process subscription renewals
    console.log('📅 Checking subscription renewals...');
    const subscriptionsToRenew = await retryPrismaOperation(
      () => getPrismaClient().subscription.findMany({
        where: {
          status: 'ACTIVE',
          autoRenew: true,
          endDate: { lte: today },
        },
        include: {
          plan: true,
          customer: true,
        },
      }),
      'Find subscriptions to renew'
    );

    for (const subscription of subscriptionsToRenew) {
      try {
        const newEndDate = new Date(subscription.endDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1); // Add 1 month

        await retryPrismaOperation(
          () => getPrismaClient().subscription.update({
            where: { id: subscription.id },
            data: {
              startDate: subscription.endDate,
              endDate: newEndDate,
              totalCycles: { increment: 1 },
              lastRenewalDate: today,
            },
          }),
          `Renew subscription ${subscription.id}`
        );

        stats.subscriptionsRenewed++;
        console.log(`✅ Renewed subscription ${subscription.id}`);
      } catch (error) {
        stats.errors++;
        console.error(`❌ Failed to renew subscription ${subscription.id}:`, error.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('║   ✅ CRON JOB COMPLETED');
    console.log(`║   Duration: ${duration}ms`);
    console.log(`║   Buffers Activated: ${stats.buffersActivated}`);
    console.log(`║   Buffers Completed: ${stats.buffersCompleted}`);
    console.log(`║   Subscriptions Renewed: ${stats.subscriptionsRenewed}`);
    console.log(`║   Errors: ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════════\n');

    await disconnectDatabase();
    process.exit(0);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n═══════════════════════════════════════════════════════');
    console.error('║   ❌ CRON JOB FAILED');
    console.error(`║   Duration: ${duration}ms`);
    console.error(`║   Error: ${error.message}`);
    console.error('═══════════════════════════════════════════════════════\n');

    await disconnectDatabase();
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(143);
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(130);
});

withTimeout(() => runCron(), CRON_TIMEOUT_MS, 'Subscription cron')
  .catch(async (error) => {
    console.error('❌ Cron timeout or fatal error:', error);
    await disconnectDatabase();
    process.exit(1);
  });
