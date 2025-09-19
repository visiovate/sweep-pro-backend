const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Middleware to attach prisma to request object
const attachPrisma = (req, res, next) => {
  req.prisma = prisma;
  next();
};

module.exports = attachPrisma;
