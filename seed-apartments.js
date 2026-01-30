const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const apartments = [
      { name: 'Aparna CyberLife', area: 'Nallagandla', pincode: '500019' },
      { name: 'Aparna HillPark Avenue', area: 'Chandanagar', pincode: '500050' },
      { name: 'Aparna Kanopy Tulip', area: 'Kompally', pincode: '500100' },
      { name: 'Aparna Sarovar Grande', area: 'Nallagandla', pincode: '500019' },
      { name: 'Aparna Serene Park', area: 'Kondapur', pincode: '500084' },
      { name: 'Bollineni Bion', area: 'Kothaguda', pincode: '500084' },
      { name: 'Brigade Citadel', area: 'Moti Nagar', pincode: '500018' },
      { name: 'Cybercity Oriana', area: 'Moosapet', pincode: '500018' },
      { name: 'Fortune Green Homes Sapphire', area: 'Bachupally', pincode: '500090' },
      { name: 'Fortune Sky Villas', area: 'Kokapet', pincode: '500075' },
      { name: 'Godrej Madison Avenue', area: 'Kokapet', pincode: '500075' },
      { name: 'L&T Serene County', area: 'Gachibowli', pincode: '500032' },
      { name: 'Lanco Hills Apartments', area: 'Manikonda', pincode: '500089' },
      { name: 'Lodha Bellezza', area: 'Kukatpally', pincode: '500072' },
      { name: 'Malaysian Township', area: 'Kukatpally', pincode: '500072' },
      { name: 'My Home Abhra', area: 'Madhapur', pincode: '500081' },
      { name: 'My Home Apas', area: 'Kokapet', pincode: '500075' },
      { name: 'My Home Avali', area: 'Gopanpally', pincode: '500075' },
      { name: 'My Home Bhooja', area: 'Hitech City', pincode: '500081' },
      { name: 'My Home Grava', area: 'Kokapet', pincode: '500075' },
      { name: 'My Home Krishe', area: 'Gachibowli', pincode: '500032' },
      { name: 'My Home Mangala', area: 'Kondapur', pincode: '500084' },
      { name: 'My Home Nishada', area: 'Kokapet', pincode: '500075' },
      { name: 'My Home Raka', area: 'Madinaguda', pincode: '500049' },
      { name: 'My Home Sayuk', area: 'Tellapur', pincode: '500019' },
      { name: 'My Home Tridasa', area: 'Tellapur', pincode: '500019' },
      { name: 'My Home Vipina', area: 'Tellapur', pincode: '500019' },
      { name: 'Prestige Beverly Hills', area: 'Kokapet', pincode: '500075' },
      { name: 'Prestige High Fields', area: 'Gachibowli', pincode: '500032' },
      { name: 'Prestige Ivy League', area: 'Hitech City', pincode: '500081' },
      { name: 'Prestige Rainbow Waters', area: 'Gachibowli', pincode: '500032' },
    ];

    // Clear existing apartments
    await prisma.apartment.deleteMany({});
    console.log('Cleared existing apartments');

    // Create new apartments
    const result = await prisma.apartment.createMany({
      data: apartments,
      skipDuplicates: true
    });
    
    console.log(`✅ Seeded ${result.count} apartments successfully!`);

    // Verify
    const allApartments = await prisma.apartment.findMany({
      orderBy: { name: 'asc' }
    });
    
    console.log(`\nTotal apartments in database: ${allApartments.length}`);
    console.log('\nSample apartments:');
    allApartments.slice(0, 5).forEach(apt => {
      console.log(`  ✓ ${apt.name} (${apt.area}, ${apt.pincode})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
