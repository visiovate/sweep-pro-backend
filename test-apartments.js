const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    // Test creating an apartment
    const apartment = await prisma.apartment.create({
      data: {
        name: 'Test Apartment',
        area: 'Test Area',
        pincode: '500001'
      }
    });
    console.log('✅ Apartment created successfully:', apartment);

    // Test fetching apartments
    const apartments = await prisma.apartment.findMany();
    console.log('✅ Apartments fetched:', apartments.length);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
