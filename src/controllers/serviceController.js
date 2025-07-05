const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new service
const createService = async (req, res) => {
  try {
    const { name, description, price, duration, category } = req.body;
    const service = await prisma.service.create({
      data: {
        name,
        description,
        price,
        duration,
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
      where: { id: parseInt(id) }
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
    const { name, description, price, duration, category } = req.body;
    const service = await prisma.service.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        price,
        duration,
        category
      }
    });
    res.json(service);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
};

// Delete service
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.service.delete({
      where: { id: parseInt(id) }
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting service:', error);
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