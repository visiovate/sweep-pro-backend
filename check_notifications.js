const { getPrismaClient } = require('./src/utils/database');

async function checkNotifications() {
  const prisma = getPrismaClient();
  
  try {
    const count = await prisma.notification.count();
    console.log('Total notifications in DB:', count);
    
    const recent = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { id: true, name: true, role: true } } }
    });
    console.log('Recent notifications:', JSON.stringify(recent, null, 2));
    
    // Check by user roles
    const customerCount = await prisma.notification.count({
      where: { user: { role: 'CUSTOMER' } }
    });
    const adminCount = await prisma.notification.count({
      where: { user: { role: { in: ['ADMIN', 'SUPERVISOR'] } } }
    });
    const maidCount = await prisma.notification.count({
      where: { user: { role: { in: ['MAID', 'FLOATING_MAID'] } } }
    });
    
    console.log('Notifications by role:');
    console.log('  Customers:', customerCount);
    console.log('  Admins:', adminCount);
    console.log('  Maids:', maidCount);
    
  } catch (error) {
    console.error('Error checking notifications:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkNotifications();
