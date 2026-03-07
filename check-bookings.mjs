import { PrismaClient } from '@prisma/client';
import http from 'http';
const prisma = new PrismaClient();

async function main() {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) return console.log('No admin found');

    // Make an HTTP request to /api/bookings if possible, or just look at adminController
    console.log('Skipping HTTP. Looking at the user.id: ', admin.id);
}
main().finally(() => prisma.$disconnect());
