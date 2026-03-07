const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const emails = [
        'lux.bungalow@sweepro.com',
        'lux@sweepro.com',
        'lux.3bhk@sweepro.com',
        'lux.premium@sweepro.com',
        'touch@sweepro.com',
        'touch.1bhk@sweepro.com'
    ];

    const users = await prisma.user.findMany({
        where: { email: { in: emails } }
    });

    console.log(`Checking DB for ${emails.length} emails. Found ${users.length} users:`);
    users.forEach(u => {
        console.log(`[FOUND] ${u.email} | Role: ${u.role} | Status: ${u.status} | ID: ${u.id}`);
    });

    const foundEmails = users.map(u => u.email);
    const missing = emails.filter(e => !foundEmails.includes(e));
    if (missing.length > 0) {
        console.log(`[MISSING] ${missing.join(', ')}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
