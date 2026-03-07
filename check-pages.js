const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { email: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
    });

    const emails = [
        'lux.bungalow@sweepro.com',
        'lux@sweepro.com',
        'lux.3bhk@sweepro.com',
        'lux.premium@sweepro.com',
        'touch@sweepro.com',
        'touch.1bhk@sweepro.com'
    ];

    console.log('Total users:', users.length);
    emails.forEach(e => {
        const idx = users.findIndex(u => u.email === e);
        const page = Math.floor(idx / 5) + 1;
        console.log(`[${e}] Index: ${idx} -> Page: ${page}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
