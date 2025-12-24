const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bookingDeduplicationService = require('../services/bookingDeduplicationService');
const { queueRejectedAssignment } = require('../queues/adminReassignQueue');
const { isDateOnWeeklyOff } = require('../utils/weekdayUtils');

// Create automatic booking for customer
const createAutomaticBooking = async (req, res) => {
  try {
    const { customerId, serviceId, scheduledDate, notes } = req.body;

    console.log('🔄 Creating automatic booking:', {
      customerId,
      serviceId,
      scheduledDate,
      notes
    });

    // Get customer with their assigned maid
    const customerAssignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: customerId,
        isActive: true
      },
      include: {
        customer: true,
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    if (!customerAssignment) {
      return res.status(404).json({
        success: false,
        message: 'No active maid assignment found for this customer'
      });
    }

    // Get service details
    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check for duplicate booking request using Redis
    const isDuplicate = await bookingDeduplicationService.isDuplicate(
      customerId,
      customerAssignment.maidId,
      scheduledDate
    );

    if (isDuplicate) {
      console.log(`🚫 Duplicate booking request prevented for customer ${customerId} with maid ${customerAssignment.maidId} on ${scheduledDate}`);
      return res.status(409).json({
        success: false,
        message: 'Booking request already sent to this maid for the selected date. Please wait for the maid to respond.',
        isDuplicate: true
      });
    }

    // Check if customer is in buffer period (Lux plan only)
    const subscription = await prisma.subscription.findFirst({
      where: {
        status: 'ACTIVE',
        customer: {
          userId: customerId
        }
      },
      include: {
        plan: {
          select: {
            hasBufferSystem: true
          }
        }
      }
    });

    if (subscription?.plan?.hasBufferSystem) {
      const now = new Date();
      const activeBuffer = await prisma.bufferPeriod.findFirst({
        where: {
          subscription: {
            customer: {
              userId: customerId
            }
          },
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
          OR: [
            { isAutomatic: true },
            {
              notes: {
                contains: 'STATUS: APPROVED'
              }
            }
          ]
        }
      });

      if (activeBuffer) {
        return res.status(409).json({
          success: false,
          message: 'Customer is in buffer period. Automatic bookings are paused.',
          bufferInfo: {
            reason: activeBuffer.reason,
            endDate: activeBuffer.endDate
          }
        });
      }
    }

    const bookingDate = new Date(scheduledDate);
    const maidOnWeeklyOff = isDateOnWeeklyOff(bookingDate, customerAssignment.maid?.weeklyOffDay);
    const maidUnavailable = customerAssignment.maid?.availability && customerAssignment.maid.availability.isAvailable === false;
    let booking;
    if (maidOnWeeklyOff || maidUnavailable) {
      const reason = maidOnWeeklyOff ? 'MAID_ON_LEAVE' : 'Maid unavailable';
      booking = await prisma.booking.create({
        data: {
          customerId: customerId,
          maidId: null,
          serviceId: serviceId,
          scheduledAt: bookingDate,
          timeSlot: customerAssignment.customer.timeSlot || 'morning',
          status: 'CANCELLED',
          assignmentStatus: 'REJECTED',
          rejectionReason: reason,
          totalAmount: service.basePrice,
          specialInstructions: notes || `Automatic booking for ${service.name}`,
          isAutomatic: true
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              timeSlot: true
            }
          },
          service: true
        }
      });
      await queueRejectedAssignment({
        bookingId: booking.id,
        maidId: customerAssignment.maidId,
        rejectionReason: reason,
        customerId: customerId
      });
      await bookingDeduplicationService.markAsProcessed(
        customerId,
        customerAssignment.maidId,
        scheduledDate,
        48 * 60 * 60
      );
      return res.status(201).json({
        success: true,
        message: maidOnWeeklyOff ? 'Maid is on weekly leave. Booking queued for admin reassignment' : 'Maid unavailable. Booking queued for admin reassignment',
        data: { booking }
      });
    } else {
      booking = await prisma.booking.create({
        data: {
          customerId: customerId,
          maidId: customerAssignment.maid.user.id,
          serviceId: serviceId,
          scheduledAt: new Date(scheduledDate),
          timeSlot: customerAssignment.customer.timeSlot || 'morning',
          status: 'PENDING',
          assignmentStatus: 'PENDING_ASSIGNMENT',
          totalAmount: service.basePrice,
          specialInstructions: notes || `Automatic booking for ${service.name}`,
          isAutomatic: true
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              timeSlot: true
            }
          },
          service: true
        }
      });
    }

    console.log('📅 Automatic booking created:', booking.id);

    // Create assignment request for the maid
    const assignmentRequest = await prisma.assignmentRequest.create({
      data: {
        bookingId: booking.id,
        maidId: customerAssignment.maidId, // Use MaidProfile ID
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        status: 'pending'
      },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                timeSlot: true
              }
            },
            service: true
          }
        },
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    console.log('📨 Assignment request sent to maid:', assignmentRequest.id);

    // Mark booking request as processed in Redis to prevent duplicates
    await bookingDeduplicationService.markAsProcessed(
      customerId,
      customerAssignment.maidId,
      scheduledDate,
      48 * 60 * 60 // 48 hours TTL
    );

    return res.status(201).json({
      success: true,
      message: 'Automatic booking created and sent to maid successfully',
      data: {
        booking,
        assignmentRequest: {
          id: assignmentRequest.id,
          maidName: assignmentRequest.maid.user.name,
          expiresAt: assignmentRequest.expiresAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Create automatic booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Create daily automatic bookings for all active customers
const createDailyAutomaticBookings = async (req, res) => {
  try {
    const { date, serviceId } = req.body;
    const targetDate = date ? new Date(date) : new Date();

    console.log('🔄 Creating daily automatic bookings for date:', targetDate.toISOString().split('T')[0]);

    // Get all active customer assignments
    const activeAssignments = await prisma.customerMaidAssignment.findMany({
      where: {
        isActive: true
      },
      include: {
        customer: true,
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    console.log('👥 Found active assignments:', activeAssignments.length);

    // Get default service if not specified
    let defaultService;
    if (serviceId) {
      defaultService = await prisma.service.findUnique({
        where: { id: serviceId }
      });
    } else {
      defaultService = await prisma.service.findFirst({
        where: {
          isActive: true,
          isSubscriptionService: true
        }
      });
    }

    if (!defaultService) {
      return res.status(404).json({
        success: false,
        message: 'No suitable service found for automatic bookings'
      });
    }

    const results = [];
    const errors = [];

    for (const assignment of activeAssignments) {
      try {
        // Check for duplicate booking request using Redis
        const isDuplicate = await bookingDeduplicationService.isDuplicate(
          assignment.customerId,
          assignment.maidId,
          targetDate
        );

        if (isDuplicate) {
          console.log(`🚫 Duplicate booking request prevented for customer ${assignment.customer.name} on ${targetDate.toISOString().split('T')[0]}`);
          continue;
        }

        // Check if customer is in buffer period
        const activeBuffer = await prisma.bufferPeriod.findFirst({
          where: {
            subscription: {
              customer: {
                userId: assignment.customerId
              }
            },
            status: 'ACTIVE',
            endDate: {
              gte: new Date()
            }
          }
        });

        if (activeBuffer) {
          console.log(`⏸️ Skipping customer ${assignment.customer.name} - in buffer period`);
          continue;
        }

        // Check if booking already exists for this date
        const existingBooking = await prisma.booking.findFirst({
          where: {
            customerId: assignment.customerId,
            scheduledAt: {
              gte: new Date(targetDate.setHours(0, 0, 0, 0)),
              lt: new Date(targetDate.setHours(23, 59, 59, 999))
            }
          }
        });

        if (existingBooking) {
          console.log(`📅 Booking already exists for customer ${assignment.customer.name} on ${targetDate.toISOString().split('T')[0]}`);
          continue;
        }

        const bookingDate = new Date(targetDate.setHours(9, 0, 0, 0));
        const maidOnWeeklyOff = isDateOnWeeklyOff(bookingDate, assignment.maid?.weeklyOffDay);
        const maidUnavailable = assignment.maid?.availability && assignment.maid.availability.isAvailable === false;
        let booking;
        if (maidOnWeeklyOff || maidUnavailable) {
          const reason = maidOnWeeklyOff ? 'MAID_ON_LEAVE' : 'Maid unavailable';
          booking = await prisma.booking.create({
            data: {
              customerId: assignment.customerId,
              maidId: null,
              serviceId: defaultService.id,
              scheduledAt: bookingDate,
              timeSlot: assignment.customer.timeSlot || 'morning',
              status: 'CANCELLED',
              assignmentStatus: 'REJECTED',
              rejectionReason: reason,
              totalAmount: defaultService.basePrice,
              notes: `Daily automatic booking for ${defaultService.name}`,
              isAutomatic: true
            }
          });
          await queueRejectedAssignment({
            bookingId: booking.id,
            maidId: assignment.maidId,
            rejectionReason: reason,
            customerId: assignment.customerId
          });
        } else {
          booking = await prisma.booking.create({
            data: {
              customerId: assignment.customerId,
              maidId: assignment.maid.user.id,
              serviceId: defaultService.id,
              scheduledAt: bookingDate,
              timeSlot: assignment.customer.timeSlot || 'morning',
              status: 'PENDING',
              assignmentStatus: 'PENDING_ASSIGNMENT',
              totalAmount: defaultService.basePrice,
              notes: `Daily automatic booking for ${defaultService.name}`,
              isAutomatic: true
            }
          });
          await prisma.assignmentRequest.create({
            data: {
              bookingId: booking.id,
              maidId: assignment.maidId,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              status: 'pending'
            }
          });
        }

        // Mark booking request as processed in Redis
        await bookingDeduplicationService.markAsProcessed(
          assignment.customerId,
          assignment.maidId,
          targetDate,
          48 * 60 * 60 // 48 hours TTL
        );

        results.push({
          customerId: assignment.customerId,
          customerName: assignment.customer.name,
          bookingId: booking.id,
          maidName: assignment.maid.user.name,
          queuedForReassignment: maidOnWeeklyOff || maidUnavailable || false
        });

        console.log(`✅ Created automatic booking for ${assignment.customer.name}`);

      } catch (error) {
        console.error(`❌ Error creating booking for customer ${assignment.customer.name}:`, error);
        errors.push({
          customerId: assignment.customerId,
          customerName: assignment.customer.name,
          error: error.message
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: `Daily automatic bookings created successfully`,
      data: {
        created: results.length,
        total: activeAssignments.length,
        results,
        errors
      }
    });

  } catch (error) {
    console.error('❌ Create daily automatic bookings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get automatic bookings for admin monitoring
const getAutomaticBookings = async (req, res) => {
  try {
    const { status, date, customerId, maidId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      isAutomatic: true
    };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (maidId) where.maidId = maidId;
    
    if (date) {
      const targetDate = new Date(date);
      where.scheduledAt = {
        gte: new Date(targetDate.setHours(0, 0, 0, 0)),
        lt: new Date(targetDate.setHours(23, 59, 59, 999))
      };
    }

    const [bookings, totalCount] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              timeSlot: true
            }
          },
          maid: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          service: true,
          assignmentRequests: {
            include: {
              maid: {
                include: {
                  user: {
                    select: {
                      name: true,
                      email: true
                    }
                  }
                }
              }
            },
            orderBy: {
              requestedAt: 'desc'
            },
            take: 1
          }
        },
        orderBy: {
          scheduledAt: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.booking.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get automatic bookings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get customers eligible for automatic bookings
const getEligibleCustomers = async (req, res) => {
  try {
    const eligibleCustomers = await prisma.customerMaidAssignment.findMany({
      where: {
        isActive: true
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            timeSlot: true,
            address: true
          }
        },
        maid: {
          include: {
            user: {
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

    // Check buffer status for each customer
    const customersWithStatus = await Promise.all(
      eligibleCustomers.map(async (assignment) => {
        const activeBuffer = await prisma.bufferPeriod.findFirst({
          where: {
            subscription: {
              customer: {
                userId: assignment.customerId
              }
            },
            status: 'ACTIVE',
            endDate: {
              gte: new Date()
            }
          }
        });

        return {
          ...assignment,
          isInBuffer: !!activeBuffer,
          bufferInfo: activeBuffer ? {
            reason: activeBuffer.reason,
            endDate: activeBuffer.endDate
          } : null
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: customersWithStatus
    });

  } catch (error) {
    console.error('Get eligible customers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  createAutomaticBooking,
  createDailyAutomaticBookings,
  getAutomaticBookings,
  getEligibleCustomers
};
