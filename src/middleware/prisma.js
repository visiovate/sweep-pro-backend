const { getPrismaClient } = require('../utils/database');

// Middleware to attach prisma to request object
const attachPrisma = (req, res, next) => {
  const prisma = getPrismaClient();

  if (!prisma) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  req.prisma = prisma;
  next();
};

module.exports = attachPrisma;
