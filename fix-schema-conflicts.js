/**
 * Script to fix data conflicts before schema changes
 * Run with: node fix-schema-conflicts.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking for schema conflict issues...\n');

  // 1. Check for INCOMPLETE booking status
  console.log('=== Step 1: Checking for INCOMPLETE booking status ===');
  try {
    const incompleteBookings = await prisma.$queryRaw`
      SELECT id, status FROM "Booking" WHERE status = 'INCOMPLETE'
    `;

    if (incompleteBookings.length > 0) {
      console.log(`⚠️  Found ${incompleteBookings.length} bookings with INCOMPLETE status`);
      console.log('   Updating to PENDING...');

      await prisma.$executeRaw`
        UPDATE "Booking" SET status = 'PENDING' WHERE status = 'INCOMPLETE'
      `;
      console.log('✅ Fixed INCOMPLETE bookings\n');
    } else {
      console.log('✅ No INCOMPLETE bookings found\n');
    }
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.log('✅ INCOMPLETE status does not exist in database (already removed)\n');
    } else {
      console.log('⚠️  Error checking INCOMPLETE status:', error.message, '\n');
    }
  }

  // 2. Check for duplicate verificationCode in MaidProfile
  console.log('=== Step 2: Checking for duplicate verificationCode ===');
  try {
    const duplicateVerificationCodes = await prisma.$queryRaw`
      SELECT "verificationCode", COUNT(*) as count
      FROM "MaidProfile"
      WHERE "verificationCode" IS NOT NULL
      GROUP BY "verificationCode"
      HAVING COUNT(*) > 1
    `;

    if (duplicateVerificationCodes.length > 0) {
      console.log(`⚠️  Found ${duplicateVerificationCodes.length} duplicate verificationCodes`);
      console.log('   Duplicates:', duplicateVerificationCodes);

      // Fix by generating unique codes for duplicates
      for (const dup of duplicateVerificationCodes) {
        const profiles = await prisma.maidProfile.findMany({
          where: { verificationCode: dup.verificationCode }
        });

        // Keep first one, update others
        for (let i = 1; i < profiles.length; i++) {
          const newCode = generateUniqueCode();
          await prisma.maidProfile.update({
            where: { id: profiles[i].id },
            data: { verificationCode: newCode }
          });
          console.log(`   Updated profile ${profiles[i].id} with new code: ${newCode}`);
        }
      }
      console.log('✅ Fixed duplicate verificationCodes\n');
    } else {
      console.log('✅ No duplicate verificationCodes found\n');
    }
  } catch (error) {
    console.log('⚠️  Error checking verificationCode:', error.message, '\n');
  }

  // 3. Check for duplicate invoiceNumber in Payment
  console.log('=== Step 3: Checking for duplicate invoiceNumber ===');
  try {
    const duplicateInvoices = await prisma.$queryRaw`
      SELECT "invoiceNumber", COUNT(*) as count
      FROM "Payment"
      WHERE "invoiceNumber" IS NOT NULL
      GROUP BY "invoiceNumber"
      HAVING COUNT(*) > 1
    `;

    if (duplicateInvoices.length > 0) {
      console.log(`⚠️  Found ${duplicateInvoices.length} duplicate invoiceNumbers`);
      console.log('   Duplicates:', duplicateInvoices);

      // Fix by generating unique invoice numbers for duplicates
      for (const dup of duplicateInvoices) {
        const payments = await prisma.payment.findMany({
          where: { invoiceNumber: dup.invoiceNumber }
        });

        // Keep first one, update others
        for (let i = 1; i < payments.length; i++) {
          const newInvoice = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
          await prisma.payment.update({
            where: { id: payments[i].id },
            data: { invoiceNumber: newInvoice }
          });
          console.log(`   Updated payment ${payments[i].id} with new invoice: ${newInvoice}`);
        }
      }
      console.log('✅ Fixed duplicate invoiceNumbers\n');
    } else {
      console.log('✅ No duplicate invoiceNumbers found\n');
    }
  } catch (error) {
    console.log('⚠️  Error checking invoiceNumber:', error.message, '\n');
  }

  // 4. Check for NULL verificationCodes that need to be unique
  console.log('=== Step 4: Checking for NULL verificationCodes ===');
  try {
    const nullCodes = await prisma.maidProfile.findMany({
      where: { verificationCode: null }
    });

    if (nullCodes.length > 0) {
      console.log(`ℹ️  Found ${nullCodes.length} MaidProfiles with NULL verificationCode`);
      console.log('   (NULL values are allowed in unique constraints, no action needed)\n');
    } else {
      console.log('✅ All MaidProfiles have verificationCodes\n');
    }
  } catch (error) {
    console.log('⚠️  Error checking NULL verificationCodes:', error.message, '\n');
  }

  console.log('=== Summary ===');
  console.log('All checks complete. You can now safely run:');
  console.log('  npx prisma db push');
  console.log('\nOr for production migrations:');
  console.log('  npx prisma migrate dev --name fix_schema_conflicts');
}

function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
