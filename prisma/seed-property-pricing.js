const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Discount configuration — single source of truth
const DURATION_CONFIG = {
  '1month': { multiplier: 1, discount: 0 },
  '3month': { multiplier: 3, discount: 5 },   // 5% savings
  '6month': { multiplier: 6, discount: 10 },   // 10% savings
};

/**
 * Given a monthly base rate, compute the total price for each billing cycle.
 *   1month = monthlyRate × 1
 *   3month = monthlyRate × 3 × 0.95
 *   6month = monthlyRate × 6 × 0.90
 *
 * Values are rounded to 2 decimal places for currency precision.
 */
function computePricing(monthlyRate) {
  const result = {};
  for (const [cycle, { multiplier, discount }] of Object.entries(DURATION_CONFIG)) {
    const total = monthlyRate * multiplier * (1 - discount / 100);
    result[cycle] = Math.round(total * 100) / 100; // round to 2 decimals
  }
  return result;
}

async function seedPropertyPricing() {
  console.log('🌱 Seeding PropertyPricing...');

  // Get the plans
  const plans = await prisma.servicePlan.findMany({
    where: { isActive: true }
  });

  if (plans.length === 0) {
    console.log('❌ No active plans found. Run main seed first.');
    return;
  }

  const touchPlan = plans.find(p => p.name.includes('Touch') || p.name.includes('touch'));
  const luxPlan = plans.find(p => p.name.includes('Lux') || p.name.includes('lux'));

  if (!touchPlan || !luxPlan) {
    console.log('❌ Touch or Lux plan not found');
    return;
  }

  console.log(`Found plans: Touch=${touchPlan.id}, Lux=${luxPlan.id}`);

  // ──────────────────────────────────────────────────
  // Sweepro Touch — monthly base rates per config
  // Note: Only 'apartment' pricing is seeded as verified business data.
  // ──────────────────────────────────────────────────
  const touchPricing = [
    // 2BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1100, sqftLabel: '1000 - 1200 sq ft', pricing: computePricing(5499) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1300, sqftLabel: '1201 - 1400 sq ft', pricing: computePricing(5699) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: computePricing(5899) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: computePricing(6099) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: computePricing(6299) },
    // 3BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1300, sqftLabel: '1200 - 1400 sq ft', pricing: computePricing(6199) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: computePricing(6399) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: computePricing(6599) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: computePricing(6799) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2100, sqftLabel: '2001 - 2200 sq ft', pricing: computePricing(6999) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: computePricing(7199) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: computePricing(7399) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: computePricing(7599) },
    // 4BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: computePricing(6499) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: computePricing(6699) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: computePricing(6899) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2900, sqftLabel: '2801 - 3000 sq ft', pricing: computePricing(7099) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3100, sqftLabel: '3001 - 3200 sq ft', pricing: computePricing(7299) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3300, sqftLabel: '3201 - 3400 sq ft', pricing: computePricing(7499) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3500, sqftLabel: '3401 - 3600 sq ft', pricing: computePricing(7699) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3700, sqftLabel: '3601 - 3800 sq ft', pricing: computePricing(7899) },
  ];

  // ──────────────────────────────────────────────────
  // Sweepro Lux — monthly base rates per config
  // ──────────────────────────────────────────────────
  const luxPricing = [
    // 2BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1100, sqftLabel: '1000 - 1200 sq ft', pricing: computePricing(6499) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1300, sqftLabel: '1201 - 1400 sq ft', pricing: computePricing(6799) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: computePricing(6999) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: computePricing(7299) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: computePricing(7599) },
    // 3BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1300, sqftLabel: '1200 - 1400 sq ft', pricing: computePricing(6899) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: computePricing(7199) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: computePricing(7499) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: computePricing(7799) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2100, sqftLabel: '2001 - 2200 sq ft', pricing: computePricing(8099) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: computePricing(8399) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: computePricing(8699) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: computePricing(8999) },
    // 4BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: computePricing(7999) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: computePricing(8299) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: computePricing(8599) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2900, sqftLabel: '2801 - 3000 sq ft', pricing: computePricing(8899) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3100, sqftLabel: '3001 - 3200 sq ft', pricing: computePricing(9199) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3300, sqftLabel: '3201 - 3400 sq ft', pricing: computePricing(9499) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3500, sqftLabel: '3401 - 3600 sq ft', pricing: computePricing(9799) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3700, sqftLabel: '3601 - 3800 sq ft', pricing: computePricing(10499) },
  ];

  const allPricing = [...touchPricing, ...luxPricing];

  // Print a sample for verification
  console.log('\n📊 Sample pricing (first Touch and first Lux entry):');
  console.log('  Touch 2BHK 1100 sqft:', JSON.stringify(touchPricing[0].pricing));
  console.log('  Lux   3BHK 2700 sqft:', JSON.stringify(luxPricing.find(p => p.bhkType === '3bhk' && p.squareFeet === 2700)?.pricing));

  for (const pricing of allPricing) {
    await prisma.propertyPricing.upsert({
      where: {
        planId_propertyType_bhkType_squareFeet: {
          planId: pricing.planId,
          propertyType: pricing.propertyType,
          bhkType: pricing.bhkType,
          squareFeet: pricing.squareFeet,
        }
      },
      update: {
        sqftLabel: pricing.sqftLabel,
        pricing: pricing.pricing,
      },
      create: pricing,
    });
  }

  console.log(`\n✅ Seeded ${allPricing.length} property pricing records`);
  console.log(`   Touch: ${touchPricing.length} configs`);
  console.log(`   Lux: ${luxPricing.length} configs`);
}

seedPropertyPricing()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });