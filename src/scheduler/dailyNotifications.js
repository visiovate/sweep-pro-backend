const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function sendDailyNotifications() {
  console.log('Sending daily notifications for service confirmation...');
  try {
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      include: {
        customer: true,
        plan: true
      }
    });

    subscriptions.forEach(subscription => {
      const { email, name } = subscription.customer;
      // Here, replace the console log with an actual notification service call
      console.log(`Sending notification to ${name} (${email}): Confirm your next day service.`);
    });
  } catch (error) {
    console.error('Error sending daily notifications:', error);
  }
}

// Schedule daily notifications at 6 PM
cron.schedule('0 18 * * *', sendDailyNotifications);

