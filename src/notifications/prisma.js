const { PrismaClient } = require('@prisma/client');

// Reuse the PrismaClient per process.
const prisma = global.__sweeproPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__sweeproPrisma = prisma;
}

module.exports = {
  prisma
};
