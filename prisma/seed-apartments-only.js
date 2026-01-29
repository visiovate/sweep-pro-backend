const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding apartments...');

  const apartments = [
    { name: 'Aparna Apartment', area: 'Hyderabad', pincode: '500001' },
    { name: 'My Home Heights', area: 'Banjara Hills', pincode: '500034' },
    { name: 'Prestige Towers', area: 'Jubilee Hills', pincode: '500033' },
    { name: 'Green Valley Complex', area: 'Madhapur', pincode: '500081' },
    { name: 'Lanco Hills Apartments', area: 'Manikonda', pincode: '500089' },
    { name: 'Sobha Citadel', area: 'Gachibowli', pincode: '500032' },
    { name: 'Mahagun Moderne', area: 'Sector 78', pincode: '500022' },
    { name: 'DLF Prime', area: 'Whitefield', pincode: '500090' },
    { name: 'Mahindra Lifespaces', area: 'Kandivali', pincode: '500050' },
    { name: 'Kolte Patil Ivy', area: 'Yadagirigutta', pincode: '500045' },
    { name: 'Rustomjee Urbania', area: 'Vikhroli', pincode: '500025' },
    { name: 'Lodha Splendour', area: 'Mahalaxmi', pincode: '500015' },
    { name: 'Oberoi Realty', area: 'Worli', pincode: '500018' },
    { name: 'Godrej Properties', area: 'Vikhroli', pincode: '500030' },
    { name: 'Shapoorji Pallonji', area: 'Kala Ghoda', pincode: '500017' },
    { name: 'HDFC Housing', area: 'Aundh', pincode: '500080' },
    { name: 'Brigade Group', area: 'Koramangala', pincode: '500084' },
    { name: 'Sattva Group', area: 'Indiranagar', pincode: '500083' },
    { name: 'Divyasree', area: 'Marathahalli', pincode: '500082' },
    { name: 'Concorde Pinnacle', area: 'Whitefield', pincode: '500088' },
    { name: 'Purva Palm Beach', area: 'Sarjapur', pincode: '500086' },
    { name: 'Mphasis IT Park', area: 'Electronic City', pincode: '500087' },
    { name: 'Embassy Tech Square', area: 'Kalyani Nagar', pincode: '500085' },
    { name: 'Salarpuria Sattva', area: 'Varthur', pincode: '500089' },
    { name: 'PACE IT Park', area: 'Whitefield', pincode: '500090' },
    { name: 'Ascendas IT Park', area: 'Whitefield', pincode: '500092' },
    { name: 'Prestige Tech Park', area: 'Whitefield', pincode: '500095' },
    { name: 'Golden Apartments', area: 'Fort', pincode: '500003' },
    { name: 'Silver Heights', area: 'Bandra', pincode: '500007' },
    { name: 'Pearl Residency', area: 'Andheri', pincode: '500009' },
    { name: 'Diamond Plaza', area: 'Versova', pincode: '500010' },
  ];

  await prisma.apartment.deleteMany({});
  for (const apartment of apartments) {
    await prisma.apartment.create({ data: apartment });
  }

  console.log(`✅ Seeded ${apartments.length} apartments successfully!`);
}

main()
  .catch(e => {
    console.error('Error seeding apartments:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
