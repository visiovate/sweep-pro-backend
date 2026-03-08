const { getPrismaClient } = require('../utils/database');

// Use the singleton PrismaClient from database utility to avoid connection pool exhaustion
const prisma = getPrismaClient();

module.exports = {
  prisma
};
