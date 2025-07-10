const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createBooking = async (req, res) => {
  try {
    // Extract data from request
    const { serviceId, scheduledDate, scheduledTime, notes, address } = req.body;
    const customerId = req.user.id;

    // Validate required fields
    if (!serviceId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ 
        message: 'serviceId, scheduledDate, and scheduledTime are required' 
      });
    }

    // Combine date and time into a single DateTime object
    let scheduledAt;
    try {
      // Directly combine ISO date with time (assuming time is in HH:MM format)
      const timeString = scheduledTime.includes(':') 
        ? scheduledTime 
        : scheduledTime.slice(0, 2) + ':' + scheduledTime.slice(2);
      
      scheduledAt = new Date(`${scheduledDate}T${timeString}:00`);
      
      // Validate the date
      if (isNaN(scheduledAt.getTime())) {
        throw new Error('Invalid date/time');
      }
    } catch (error) {
      return res.status(400).json({ 
        message: 'Invalid scheduledDate or scheduledTime format. Please use YYYY-MM-DD and HH:MM format.' 
      });
    }

    // Get customer profile first
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: customerId }
    });

    if (!customerProfile) {
      return res.status(404).json({
        message: 'Customer profile not found. Please complete your profile first.'
      });
    }

    // Check subscription status using customerProfile.id
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,  // Use customerProfile.id, not user.id
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      include: {
        plan: true
      }
    });

    if (!subscription) {
      return res.status(403).json({
        message: 'You need an active subscription to book a service'
      });
    }

    // Get service details for pricing
    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Create the booking
    const booking = await prisma.booking.create({
      data: {
        customerId,
        serviceId,
        specialInstructions: notes,
        serviceAddress: address,
        status: 'PENDING',
        scheduledAt,
        estimatedDuration: service.baseDuration,
        totalAmount: subscription.plan.finalPrice / (subscription.plan.sessionsPerMonth || 1),
        finalAmount: subscription.plan.finalPrice / (subscription.plan.sessionsPerMonth || 1),
        discount: 0
      },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true
          }
        }
      }
    });

    // Return successful response
    res.status(201).json({
      success: true,
      data: booking,
      message: 'Booking created successfully'
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    
    // Handle Prisma specific errors
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        message: 'A booking conflict occurred' 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
};

const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ message: 'Failed to fetch booking' });
  }
};

const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const bookings = await prisma.booking.findMany({
      where: {
        customerId: userId
      },
      include: {
        service: true,
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ message: 'Failed to fetch user bookings' });
  }
};

const getMaidBookings = async (req, res) => {
  try {
    const maidId = req.user.id;
    const bookings = await prisma.booking.findMany({
      where: {
        maidId: maidId
      },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching maid bookings:', error);
    res.status(500).json({ message: 'Failed to fetch maid bookings' });
  }
};

const   assignMaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { maidId } = req.body;

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        maidId,
        status: 'ASSIGNED'
      },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    res.json(booking);
  } catch (error) {
    console.error('Error assigning maid:', error);
    res.status(500).json({ message: 'Failed to assign maid' });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ message: 'Failed to update booking status' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    res.json(booking);
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Failed to cancel booking' });
  }
};

module.exports = {
  createBooking,
  getAllBookings,
  getBookingById,
  getUserBookings,
  getMaidBookings,
  assignMaid,
  updateBookingStatus,
  cancelBooking
};