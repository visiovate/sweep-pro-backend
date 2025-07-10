const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new service
const createService = async (req, res) => {
  try {
    const { name, description, basePrice, baseDuration, category } = req.body;
    
    // Validate required fields
    if (!name || !description || !basePrice || !baseDuration || !category) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, description, basePrice, baseDuration, category' 
      });
    }
    
    // Validate category enum
    const validCategories = ['CLEANING', 'DEEP_CLEANING', 'MAINTENANCE', 'SPECIAL_EVENT'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        error: 'Invalid category. Must be one of: CLEANING, DEEP_CLEANING, MAINTENANCE, SPECIAL_EVENT' 
      });
    }
    
    const service = await prisma.service.create({
      data: {
        name,
        description,
        basePrice: parseFloat(basePrice),
        baseDuration: parseInt(baseDuration),
        category
      }
    });
    res.status(201).json(service);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
};

// Get all services
const getAllServices = async (req, res) => {
  try {
    const services = await prisma.service.findMany();
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};

// Get service by ID
const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await prisma.service.findUnique({
      where: { id: id }
    });
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
};

// Update service
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, basePrice, baseDuration, category, isActive } = req.body;
    
    // Validate category enum if provided
    if (category) {
      const validCategories = ['CLEANING', 'DEEP_CLEANING', 'MAINTENANCE', 'SPECIAL_EVENT'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ 
          error: 'Invalid category. Must be one of: CLEANING, DEEP_CLEANING, MAINTENANCE, SPECIAL_EVENT' 
        });
      }
    }
    
    // Build update data object, only including provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (basePrice !== undefined) updateData.basePrice = parseFloat(basePrice);
    if (baseDuration !== undefined) updateData.baseDuration = parseInt(baseDuration);
    if (category !== undefined) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    
    const service = await prisma.service.update({
      where: { id: id },
      data: updateData
    });
    res.json(service);
  } catch (error) {
    console.error('Error updating service:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.status(500).json({ error: 'Failed to update service' });
  }
};

// Delete service
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.service.delete({
      where: { id: id }
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting service:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.status(500).json({ error: 'Failed to delete service' });
  }
};

module.exports = {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService
}; 