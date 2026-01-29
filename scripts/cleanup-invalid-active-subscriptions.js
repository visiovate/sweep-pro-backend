/**
 * CLEANUP SCRIPT: Revert ACTIVE subscriptions without completed payments to PENDING_PAYMENT
 * 
 * This script identifies subscriptions with ACTIVE status that don't have a corresponding
 * COMPLETED payment and reverts them back to PENDING_PAYMENT status.
 * 
 * RULE: Only subscriptions with COMPLETED payments should have ACTIVE status.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupInvalidActiveSubscriptions() {
  try {
    console.log('🔍 Starting cleanup of invalid ACTIVE subscriptions...\n');

    // Find all ACTIVE subscriptions
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: {
        customer: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        },
        payments: {
          where: { status: 'COMPLETED' },
          take: 1
        }
      }
    });

    console.log(`📊 Found ${activeSubscriptions.length} ACTIVE subscriptions\n`);

    // Filter subscriptions without completed payments
    const invalidSubscriptions = activeSubscriptions.filter(sub => sub.payments.length === 0);

    console.log(`⚠️  Found ${invalidSubscriptions.length} ACTIVE subscriptions WITHOUT completed payments\n`);

    if (invalidSubscriptions.length === 0) {
      console.log('✅ All ACTIVE subscriptions have completed payments. No cleanup needed.\n');
      await prisma.$disconnect();
      return;
    }

    // Display subscriptions to be reverted
    console.log('📋 Subscriptions to be reverted to PENDING_PAYMENT:\n');
    invalidSubscriptions.forEach((sub, idx) => {
      console.log(`${idx + 1}. Subscription ID: ${sub.id}`);
      console.log(`   Customer: ${sub.customer?.user?.name || 'Unknown'} (${sub.customer?.user?.email || 'No email'})`);
      console.log(`   Plan ID: ${sub.planId}`);
      console.log(`   Current Amount: ₹${sub.amount}`);
      console.log(`   Status: ${sub.status}`);
      console.log('');
    });

    // Revert invalid subscriptions back to PENDING_PAYMENT
    console.log('🔄 Reverting subscriptions to PENDING_PAYMENT status...\n');

    const updatePromises = invalidSubscriptions.map(sub =>
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'PENDING_PAYMENT',
          updatedAt: new Date()
        }
      })
    );

    const updatedSubscriptions = await Promise.all(updatePromises);

    console.log(`✅ Successfully reverted ${updatedSubscriptions.length} subscriptions to PENDING_PAYMENT\n`);

    // Summary
    console.log('📊 CLEANUP SUMMARY:');
    console.log(`   Total ACTIVE subscriptions checked: ${activeSubscriptions.length}`);
    console.log(`   With completed payments (VALID): ${activeSubscriptions.length - invalidSubscriptions.length}`);
    console.log(`   Without completed payments (INVALID): ${invalidSubscriptions.length}`);
    console.log(`   Reverted to PENDING_PAYMENT: ${updatedSubscriptions.length}\n`);

    console.log('✨ Cleanup completed successfully!\n');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupInvalidActiveSubscriptions();
