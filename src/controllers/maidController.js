const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all maids
const getAllMaids = async (req, res) => {
  try {
    const maids = await prisma.user.findMany({
      where: { role: 'MAID' },
      include: { maidProfile: true }
    });
    res.json(maids);
  } catch (error) {
    console.error('Error fetching maids:', error);
    res.status(500).json({ error: 'Failed to fetch maids' });
  }
};

// Get a maid by ID
const getMaidById = async (req, res) => {
  try {
    const { id } = req.params;
    const maid = await prisma.user.findUnique({
      where: { id },
      include: { maidProfile: true }
    });
    if (!maid || maid.role !== 'MAID') {
      return res.status(404).json({ error: 'Maid not found' });
    }
    res.json(maid);
  } catch (error) {
    console.error('Error fetching maid:', error);
    res.status(500).json({ error: 'Failed to fetch maid' });
  }
};

// Update maid profile (skills, languages, availability, zone)
const updateMaidProfile = async (req, res) => {
  try {
    const maidId = req.user.id;
    const { skills, languages, availability, zone } = req.body;
    const maid = await prisma.maidProfile.update({
      where: { userId: maidId },
      data: { skills, languages, availability, zone }
    });
    res.json(maid);
  } catch (error) {
    console.error('Error updating maid profile:', error);
    res.status(500).json({ error: 'Failed to update maid profile' });
  }
};

// Update maid status (admin only)
const updateMaidStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const maid = await prisma.maidProfile.update({
      where: { userId: id },
      data: { status }
    });
    res.json(maid);
  } catch (error) {
    console.error('Error updating maid status:', error);
    res.status(500).json({ error: 'Failed to update maid status' });
  }
};

// Delete maid (admin only)
const deleteMaid = async (req, res) => {
  try {
    const { id } = req.params;
    // Delete maid profile first due to FK constraint
    await prisma.maidProfile.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Maid deleted successfully' });
  } catch (error) {
    console.error('Error deleting maid:', error);
    res.status(500).json({ error: 'Failed to delete maid' });
  }
};

module.exports = {
  getAllMaids,
  getMaidById,
  updateMaidProfile,
  updateMaidStatus,
  deleteMaid
}; 