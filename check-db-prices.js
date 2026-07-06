const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking ServicePlans in the database...");
  const servicePlans = await prisma.servicePlan.findMany();
  console.log("ServicePlans found:");
  console.log(JSON.stringify(servicePlans, null, 2));

  console.log("\nChecking Subscriptions in the database...");
  const subscriptions = await prisma.subscription.findMany({
    include: {
      plan: true,
      customer: {
        include: {
          user: true
        }
      }
    }
  });

  for (const sub of subscriptions) {
    console.log(`User: ${sub.customer.user.email}`);
    console.log(`Plan: ${sub.plan.name}`);
    console.log(`Amount: ${sub.amount}`);
    console.log(`Discount: ${sub.discount}`);
    console.log(`---`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
