const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

  // Pricing data from PaymentOptionsPage.tsx - DEFAULT_BHK_CONFIGS (Sweepro Touch)
  // Note: Only 'apartment' pricing is seeded as verified business data. Other property types remain reserved in schema.
  const touchPricing = [
    // 2BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1100, sqftLabel: '1000 - 1200 sq ft', pricing: { "1month": 5499, "3month": 5299, "6month": 4999 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1300, sqftLabel: '1201 - 1400 sq ft', pricing: { "1month": 5699, "3month": 5499, "6month": 5199 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: { "1month": 5899, "3month": 5699, "6month": 5399 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: { "1month": 6099, "3month": 5899, "6month": 5599 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: { "1month": 6299, "3month": 6099, "6month": 5799 } },
    // 3BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1300, sqftLabel: '1200 - 1400 sq ft', pricing: { "1month": 6199, "3month": 5899, "6month": 5599 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: { "1month": 6399, "3month": 6099, "6month": 5799 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: { "1month": 6599, "3month": 6299, "6month": 5999 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: { "1month": 6799, "3month": 6499, "6month": 6199 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2100, sqftLabel: '2001 - 2200 sq ft', pricing: { "1month": 6999, "3month": 6699, "6month": 6399 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: { "1month": 7199, "3month": 6899, "6month": 6599 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: { "1month": 7399, "3month": 7099, "6month": 6799 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: { "1month": 7599, "3month": 7299, "6month": 6999 } },
    // 4BHK
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: { "1month": 6499, "3month": 6199, "6month": 5999 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: { "1month": 6699, "3month": 6399, "6month": 6199 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: { "1month": 6899, "3month": 6599, "6month": 6399 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2900, sqftLabel: '2801 - 3000 sq ft', pricing: { "1month": 7099, "3month": 6799, "6month": 6599 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3100, sqftLabel: '3001 - 3200 sq ft', pricing: { "1month": 7299, "3month": 6999, "6month": 6799 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3300, sqftLabel: '3201 - 3400 sq ft', pricing: { "1month": 7499, "3month": 7199, "6month": 6999 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3500, sqftLabel: '3401 - 3600 sq ft', pricing: { "1month": 7699, "3month": 7399, "6month": 7199 } },
    { planId: touchPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3700, sqftLabel: '3601 - 3800 sq ft', pricing: { "1month": 7899, "3month": 7599, "6month": 7399 } },
  ];

  // Pricing data from PaymentOptionsPage.tsx - LUX_BHK_CONFIGS (Sweepro Lux)
  const luxPricing = [
    // 2BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1100, sqftLabel: '1000 - 1200 sq ft', pricing: { "1month": 6499, "3month": 5999, "6month": 5599 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1300, sqftLabel: '1201 - 1400 sq ft', pricing: { "1month": 6799, "3month": 6299, "6month": 5899 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: { "1month": 6999, "3month": 6599, "6month": 6199 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: { "1month": 7299, "3month": 6899, "6month": 6499 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '2bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: { "1month": 7599, "3month": 7199, "6month": 6799 } },
    // 3BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1300, sqftLabel: '1200 - 1400 sq ft', pricing: { "1month": 6899, "3month": 6499, "6month": 6199 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1500, sqftLabel: '1401 - 1600 sq ft', pricing: { "1month": 7199, "3month": 6799, "6month": 6499 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1700, sqftLabel: '1601 - 1800 sq ft', pricing: { "1month": 7499, "3month": 7099, "6month": 6799 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 1900, sqftLabel: '1801 - 2000 sq ft', pricing: { "1month": 7799, "3month": 7399, "6month": 7099 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2100, sqftLabel: '2001 - 2200 sq ft', pricing: { "1month": 8099, "3month": 7699, "6month": 7399 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: { "1month": 8399, "3month": 7999, "6month": 7699 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: { "1month": 8699, "3month": 8299, "6month": 7999 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '3bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: { "1month": 8999, "3month": 8599, "6month": 8299 } },
    // 4BHK
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2300, sqftLabel: '2201 - 2400 sq ft', pricing: { "1month": 7999, "3month": 7599, "6month": 7199 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2500, sqftLabel: '2401 - 2600 sq ft', pricing: { "1month": 8299, "3month": 7899, "6month": 7499 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2700, sqftLabel: '2601 - 2800 sq ft', pricing: { "1month": 8599, "3month": 8199, "6month": 7799 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 2900, sqftLabel: '2801 - 3000 sq ft', pricing: { "1month": 8899, "3month": 8499, "6month": 8099 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3100, sqftLabel: '3001 - 3200 sq ft', pricing: { "1month": 9199, "3month": 8799, "6month": 8399 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3300, sqftLabel: '3201 - 3400 sq ft', pricing: { "1month": 9499, "3month": 9099, "6month": 8699 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3500, sqftLabel: '3401 - 3600 sq ft', pricing: { "1month": 9799, "3month": 9399, "6month": 8999 } },
    { planId: luxPlan.id, propertyType: 'apartment', bhkType: '4bhk', squareFeet: 3700, sqftLabel: '3601 - 3800 sq ft', pricing: { "1month": 10499, "3month": 9899, "6month": 9399 } },
  ];

  const allPricing = [...touchPricing, ...luxPricing];

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

  console.log(`✅ Seeded ${allPricing.length} property pricing records`);
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