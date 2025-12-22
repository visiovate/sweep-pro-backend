const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const TOUCH_PLAN_ID = 'sweepro-touch-plan';
  const LUX_PLAN_ID = 'sweepro-lux-plan';

  const LEGACY_PLAN_IDS = ['basic-plan', 'premium-plan', 'standard-plan'];

  console.log('🔄 Migrating subscription plans to only SweepPro Touch/Lux...');

  const touchPlan = await prisma.servicePlan.findUnique({ where: { id: TOUCH_PLAN_ID } });
  const luxPlan = await prisma.servicePlan.findUnique({ where: { id: LUX_PLAN_ID } });

  if (!touchPlan || !luxPlan) {
    throw new Error(
      `Missing required ServicePlan(s). Found touch=${!!touchPlan}, lux=${!!luxPlan}. Ensure these plans exist before migration.`
    );
  }

  // 1) Any subscription using buffer fields must be on Lux (buffer system is Lux-only)
  const bufferToLux = await prisma.subscription.updateMany({
    where: {
      OR: [
        { isInBufferPeriod: true },
        { bufferDaysCount: { gt: 0 } },
        { bufferDaysUsed: { gt: 0 } },
        { bufferStartDate: { not: null } },
        { bufferEndDate: { not: null } }
      ]
    },
    data: {
      planId: LUX_PLAN_ID
    }
  });

  console.log(`✅ Subscriptions forced to Lux due to buffer usage: ${bufferToLux.count}`);

  // 2) Map legacy plans to the 2 remaining plans
  const basicStandardToTouch = await prisma.subscription.updateMany({
    where: {
      planId: { in: ['basic-plan', 'standard-plan'] }
    },
    data: { planId: TOUCH_PLAN_ID }
  });

  const premiumToLux = await prisma.subscription.updateMany({
    where: {
      planId: { in: ['premium-plan'] }
    },
    data: { planId: LUX_PLAN_ID }
  });

  console.log(`✅ Subscriptions migrated basic/standard -> Touch: ${basicStandardToTouch.count}`);
  console.log(`✅ Subscriptions migrated premium -> Lux: ${premiumToLux.count}`);

  // 3) Safety check: confirm no subscriptions still point to legacy plan IDs
  const remainingLegacyCount = await prisma.subscription.count({
    where: {
      planId: { in: LEGACY_PLAN_IDS }
    }
  });

  if (remainingLegacyCount > 0) {
    throw new Error(
      `Migration aborted before deleting legacy plans: ${remainingLegacyCount} subscriptions still reference legacy plan IDs.`
    );
  }

  // 4) Delete legacy plans (now safe)
  const deleted = await prisma.servicePlan.deleteMany({
    where: {
      id: { in: LEGACY_PLAN_IDS }
    }
  });

  console.log(`🗑️ Deleted legacy service plans: ${deleted.count}`);
  console.log('✅ Migration complete. Only sweepro-touch-plan and sweepro-lux-plan remain as subscription plans.');
}

main()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
