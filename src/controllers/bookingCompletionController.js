const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const { formatInIST } = require('../utils/timeSlotUtils');

const prisma = getPrismaClient();

/**
 * Booking Completion Controller
 * 
 * Handles marking bookings as completed with QR code verification
 * - Get assigned bookings for maid
 * - Get customer bookings 
 * - Mark booking as completed with QR verification
 */

/**
 * Get assigned bookings for the logged-in maid
 */
const getAssignedBookings = async (req, res) => {
  try {
    console.log(`\n📋 Fetching assigned bookings for maid: ${req.user.name} (${req.user.id})`);

    const bookings = await prisma.booking.findMany({
      where: {
        maidId: req.user.id,
        status: {
          in: ['CONFIRMED', 'IN_PROGRESS']
        },
        assignmentStatus: 'ACCEPTED'
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
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    console.log(`📊 Found ${bookings.length} assigned bookings`);

    // Transform data for frontend
    const transformedBookings = bookings.map(booking => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt,
      scheduledAtIST: formatInIST(booking.scheduledAt),
      timeSlot: booking.timeSlot,
      status: booking.status,
      assignmentStatus: booking.assignmentStatus,
      serviceAddress: booking.serviceAddress,
      serviceLatitude: booking.serviceLatitude,
      serviceLongitude: booking.serviceLongitude,
      totalAmount: booking.totalAmount,
      finalAmount: booking.finalAmount,
      specialInstructions: booking.specialInstructions,
      actualStartTime: booking.actualStartTime,
      actualEndTime: booking.actualEndTime,
      completedAt: booking.completedAt,
      service: {
        id: booking.service.id,
        name: booking.service.name,
        description: booking.service.description,
        category: booking.service.category,
        baseDuration: booking.service.baseDuration
      },
      customer: {
        id: booking.customer.id,
        name: booking.customer.name,
        email: booking.customer.email,
        phone: booking.customer.phone,
        address: booking.customer.address
      }
    }));

    res.json({
      success: true,
      count: transformedBookings.length,
      data: transformedBookings
    });

  } catch (error) {
    console.error('❌ Error fetching assigned bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned bookings',
      error: error.message
    });
  }
};

/**
 * Get customer bookings
 */
const getCustomerBookings = async (req, res) => {
  try {
    console.log(`\n📋 Fetching bookings for customer: ${req.user.name} (${req.user.id})`);

    const bookings = await prisma.booking.findMany({
      where: {
        customerId: req.user.id
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
      },
      orderBy: {
        scheduledAt: 'desc'
      }
    });

    console.log(`📊 Found ${bookings.length} customer bookings`);

    // Transform data for frontend
    const transformedBookings = bookings.map(booking => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt,
      scheduledAtIST: formatInIST(booking.scheduledAt),
      timeSlot: booking.timeSlot,
      status: booking.status,
      assignmentStatus: booking.assignmentStatus,
      serviceAddress: booking.serviceAddress,
      totalAmount: booking.totalAmount,
      finalAmount: booking.finalAmount,
      specialInstructions: booking.specialInstructions,
      actualStartTime: booking.actualStartTime,
      actualEndTime: booking.actualEndTime,
      completedAt: booking.completedAt,
      service: {
        id: booking.service.id,
        name: booking.service.name,
        description: booking.service.description,
        category: booking.service.category,
        baseDuration: booking.service.baseDuration
      },
      maid: booking.maid ? {
        id: booking.maid.id,
        name: booking.maid.name,
        email: booking.maid.email,
        phone: booking.maid.phone
      } : null
    }));

    res.json({
      success: true,
      count: transformedBookings.length,
      data: transformedBookings
    });

  } catch (error) {
    console.error('❌ Error fetching customer bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer bookings',
      error: error.message
    });
  }
};

/**
 * Mark booking as completed with QR code verification
 */
const completeBookingWithQR = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { qrCodeData, completionNotes } = req.body;
    
    console.log(`\n✅ Processing booking completion with QR verification`);
    console.log(`   Booking ID: ${bookingId}`);
    console.log(`   Maid: ${req.user.name} (${req.user.id})`);
    console.log(`   QR Data: ${qrCodeData}`);

    // Validate QR code data (should contain maid ID)
    if (!qrCodeData) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required for verification'
      });
    }

    // Parse QR code data (expecting JSON with maid and booking info)
    let qrData;
    try {
      qrData = JSON.parse(qrCodeData);
    } catch (parseError) {
      // If not JSON, treat as plain maid ID for backward compatibility
      qrData = { maidId: qrCodeData };
    }

    const scannedBookingId = qrData.bookingId || qrData.id;

    if (!scannedBookingId) {
      return res.status(400).json({
        success: false,
        message: 'QR code is missing booking information'
      });
    }

    if (scannedBookingId !== bookingId) {
      return res.status(400).json({
        success: false,
        message: 'QR code does not match this booking'
      });
    }

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        maidId: req.user.id,
        status: {
          in: ['CONFIRMED', 'IN_PROGRESS']
        }
      },
      include: {
        customer: true,
        service: true
      }
    });

    if (!booking) {
      console.log(`❌ Booking not found or not assigned to this maid`);
      return res.status(404).json({
        success: false,
        message: 'Booking not found or not assigned to you'
      });
    }

    if (booking.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        message: 'Service must be started before it can be completed'
      });
    }

    // Get maid profile for verification
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true }
    });

    if (!maidProfile) {
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Verify QR code contains correct maid information
    const expectedMaidId = maidProfile.id;
    const expectedMaidUserId = req.user.id;
    const providedProfileId = qrData.maidProfileId || qrData.maidId || qrData.id || null;
    const providedUserId = qrData.maidUserId || qrData.userId || null;

    const profileMatches = providedProfileId === expectedMaidId;
    const userMatches = providedUserId === expectedMaidUserId || providedUserId === expectedMaidId;

    if (!profileMatches && !userMatches) {
      console.log(`❌ QR code verification failed`);
      console.log(`   Expected profile: ${expectedMaidId} or user: ${expectedMaidUserId}`);
      console.log(`   Provided profile: ${providedProfileId} user: ${providedUserId}`);
      
      return res.status(400).json({
        success: false,
        message: 'QR code verification failed. Please scan your maid ID QR code.'
      });
    }

    console.log(`✅ QR code verified successfully`);

    // Update booking to completed
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'COMPLETED',
        actualEndTime: new Date(),
        completedAt: new Date()
      },
      include: {
        customer: true,
        service: true
      }
    });

    console.log(`✅ Booking marked as completed`);

    // Send notification to customer
    try {
      await prisma.notification.create({
        data: {
          userId: booking.customerId,
          type: 'SERVICE_COMPLETED',
          title: 'Service Completed',
          message: `Your ${booking.service.name} service has been completed by ${req.user.name}. Thank you for choosing our service!`,
          data: {
            bookingId: bookingId,
            maidName: req.user.name,
            serviceName: booking.service.name,
            completedAt: updatedBooking.completedAt,
            qrVerified: true
          }
        }
      });
      console.log(`📧 Completion notification sent to customer`);
    } catch (notifError) {
      console.error(`⚠️  Failed to send notification:`, notifError.message);
    }

    // Update maid's completion statistics
    try {
      await prisma.maidProfile.update({
        where: { userId: req.user.id },
        data: {
          completedBookings: {
            increment: 1
          }
        }
      });
      console.log(`📊 Maid completion statistics updated`);
    } catch (statsError) {
      console.error(`⚠️  Failed to update stats:`, statsError.message);
    }

    res.json({
      success: true,
      message: 'Booking completed successfully with QR verification',
      data: {
        bookingId: updatedBooking.id,
        status: updatedBooking.status,
        completedAt: updatedBooking.completedAt,
        completedAtIST: formatInIST(updatedBooking.completedAt),
        qrVerified: true,
        customer: {
          name: booking.customer.name
        },
        service: {
          name: booking.service.name
        }
      }
    });

  } catch (error) {
    console.error('❌ Error completing booking with QR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete booking',
      error: error.message
    });
  }
};

/**
 * Start booking service (optional - for tracking actual start time)
 */
const startBookingService = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    console.log(`\n🚀 Starting service for booking: ${bookingId}`);

    const updatedBooking = await prisma.booking.update({
      where: { 
        id: bookingId,
        maidId: req.user.id,
        status: 'CONFIRMED'
      },
      data: {
        status: 'IN_PROGRESS',
        actualStartTime: new Date()
      }
    });

    console.log(`✅ Service started for booking: ${bookingId}`);

    res.json({
      success: true,
      message: 'Service started successfully',
      data: {
        bookingId: updatedBooking.id,
        status: updatedBooking.status,
        actualStartTime: updatedBooking.actualStartTime,
        actualStartTimeIST: formatInIST(updatedBooking.actualStartTime)
      }
    });

  } catch (error) {
    console.error('❌ Error starting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service',
      error: error.message
    });
  }
};

/**
 * Generate QR code data for maid
 */
const generateMaidQRCode = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required to generate QR code'
      });
    }

    console.log(`\n🔳 Generating QR code for maid: ${req.user.name} (${req.user.id}) for booking ${bookingId}`);

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        maidId: req.user.id,
        assignmentStatus: 'ACCEPTED'
      },
      include: {
        service: {
          select: {
            id: true,
            name: true
          }
        },
        customer: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(400).json({
        success: false,
        message: 'Booking not found or not assigned to you'
      });
    }

    if (booking.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        message: 'Start the service before generating the completion QR code'
      });
    }

    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!maidProfile) {
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Generate QR code data
    const qrData = {
      type: 'booking_completion',
      bookingId,
      maidId: maidProfile.id,
      maidProfileId: maidProfile.id,
      maidUserId: req.user.id,
      maidName: req.user.name,
      maidEmail: req.user.email,
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'QR code data generated successfully',
      data: {
        qrCodeData: JSON.stringify(qrData),
        maidInfo: {
          id: maidProfile.id,
          userId: req.user.id,
          name: req.user.name,
          email: req.user.email
        },
        booking: {
          id: booking.id,
          status: booking.status,
          serviceName: booking.service?.name,
          customerName: booking.customer?.name
        }
      }
    });
  } catch (error) {
    console.error('❌ Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code',
      error: error.message
    });
  }
};

module.exports = {
  getAssignedBookings,
  getCustomerBookings,
  completeBookingWithQR,
  startBookingService,
  generateMaidQRCode
};