const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');
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

    // Get or create customer profile
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: customerId }
    });

    if (!customerProfile) {
      // Create customer profile if it doesn't exist
      customerProfile = await prisma.customerProfile.create({
        data: {
          userId: customerId,
          preferences: {},
          emergencyContact: null
        }
      });
    }

    // Check subscription status using customerProfile.id
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      include: {
        plan: true
      }
    });

    // Get service details for pricing
    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    let bookingData, responseMessage;

    if (subscription) {
      // Customer has active subscription - no payment required
      bookingData = {
        customerId,
        serviceId,
        specialInstructions: notes,
        serviceAddress: address,
        status: 'CONFIRMED', // Direct confirmation for subscription customers
        scheduledAt,
        estimatedDuration: service.baseDuration,
        totalAmount: 0, // No amount for subscription customers
        finalAmount: 0,
        discount: 0
      };
      responseMessage = 'Booking created successfully. No additional payment required as you have an active subscription.';
    } else {
      // Customer doesn't have active subscription - payment required
      bookingData = {
        customerId,
        serviceId,
        specialInstructions: notes,
        serviceAddress: address,
        status: 'PENDING', // Pending until payment is completed
        scheduledAt,
        estimatedDuration: service.baseDuration,
        totalAmount: service.basePrice,
        finalAmount: service.basePrice,
        discount: 0
      };
      responseMessage = 'Booking created successfully. Please complete the payment to confirm your booking.';
    }

    // Create the booking
    const booking = await prisma.booking.create({
      data: bookingData,
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

    // If no subscription, create a payment record
    let paymentData = null;
    if (!subscription) {
      paymentData = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          customerId,
          amount: service.basePrice,
          discount: 0,
          tax: 0,
          finalAmount: service.basePrice,
          paymentMethod: 'CARD', // Default, will be updated when payment is made
          status: 'PENDING',
          paymentType: 'BOOKING'
        }
      });
    }

    // Send notification
    await notificationService.notifyBookingCreated(booking);

    // Return successful response
    res.status(201).json({
      success: true,
      data: {
        booking,
        payment: paymentData,
        hasActiveSubscription: !!subscription
      },
      message: responseMessage
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

    // Send notification
    await notificationService.notifyMaidAssigned(booking);

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
      data: { 
        status,
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
        ...(status === 'IN_PROGRESS' && { actualStartTime: new Date() })
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

    // Send notifications based on status
    if (status === 'COMPLETED') {
      await notificationService.notifyServiceCompleted(booking);
    } else if (status === 'IN_PROGRESS') {
      await notificationService.notifyServiceStarted(booking);
    } else {
      await notificationService.notifyBookingStatusChange(booking, status);
    }

    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ message: 'Failed to update booking status' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Cancelled by user' } = req.body;
    
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

    // Send notification
    await notificationService.notifyBookingCancellation(booking, reason);

    res.json(booking);
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Failed to cancel booking' });
  }
};

// Complete booking payment and confirm booking
const completeBookingPayment = async (req, res) => {
  try {
    const { bookingId, paymentId, transactionId, gateway, gatewayResponse } = req.body;
    const userId = req.user.id;

    if (!bookingId || !paymentId || !transactionId) {
      return res.status(400).json({ 
        error: 'Missing required fields: bookingId, paymentId, transactionId' 
      });
    }

    // Verify payment belongs to user and booking
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
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
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.customerId !== userId || payment.bookingId !== bookingId) {
      return res.status(403).json({ error: 'Unauthorized access to payment' });
    }

    if (payment.booking.customerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to booking' });
    }

    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        transactionId,
        gateway,
        gatewayResponse
      }
    });

    // Update booking status to CONFIRMED
    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED'
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
        payment: true
      }
    });

    res.json({
      success: true,
      message: 'Booking payment completed and booking confirmed successfully',
      booking
    });

  } catch (error) {
    console.error('Error completing booking payment:', error);
    res.status(500).json({ error: 'Failed to complete booking payment' });
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
  cancelBooking,
  completeBookingPayment
};
