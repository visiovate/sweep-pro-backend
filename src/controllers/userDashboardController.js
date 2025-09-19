const { PrismaClient } = require('@prisma/client');
const subscriptionBufferService = require('../services/subscriptionBufferService');
const maidSchedulingService = require('../services/maidSchedulingService');

const prisma = new PrismaClient();

/**
 * Get user's subscription dashboard data
 */
const getSubscriptionDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // Get subscription status with buffer information
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE'
      }
    });

    if (!subscription) {
      return res.json({
        hasActiveSubscription: false,
        message: 'No active subscription found'
      });
    }

    // Get detailed subscription status
    const subscriptionStatus = await subscriptionBufferService.getSubscriptionStatus(subscription.id);

    // Get recent booking history
    const recentBookings = await prisma.booking.findMany({
      where: {
        customerId: userId,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      include: {
        service: {
          select: {
            name: true,
            category: true
          }
        },
        maid: {
          select: {
            name: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Calculate service statistics
    const serviceStats = {
      totalBookings: recentBookings.length,
      completedServices: recentBookings.filter(b => b.status === 'COMPLETED').length,
      upcomingServices: subscriptionStatus.upcomingBookings?.length || 0,
      servicesThisMonth: recentBookings.filter(b => {
        const bookingMonth = b.scheduledAt.getMonth();
        const currentMonth = new Date().getMonth();
        return bookingMonth === currentMonth;
      }).length
    };

    // Get payment history
    const paymentHistory = await prisma.payment.findMany({
      where: {
        customerId: userId,
        createdAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Calculate next payment info
    const nextPayment = subscription.nextBillDate ? {
      date: subscription.nextBillDate,
      amount: subscription.amount,
      daysUntilDue: Math.ceil((subscription.nextBillDate - new Date()) / (1000 * 60 * 60 * 24))
    } : null;

    res.json({
      success: true,
      hasActiveSubscription: true,
      subscription: subscriptionStatus.subscription,
      currentCycle: subscriptionStatus.currentCycle,
      activeBuffer: subscriptionStatus.activeBuffer,
      summary: subscriptionStatus.summary,
      serviceStats,
      recentBookings,
      upcomingBookings: subscriptionStatus.upcomingBookings,
      paymentHistory,
      nextPayment
    });

  } catch (error) {
    console.error('Error getting subscription dashboard:', error);
    res.status(500).json({ message: 'Failed to get dashboard data' });
  }
};

/**
 * Get user's monthly service calendar
 */
const getMonthlyServiceCalendar = async (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;

    const targetDate = new Date(
      year ? parseInt(year) : new Date().getFullYear(),
      month ? parseInt(month) - 1 : new Date().getMonth(),
      1
    );

    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

    // Get all bookings for the month
    const bookings = await prisma.booking.findMany({
      where: {
        customerId: userId,
        scheduledAt: {
          gte: monthStart,
          lte: monthEnd
        }
      },
      include: {
        service: {
          select: {
            name: true,
            category: true,
            baseDuration: true
          }
        },
        maid: {
          select: {
            name: true,
            phone: true
          }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    // Get subscription buffer periods for the month
    const bufferPeriods = await prisma.bufferPeriod.findMany({
      where: {
        subscription: {
          customer: {
            userId: userId
          }
        },
        OR: [
          {
            startDate: {
              gte: monthStart,
              lte: monthEnd
            }
          },
          {
            endDate: {
              gte: monthStart,
              lte: monthEnd
            }
          },
          {
            AND: [
              { startDate: { lte: monthStart } },
              { endDate: { gte: monthEnd } }
            ]
          }
        ]
      },
      orderBy: { startDate: 'asc' }
    });

    // Create calendar grid
    const calendarData = [];
    const daysInMonth = monthEnd.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), day);
      const dayBookings = bookings.filter(booking => 
        booking.scheduledAt.toDateString() === currentDate.toDateString()
      );

      const activeBuffer = bufferPeriods.find(buffer => 
        currentDate >= buffer.startDate && currentDate <= buffer.endDate
      );

      calendarData.push({
        date: currentDate.toISOString().split('T')[0],
        dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        bookings: dayBookings.map(booking => ({
          id: booking.id,
          serviceName: booking.service.name,
          status: booking.status,
          scheduledTime: booking.scheduledAt.toTimeString().split(' ')[0],
          maidName: booking.maid?.name,
          duration: booking.service.baseDuration,
          isSubscriptionBased: booking.isSubscriptionBased,
          isBufferSkipped: booking.isBufferSkipped
        })),
        isInBufferPeriod: !!activeBuffer,
        bufferReason: activeBuffer?.reason
      });
    }

    // Calculate month summary
    const monthSummary = {
      totalBookings: bookings.length,
      completedServices: bookings.filter(b => b.status === 'COMPLETED').length,
      upcomingServices: bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'ASSIGNED').length,
      cancelledServices: bookings.filter(b => b.status === 'CANCELLED').length,
      bufferDays: bufferPeriods.reduce((total, buffer) => {
        const bufferStart = buffer.startDate > monthStart ? buffer.startDate : monthStart;
        const bufferEnd = buffer.endDate < monthEnd ? buffer.endDate : monthEnd;
        return total + Math.ceil((bufferEnd - bufferStart) / (1000 * 60 * 60 * 24)) + 1;
      }, 0)
    };

    res.json({
      success: true,
      month: {
        year: targetDate.getFullYear(),
        month: targetDate.getMonth() + 1,
        name: targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      },
      calendarData,
      monthSummary,
      bufferPeriods: bufferPeriods.map(buffer => ({
        id: buffer.id,
        startDate: buffer.startDate,
        endDate: buffer.endDate,
        reason: buffer.reason,
        daysCount: buffer.daysCount,
        status: buffer.status
      }))
    });

  } catch (error) {
    console.error('Error getting monthly service calendar:', error);
    res.status(500).json({ message: 'Failed to get calendar data' });
  }
};

/**
 * Get buffer period history
 */
const getBufferPeriodHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    const skip = (page - 1) * limit;

    const bufferPeriods = await prisma.bufferPeriod.findMany({
      where: {
        subscription: {
          customerId: customerProfile.id
        }
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          include: {
            plan: {
              select: {
                name: true
              }
            }
          }
        },
        cycle: {
          select: {
            cycleNumber: true
          }
        }
      }
    });

    const total = await prisma.bufferPeriod.count({
      where: {
        subscription: {
          customerId: customerProfile.id
        }
      }
    });

    res.json({
      success: true,
      data: bufferPeriods.map(buffer => ({
        id: buffer.id,
        startDate: buffer.startDate,
        endDate: buffer.endDate,
        reason: buffer.reason,
        status: buffer.status,
        daysCount: buffer.daysCount,
        servicesSkipped: buffer.servicesSkipped,
        isAutomatic: buffer.isAutomatic,
        resumedAt: buffer.resumedAt,
        notes: buffer.notes,
        planName: buffer.subscription.plan.name,
        cycleNumber: buffer.cycle?.cycleNumber
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error getting buffer period history:', error);
    res.status(500).json({ message: 'Failed to get buffer period history' });
  }
};

/**
 * Get subscription cycle history
 */
const getSubscriptionCycleHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    const skip = (page - 1) * limit;

    const cycles = await prisma.subscriptionCycle.findMany({
      where: {
        subscription: {
          customerId: customerProfile.id
        }
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { cycleNumber: 'desc' },
      include: {
        subscription: {
          include: {
            plan: {
              select: {
                name: true
              }
            }
          }
        },
        bookings: {
          select: {
            id: true,
            status: true,
            scheduledAt: true
          }
        },
        bufferPeriods: {
          select: {
            id: true,
            daysCount: true,
            reason: true
          }
        }
      }
    });

    const total = await prisma.subscriptionCycle.count({
      where: {
        subscription: {
          customerId: customerProfile.id
        }
      }
    });

    res.json({
      success: true,
      data: cycles.map(cycle => ({
        id: cycle.id,
        cycleNumber: cycle.cycleNumber,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
        totalServices: cycle.totalServices,
        completedServices: cycle.completedServices,
        skippedServices: cycle.skippedServices,
        bufferDaysUsed: cycle.bufferDaysUsed,
        isBufferActive: cycle.isBufferActive,
        amount: cycle.amount,
        planName: cycle.subscription.plan.name,
        bookings: cycle.bookings.length,
        bufferPeriods: cycle.bufferPeriods.length,
        completionRate: cycle.totalServices > 0 ? 
          Math.round((cycle.completedServices / cycle.totalServices) * 100) : 0
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error getting subscription cycle history:', error);
    res.status(500).json({ message: 'Failed to get cycle history' });
  }
};

/**
 * Get user's service preferences and history
 */
const getServicePreferences = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get service history and preferences
    const serviceHistory = await prisma.booking.findMany({
      where: {
        customerId: userId,
        status: 'COMPLETED'
      },
      include: {
        service: true,
        feedback: true
      },
      orderBy: { completedAt: 'desc' },
      take: 50
    });

    // Calculate service preferences based on history
    const serviceStats = {};
    let totalRating = 0;
    let ratingCount = 0;

    serviceHistory.forEach(booking => {
      const serviceId = booking.service.id;
      if (!serviceStats[serviceId]) {
        serviceStats[serviceId] = {
          serviceName: booking.service.name,
          category: booking.service.category,
          count: 0,
          totalSpent: 0,
          averageRating: 0,
          ratingCount: 0
        };
      }
      
      serviceStats[serviceId].count++;
      serviceStats[serviceId].totalSpent += booking.finalAmount;
      
      if (booking.feedback) {
        serviceStats[serviceId].averageRating += booking.feedback.overallRating;
        serviceStats[serviceId].ratingCount++;
        totalRating += booking.feedback.overallRating;
        ratingCount++;
      }
    });

    // Calculate averages
    Object.keys(serviceStats).forEach(serviceId => {
      const stats = serviceStats[serviceId];
      if (stats.ratingCount > 0) {
        stats.averageRating = Math.round((stats.averageRating / stats.ratingCount) * 10) / 10;
      }
    });

    const preferences = user.customerProfile?.preferences || {};

    res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        timeSlot: user.timeSlot
      },
      preferences,
      serviceHistory: {
        totalServices: serviceHistory.length,
        totalSpent: serviceHistory.reduce((sum, booking) => sum + booking.finalAmount, 0),
        averageRating: ratingCount > 0 ? Math.round((totalRating / ratingCount) * 10) / 10 : 0,
        serviceBreakdown: Object.values(serviceStats).sort((a, b) => b.count - a.count)
      },
      emergencyContact: user.customerProfile?.emergencyContact,
      specialInstructions: user.customerProfile?.specialInstructions
    });

  } catch (error) {
    console.error('Error getting service preferences:', error);
    res.status(500).json({ message: 'Failed to get service preferences' });
  }
};

module.exports = {
  getSubscriptionDashboard,
  getMonthlyServiceCalendar,
  getBufferPeriodHistory,
  getSubscriptionCycleHistory,
  getServicePreferences
};
