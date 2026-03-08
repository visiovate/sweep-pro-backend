/**
 * Script to create AssignmentRequest records for existing automatic bookings
 * Run this after the fix to bookingCreationCron.js to ensure existing bookings
 * also have assignment requests that maids can accept/reject.
 *
 * Usage: node scripts/createMissingAssignmentRequests.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createMissingAssignmentRequests() {
  console.log('🔍 Finding automatic bookings without assignment requests...\n');

  try {
    // Find automatic bookings without assignment requests that are still pending
    const bookings = await prisma.booking.findMany({
      where: {
        isAutomatic: true,
        scheduledAt: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED'] }
      },
      include: {
        customer: { select: { id: true, name: true, address: true } },
        maid: { select: { id: true, name: true } },
        assignmentRequests: true
      }
    });

    console.log(`📋 Found ${bookings.length} automatic booking(s)\n`);

    let created = 0;
    let skipped = 0;

    for (const booking of bookings) {
      const customerName = booking.customer?.name || 'Unknown';

      // Check if already has an assignment request
      if (booking.assignmentRequests.length > 0) {
        console.log(`⏭️  ${customerName} - already has ${booking.assignmentRequests.length} request(s)`);
        skipped++;
        continue;
      }

      // Check if has a maid assigned
      if (!booking.maidId) {
        console.log(`⏭️  ${customerName} - no maid assigned`);
        skipped++;
        continue;
      }

      // Find the maid profile ID from user ID
      const maidProfile = await prisma.maidProfile.findUnique({
        where: { userId: booking.maidId }
      });

      if (!maidProfile) {
        console.log(`⚠️  ${customerName} - maid profile not found for user ${booking.maidId}`);
        skipped++;
        continue;
      }

      // Calculate expiry time (24 hours from now or 2 hours before service)
      const now = new Date();
      const scheduledAt = new Date(booking.scheduledAt);
      const hoursBeforeService = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      let expiresAt;
      if (hoursBeforeService > 26) { // 24 + 2 = 26
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      } else if (hoursBeforeService > 2) {
        expiresAt = new Date(scheduledAt.getTime() - 2 * 60 * 60 * 1000); // 2 hours before service
      } else {
        console.log(`⚠️  ${customerName} - service is too soon (${hoursBeforeService.toFixed(1)}h), skipping`);
        skipped++;
        continue;
      }

      // Create the assignment request
      const assignmentRequest = await prisma.assignmentRequest.create({
        data: {
          bookingId: booking.id,
          maidId: maidProfile.id,
          status: 'pending',
          expiresAt: expiresAt
        }
      });

      // Update booking to mark assignment sent
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          assignment_sent: true,
          assignment_sent_at: now
        }
      });

      // Create notification for the maid
      try {
        await prisma.notification.create({
          data: {
            userId: booking.maidId,
            type: 'ASSIGNMENT_REQUEST',
            title: 'New Service Assignment Request',
            message: `You have a service assignment for ${customerName} on ${scheduledAt.toLocaleDateString()}. Please respond to accept or reject.`,
            data: {
              bookingId: booking.id,
              assignmentRequestId: assignmentRequest.id,
              serviceAddress: booking.customer?.address,
              scheduledAt: scheduledAt.toISOString(),
              expiresAt: expiresAt.toISOString()
            }
          }
        });
      } catch (notifError) {
        console.warn(`  ⚠️ Failed to send notification: ${notifError.message}`);
      }

      console.log(`✅ ${customerName} - created assignment request (expires: ${expiresAt.toISOString()})`);
      created++;
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📋 Total: ${bookings.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createMissingAssignmentRequests()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
