const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Given per-month rates for 1, 3, and 6 months from the official rate cards,
 * compute the total price for each billing cycle.
 *   1month = m1 × 1
 *   3month = m3 × 3
 *   6month = m6 × 6
 */
function makePricing(m1, m3, m6) {
  return {
    '1month': m1 * 1,
    '3month': m3 * 3,
    '6month': m6 * 6
  };
}

async function seedPropertyPricing() {
  console.log('🌱 Seeding PropertyPricing with official rate cards...');

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
  // SWEEPRO TOUCH — Official Rate Card
  // ──────────────────────────────────────────────────
  const touchPricing = [
    // 2BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1100, sqftLabel: '1000 - 1200 sq ft', pricing: makePricing(5499, 5299, 4999) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1300, sqftLabel: '1201 - 1400 sq ft', pricing: makePricing(5699, 5499, 5199) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: makePricing(5899, 5699, 5399) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: makePricing(6099, 5899, 5599) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: makePricing(6299, 6099, 5799) },
    // 3BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1300, sqftLabel: '1200 - 1400 sq ft', pricing: makePricing(6199, 5899, 5599) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: makePricing(6399, 6099, 5799) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: makePricing(6599, 6299, 5999) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: makePricing(6799, 6499, 6199) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2100, sqftLabel: '2001 - 2200 sq ft', pricing: makePricing(6999, 6699, 6399) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: makePricing(7199, 6899, 6599) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: makePricing(7399, 7099, 6799) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: makePricing(7599, 7299, 6999) },
    // 4BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: makePricing(6499, 6199, 5999) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: makePricing(6699, 6399, 6199) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: makePricing(6899, 6599, 6399) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2900, sqftLabel: '2801 - 3000 sq ft', pricing: makePricing(7099, 6799, 6599) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3100, sqftLabel: '3001 - 3200 sq ft', pricing: makePricing(7299, 6999, 6799) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3300, sqftLabel: '3201 - 3400 sq ft', pricing: makePricing(7499, 7199, 6999) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3500, sqftLabel: '3401 - 3600 sq ft', pricing: makePricing(7699, 7399, 7199) },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3700, sqftLabel: '3601 - 3800 sq ft', pricing: makePricing(7899, 7599, 7399) },
  ];

  // ──────────────────────────────────────────────────
  // SWEEPRO LUX — Official Rate Card
  // ──────────────────────────────────────────────────
  const luxPricing = [
    // 2BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1100, sqftLabel: '1000 - 1200 sq ft', pricing: makePricing(6499, 5999, 5599) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1300, sqftLabel: '1201 - 1400 sq ft', pricing: makePricing(6799, 6299, 5899) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: makePricing(6999, 6599, 6199) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: makePricing(7299, 6899, 6499) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: makePricing(7599, 7199, 6799) },
    // 3BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1300, sqftLabel: '1200 - 1400 sq ft', pricing: makePricing(6899, 6499, 6199) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: makePricing(7199, 6799, 6499) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: makePricing(7499, 7099, 6799) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: makePricing(7799, 7399, 7099) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2100, sqftLabel: '2001 - 2200 sq ft', pricing: makePricing(8099, 7699, 7399) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: makePricing(8399, 7999, 7699) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: makePricing(8699, 8299, 7999) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: makePricing(8999, 8599, 8299) },
    // 4BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: makePricing(7999, 7599, 7199) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: makePricing(8299, 7899, 7499) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: makePricing(8599, 8199, 7799) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2900, sqftLabel: '2801 - 3000 sq ft', pricing: makePricing(8899, 8499, 8099) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3100, sqftLabel: '3001 - 3200 sq ft', pricing: makePricing(9199, 8799, 8399) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3300, sqftLabel: '3201 - 3400 sq ft', pricing: makePricing(9499, 9099, 8699) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3500, sqftLabel: '3401 - 3600 sq ft', pricing: makePricing(9799, 9399, 8999) },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3700, sqftLabel: '3601 - 3800 sq ft', pricing: makePricing(10499, 9899, 9399) },
  ];

  const allPricing = [...touchPricing, ...luxPricing];

  // Print a sample for verification
  console.log('\n📊 Sample pricing (first Touch and Lux 3BHK 2700 sqft):');
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