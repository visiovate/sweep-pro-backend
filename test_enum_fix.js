// Quick test to verify AssignmentStatus enum values
const { PrismaClient } = require('@prisma/client');

async function testEnumValues() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Testing AssignmentStatus enum values...');
    
    // Test query with correct enum values
    const testQuery = await prisma.booking.findMany({
      where: {
        OR: [
          { assignmentStatus: 'REJECTED' },
          { assignmentStatus: 'REASSIGNED' },
          { assignmentStatus: 'PENDING_ASSIGNMENT' },
          { assignmentStatus: 'ASSIGNED_PENDING_RESPONSE' },
          { assignmentStatus: 'ACCEPTED' }
        ]
      },
      take: 1
    });
    
    console.log('✅ Enum values are correct!');
    console.log('📊 Available AssignmentStatus values:');
    console.log('- PENDING_ASSIGNMENT');
    console.log('- ASSIGNED_PENDING_RESPONSE'); 
    console.log('- ACCEPTED');
    console.log('- REJECTED');
    console.log('- REASSIGNED');
    
  } catch (error) {
    console.error('❌ Error testing enum values:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testEnumValues();
