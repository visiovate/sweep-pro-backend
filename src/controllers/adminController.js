const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const prisma = getPrismaClient();

// Get all customers with active subscriptions for admin dashboard
const getActiveCustomers = async (req, res) => {
  try {
    const customers = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      include: {
        customer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                latitude: true,
                longitude: true
              }
            }
          }
        },
        plan: {
          include: {
            service: true
          }
        }
      }
    });

    res.json(customers);
  } catch (error) {
    console.error('Error fetching active customers:', error);
    res.status(500).json({ message: 'Failed to fetch active customers' });
  }
};

// Get pending bookings that need maid assignment
const getPendingBookings = async (req, res) => {
  try {
    console.log('🔍 Fetching pending bookings for admin...');

    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          {
            status: 'PENDING',
            maidId: null
          },
          {
            status: 'CONFIRMED',
            maidId: null
          }
        ]
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            latitude: true,
            longitude: true
          }
        },
        service: true
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    console.log(`✅ Found ${bookings.length} pending bookings`);

    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error('Error fetching pending bookings:', error.message || error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending bookings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get available maids for assignment
const getAvailableMaids = async (req, res) => {
  try {
    const { date, latitude, longitude } = req.query;

    const maids = await prisma.user.findMany({
      where: {
        role: 'MAID',
        status: 'ACTIVE',
        maidProfile: {
          status: 'ACTIVE'
        }
      },
      include: {
        maidProfile: true
      }
    });

    // Filter maids based on availability and proximity if coordinates provided
    let availableMaids = maids;

    if (latitude && longitude) {
      availableMaids = maids.filter(maid => {
        if (!maid.latitude || !maid.longitude) return true;

        const distance = calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          maid.latitude,
          maid.longitude
        );

        return distance <= (maid.maidProfile?.serviceRadius || 5);
      });
    }

    // Enrich each maid with current assignment count and today's booking count
    const maidProfileIds = availableMaids
      .map(m => m.maidProfile?.id)
      .filter(Boolean);
    const maidUserIds = availableMaids.map(m => m.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [activeAssignments, todayBookings] = await Promise.all([
      // Count active customer assignments per maid
      prisma.customerMaidAssignment.groupBy({
        by: ['maidId'],
        where: {
          maidId: { in: maidProfileIds },
          isActive: true
        },
        _count: { maidId: true }
      }),
      // Count today's bookings per maid (using User ID since Booking.maidId = User.id)
      prisma.booking.groupBy({
        by: ['maidId'],
        where: {
          maidId: { in: maidUserIds },
          scheduledAt: { gte: today, lt: tomorrow },
          status: { in: ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] }
        },
        _count: { maidId: true }
      })
    ]);

    const assignmentCountMap = {};
    activeAssignments.forEach(a => {
      assignmentCountMap[a.maidId] = a._count.maidId;
    });

    const todayBookingCountMap = {};
    todayBookings.forEach(b => {
      todayBookingCountMap[b.maidId] = b._count.maidId;
    });

    const enrichedMaids = availableMaids.map(maid => {
      const profileId = maid.maidProfile?.id;
      const activeCustomerCount = profileId ? (assignmentCountMap[profileId] || 0) : 0;
      const todayBookingCount = todayBookingCountMap[maid.id] || 0;
      const maxDaily = maid.maidProfile?.maxDailyBookings || 3;

      const availabilityObj = maid.maidProfile?.availability;
      const isAvailable = availabilityObj && typeof availabilityObj === 'object'
        ? availabilityObj.isAvailable !== false
        : true;

      const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const todayWeekday = WEEKDAYS[new Date().getDay()];
      const isWeeklyOff = maid.maidProfile?.weeklyOffDay === todayWeekday;

      return {
        ...maid,
        activeCustomerCount,
        todayBookingCount,
        maxDailyBookings: maxDaily,
        isFree: activeCustomerCount === 0 && todayBookingCount === 0,
        isAvailableToday: isAvailable && !isWeeklyOff,
        isWeeklyOff,
      };
    });

    res.json(enrichedMaids);
  } catch (error) {
    console.error('Error fetching available maids:', error);
    res.status(500).json({ message: 'Failed to fetch available maids' });
  }
};

// Assign maid to booking
const assignMaidToBooking = async (req, res) => {
  try {
    const { bookingId, maidId } = req.body;

    // Check if maid is available
    const maid = await prisma.user.findFirst({
      where: {
        id: maidId,
        role: 'MAID',
        status: 'ACTIVE'
      },
      include: {
        maidProfile: true
      }
    });

    if (!maid) {
      return res.status(404).json({ message: 'Maid not found or not available' });
    }

    // Update booking with maid assignment
    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        maidId,
        status: 'ASSIGNED'
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true
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
        service: true
      }
    });

    // Make this maid the default for the customer
    await prisma.customerMaidAssignment.upsert({
      where: {
        customerId: booking.customerId
      },
      update: {
        maidId: maidId,
        isActive: true,
        assignedAt: new Date()
      },
      create: {
        customerId: booking.customerId,
        maidId: maidId,
        isActive: true,
        assignedAt: new Date()
      }
    });

    // Create notification for both customer and maid
    await prisma.notification.createMany({
      data: [
        {
          userId: booking.customerId,
          type: 'MAID_ASSIGNED',
          title: 'Maid Assigned',
          message: `${maid.name} has been assigned to your service on ${booking.scheduledAt.toDateString()}`
        },
        {
          userId: maidId,
          type: 'SERVICE_ASSIGNED',
          title: 'New Service Assignment',
          message: `You have been assigned to serve ${booking.customer.name} on ${booking.scheduledAt.toDateString()}`
        }
      ]
    });

    res.json({
      success: true,
      data: booking,
      message: 'Maid assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning maid to booking:', error);
    res.status(500).json({ message: 'Failed to assign maid to booking' });
  }
};

// Generate OTP for service verification
const generateServiceOTP = async (req, res) => {
  try {
    const { bookingId } = req.body;

    // Generate 6-digit OTP
    const startOTP = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in ServiceOTP table
    await prisma.serviceOTP.upsert({
      where: { bookingId },
      update: {
        startOTP,
        startOTPGeneratedAt: new Date()
      },
      create: {
        bookingId,
        startOTP,
        startOTPGeneratedAt: new Date()
      }
    });

    // In production, send OTP via SMS/Email to customer
    console.log(`Start OTP generated for booking ${bookingId}: ${startOTP}`);

    res.json({
      success: true,
      message: 'Start OTP generated and sent to customer',
      otp: startOTP // In production, don't send OTP in response
    });

  } catch (error) {
    console.error('Error generating OTP:', error);
    res.status(500).json({ message: 'Failed to generate OTP' });
  }
};

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

// Get comprehensive admin statistics
const getAdminStats = async (req, res) => {
  try {
    // Get all statistics in parallel
    const [users, bookings, subscriptions, payments] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true
        }
      }),
      prisma.booking.findMany({
        select: {
          id: true,
          status: true,
          finalAmount: true,
          createdAt: true
        }
      }),
      prisma.subscription.findMany({
        select: {
          id: true,
          status: true,
          amount: true,
          createdAt: true
        }
      }),
      prisma.payment.findMany({
        select: {
          id: true,
          status: true,
          finalAmount: true,
          createdAt: true
        }
      })
    ]);

    // Calculate statistics
    const totalUsers = users.length;
    const totalCustomers = users.filter(u => u.role === 'CUSTOMER').length;
    const totalMaids = users.filter(u => u.role === 'MAID').length;
    const activeUsers = users.filter(u => u.status === 'ACTIVE').length;

    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'PENDING').length;
    const completedBookings = bookings.filter(b => b.status === 'COMPLETED').length;
    const assignedBookings = bookings.filter(b => b.status === 'ASSIGNED').length;

    const totalSubscriptions = subscriptions.length;
    const activeSubscriptions = subscriptions.filter(s => s.status === 'ACTIVE').length;
    const subscriptionRevenue = subscriptions
      .filter(s => s.status === 'ACTIVE')
      .reduce((sum, s) => sum + s.amount, 0);

    const totalPayments = payments.length;
    const completedPayments = payments.filter(p => p.status === 'COMPLETED').length;
    const pendingPayments = payments.filter(p => p.status === 'PENDING').length;
    const totalRevenue = payments
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.finalAmount, 0);

    // Monthly growth calculations
    const currentMonth = new Date();
    currentMonth.setDate(1);
    const currentMonthUsers = users.filter(u => new Date(u.createdAt) >= currentMonth).length;
    const currentMonthBookings = bookings.filter(b => new Date(b.createdAt) >= currentMonth).length;

    const stats = {
      users: {
        total: totalUsers,
        customers: totalCustomers,
        maids: totalMaids,
        active: activeUsers,
        newThisMonth: currentMonthUsers
      },
      bookings: {
        total: totalBookings,
        pending: pendingBookings,
        assigned: assignedBookings,
        completed: completedBookings,
        newThisMonth: currentMonthBookings
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        revenue: subscriptionRevenue
      },
      payments: {
        total: totalPayments,
        completed: completedPayments,
        pending: pendingPayments,
        totalRevenue
      },
      overview: {
        totalUsers,
        totalCustomers,
        totalMaids,
        totalBookings,
        pendingBookings,
        activeSubscriptions,
        totalRevenue,
        completedPayments
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin statistics'
    });
  }
};

// Get all subscriptions for admin
const getAllSubscriptions = async (req, res) => {
  try {
    const { status, plan } = req.query;

    let whereClause = {};

    if (status) {
      whereClause.status = status.toUpperCase();
    }

    if (plan) {
      whereClause.plan = {
        name: {
          contains: plan,
          mode: 'insensitive'
        }
      };
    }

    const subscriptions = await prisma.subscription.findMany({
      where: whereClause,
      include: {
        customer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
              }
            }
          }
        },
        plan: {
          include: {
            service: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: subscriptions
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions'
    });
  }
};

// Get all payments for admin
const getAllPayments = async (req, res) => {
  try {
    const { status, type } = req.query;

    let whereClause = {};

    if (status) {
      whereClause.status = status.toUpperCase();
    }

    if (type) {
      whereClause.paymentType = type.toUpperCase();
    }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        booking: {
          select: {
            id: true,
            scheduledAt: true,
            service: {
              select: {
                name: true
              }
            }
          }
        },
        subscription: {
          select: {
            id: true,
            plan: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments'
    });
  }
};

// Get all maids with their document verification status
const getAllMaidsWithDocuments = async (req, res) => {
  try {
    const maids = await prisma.user.findMany({
      where: { role: 'MAID' },
      include: {
        maidProfile: {
          include: {
            documents: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate document verification status for each maid
    const requiredDocTypes = ['AADHAR_CARD', 'PAN_CARD', 'ADDRESS_PROOF', 'POLICE_VERIFICATION', 'MEDICAL_CERTIFICATE', 'PHOTO'];

    const maidsWithDocumentStatus = maids.map(maid => {
      const documents = maid.maidProfile?.documents || [];
      const totalRequired = requiredDocTypes.length;
      const uploaded = requiredDocTypes.filter(type =>
        documents.some(doc => doc.type === type)
      ).length;
      const verified = requiredDocTypes.filter(type =>
        documents.some(doc => doc.type === type && doc.verificationStatus === 'APPROVED')
      ).length;
      const pending = requiredDocTypes.filter(type =>
        documents.some(doc => doc.type === type && doc.verificationStatus === 'PENDING')
      ).length;
      const rejected = requiredDocTypes.filter(type =>
        documents.some(doc => doc.type === type && doc.verificationStatus === 'REJECTED')
      ).length;

      return {
        ...maid,
        documentVerification: {
          totalRequired,
          uploaded,
          verified,
          pending,
          rejected,
          verificationProgress: totalRequired > 0 ? Math.round((verified / totalRequired) * 100) : 0,
          allRequiredUploaded: uploaded === totalRequired,
          allRequiredVerified: verified === totalRequired
        }
      };
    });

    res.json({
      success: true,
      data: maidsWithDocumentStatus
    });

  } catch (error) {
    console.error('Error fetching maids with documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maids with document status'
    });
  }
};

module.exports = {
  getActiveCustomers,
  getPendingBookings,
  getAvailableMaids,
  assignMaidToBooking,
  generateServiceOTP,
  getAdminStats,
  getAllSubscriptions,
  getAllPayments,
  getAllMaidsWithDocuments
};
