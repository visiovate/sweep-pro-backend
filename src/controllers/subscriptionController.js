const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');
const subscriptionBufferService = require('../services/subscriptionBufferService');
const prisma = new PrismaClient();

// Get all subscription plans
const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await prisma.servicePlan.findMany({
      where: { isActive: true },
      include: {
        service: true
      }
    });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ message: 'Failed to fetch subscription plans' });
  }
};

// Subscribe user to a plan
const subscribeToPlan = async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    // Get or create customer profile
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      // Create customer profile if it doesn't exist
      customerProfile = await prisma.customerProfile.create({
        data: {
          userId,
          preferences: {},
          emergencyContact: null
        }
      });
    }

    const customerId = customerProfile.id;

    // Check if user already has an active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        customerId,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      }
    });

    if (existingSubscription) {
      return res.status(400).json({
        message: 'You already have an active subscription'
      });
    }

    // Get the plan details
    const plan = await prisma.servicePlan.findUnique({
      where: { id: planId }
    });

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + plan.duration);

    // Create subscription (initially pending payment)
    const subscription = await prisma.subscription.create({
      data: {
        customerId,
        planId,
        status: 'PENDING_PAYMENT',
        startDate,
        endDate,
        billingCycle: 'MONTHLY',
        amount: plan.finalPrice,
        discount: plan.basePrice - plan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        bufferDaysCount: plan.bufferDaysAllowed || 3,
        currentCycleStart: startDate,
        currentCycleEnd: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)
      },
      include: {
        plan: {
          include: {
            service: true
          }
        }
      }
    });

    // Create payment for subscription
    const payment = await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        customerId: userId,
        amount: plan.finalPrice,
        discount: plan.basePrice - plan.finalPrice,
        tax: 0,
        finalAmount: plan.finalPrice,
        paymentMethod: 'CARD', // Default, should be updated when actual payment is made
        status: 'PENDING',
        paymentType: 'SUBSCRIPTION'
      }
    });

    res.status(201).json({
      success: true,
      data: subscription,
      message: 'Successfully subscribed to plan'
    });

  } catch (error) {
    console.error('Error subscribing to plan:', error);
    res.status(500).json({ message: 'Failed to subscribe to plan' });
  }
};

// Get user's current subscription
const getUserSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // First check for active subscription
    let subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      include: {
        plan: {
          include: {
            service: true
          }
        },
        payments: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    // If no active subscription, check for pending payment subscription
    if (!subscription) {
      subscription = await prisma.subscription.findFirst({
        where: {
          customerId: customerProfile.id,
          status: 'PENDING_PAYMENT'
        },
        include: {
          plan: {
            include: {
              service: true
            }
          },
          payments: {
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });
    }

    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ message: 'Failed to fetch subscription' });
  }
};

// Get monthly subscription status with buffer information
const getMonthlySubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // Get active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      }
    });

    if (!subscription) {
      return res.json({
        hasActiveSubscription: false,
        message: 'No active subscription found'
      });
    }

    // Get detailed subscription status with buffer information
    const status = await subscriptionBufferService.getSubscriptionStatus(subscription.id);

    res.json({
      success: true,
      hasActiveSubscription: true,
      ...status
    });

  } catch (error) {
    console.error('Error getting monthly subscription status:', error);
    res.status(500).json({ message: 'Failed to get subscription status' });
  }
};

// Manually start buffer period
const startBufferPeriod = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason = 'CUSTOMER_REQUEST' } = req.body;

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // Get active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    if (subscription.isInBufferPeriod) {
      return res.status(400).json({ message: 'Subscription is already in buffer period' });
    }

    const bufferPeriod = await subscriptionBufferService.startBufferPeriod(subscription.id, reason);

    res.json({
      success: true,
      message: 'Buffer period started successfully',
      bufferPeriod
    });

  } catch (error) {
    console.error('Error starting buffer period:', error);
    res.status(500).json({ message: 'Failed to start buffer period' });
  }
};

// End buffer period and resume services
const endBufferPeriod = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // Get active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    if (!subscription.isInBufferPeriod) {
      return res.status(400).json({ message: 'Subscription is not in buffer period' });
    }

    const updatedSubscription = await subscriptionBufferService.endBufferPeriod(subscription.id);

    res.json({
      success: true,
      message: 'Buffer period ended successfully. Services will resume.',
      subscription: updatedSubscription
    });

  } catch (error) {
    console.error('Error ending buffer period:', error);
    res.status(500).json({ message: 'Failed to end buffer period' });
  }
};

// Complete subscription payment and activate subscription
const completeSubscriptionPayment = async (req, res) => {
  try {
    const { subscriptionId, paymentId, transactionId, gateway, gatewayResponse } = req.body;
    const userId = req.user.id;

    if (!subscriptionId || !paymentId || !transactionId) {
      return res.status(400).json({ 
        error: 'Missing required fields: subscriptionId, paymentId, transactionId' 
      });
    }

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    // Verify payment belongs to user and subscription
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        subscription: true
      }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.customerId !== userId || payment.subscriptionId !== subscriptionId) {
      return res.status(403).json({ error: 'Unauthorized access to payment' });
    }

    if (payment.subscription.customerId !== customerProfile.id) {
      return res.status(403).json({ error: 'Unauthorized access to subscription' });
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

    // Activate subscription
    const subscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'ACTIVE'
      },
      include: {
        plan: {
          include: {
            service: true
          }
        },
        customer: {
          include: {
            user: true
          }
        }
      }
    });

    // Initialize first subscription cycle
    await subscriptionBufferService.initializeSubscriptionCycle(subscriptionId, 1);

    // Schedule monthly services
    await subscriptionBufferService.scheduleMonthlyServices(subscriptionId);

    // Send notification for subscription activation
    await notificationService.notifySubscriptionCreated(subscription);

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      subscription
    });

  } catch (error) {
    console.error('Error completing subscription payment:', error);
    res.status(500).json({ error: 'Failed to complete subscription payment' });
  }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // Get the subscription details before cancelling
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE'
      },
      include: {
        plan: {
          include: {
            service: true
          }
        },
        customer: {
          include: {
            user: true
          }
        }
      }
    });

    const subscription = await prisma.subscription.updateMany({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE'
      },
      data: {
        status: 'CANCELLED',
        autoRenew: false
      }
    });

    // Send notification for subscription cancellation
    if (existingSubscription) {
      await notificationService.notifySubscriptionCancelled(existingSubscription, 'Cancelled by user');
    }

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
};

// Check subscription status for booking
const checkSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get or create customer profile
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      customerProfile = await prisma.customerProfile.create({
        data: {
          userId,
          preferences: {},
          emergencyContact: null
        }
      });
    }

    // Check for active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      include: {
        plan: {
          include: {
            service: true
          }
        }
      }
    });

    res.json({
      hasActiveSubscription: !!subscription,
      subscription: subscription || null,
      message: subscription 
        ? 'Active subscription found' 
        : 'No active subscription found. Payment will be required for bookings.'
    });

  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ message: 'Failed to check subscription status' });
  }
};

// Admin: Update subscription plan
const updateSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      basePrice,
      finalPrice,
      discountPercent,
      duration,
      sessionsPerWeek,
      sessionsPerMonth,
      isActive,
      isPopular,
      serviceId
    } = req.body;

    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Validate required fields
    if (!name || !basePrice || !finalPrice || !duration || !serviceId) {
      return res.status(400).json({
        message: 'Missing required fields: name, basePrice, finalPrice, duration, serviceId'
      });
    }

    // Check if plan exists
    const existingPlan = await prisma.servicePlan.findUnique({
      where: { id }
    });

    if (!existingPlan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    // Update the plan
    const updatedPlan = await prisma.servicePlan.update({
      where: { id },
      data: {
        name,
        description,
        basePrice: parseFloat(basePrice),
        finalPrice: parseFloat(finalPrice),
        discountPercent: discountPercent || 0,
        duration: parseInt(duration),
        sessionsPerWeek: sessionsPerWeek || 1,
        sessionsPerMonth: sessionsPerMonth || 4,
        isActive: isActive !== undefined ? isActive : true,
        isPopular: isPopular || false,
        serviceId
      },
      include: {
        service: true
      }
    });

    res.json({
      success: true,
      data: updatedPlan,
      message: 'Subscription plan updated successfully'
    });

  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ message: 'Failed to update subscription plan' });
  }
};

// Admin: Create subscription plan
const createSubscriptionPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      basePrice,
      finalPrice,
      discountPercent,
      duration,
      sessionsPerWeek,
      sessionsPerMonth,
      isActive,
      isPopular,
      serviceId
    } = req.body;

    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Validate required fields
    if (!name || !basePrice || !finalPrice || !duration || !serviceId) {
      return res.status(400).json({
        message: 'Missing required fields: name, basePrice, finalPrice, duration, serviceId'
      });
    }

    // Create the plan
    const newPlan = await prisma.servicePlan.create({
      data: {
        name,
        description,
        basePrice: parseFloat(basePrice),
        finalPrice: parseFloat(finalPrice),
        discountPercent: discountPercent || 0,
        duration: parseInt(duration),
        sessionsPerWeek: sessionsPerWeek || 1,
        sessionsPerMonth: sessionsPerMonth || 4,
        isActive: isActive !== undefined ? isActive : true,
        isPopular: isPopular || false,
        serviceId
      },
      include: {
        service: true
      }
    });

    res.status(201).json({
      success: true,
      data: newPlan,
      message: 'Subscription plan created successfully'
    });

  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({ message: 'Failed to create subscription plan' });
  }
};

// Admin: Delete subscription plan
const deleteSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Check if plan exists
    const existingPlan = await prisma.servicePlan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: {
            status: 'ACTIVE'
          }
        }
      }
    });

    if (!existingPlan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    // Check if plan has active subscriptions
    if (existingPlan.subscriptions.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete plan with active subscriptions. Deactivate instead.'
      });
    }

    // Delete the plan
    await prisma.servicePlan.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Subscription plan deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({ message: 'Failed to delete subscription plan' });
  }
};

// Admin: Get all subscription cycles
const getSubscriptionCycles = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { page = 1, limit = 20, status, subscriptionId } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (subscriptionId) where.subscriptionId = subscriptionId;

    const cycles = await prisma.subscriptionCycle.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        subscription: {
          include: {
            customer: {
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
            },
            plan: {
              include: {
                service: true
              }
            }
          }
        },
        bufferPeriods: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const total = await prisma.subscriptionCycle.count({ where });

    res.json({
      success: true,
      data: cycles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching subscription cycles:', error);
    res.status(500).json({ message: 'Failed to fetch subscription cycles' });
  }
};

// Admin: Get all buffer periods
const getBufferPeriods = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { page = 1, limit = 20, status, subscriptionId } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (subscriptionId) where.subscriptionId = subscriptionId;

    const bufferPeriods = await prisma.bufferPeriod.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        subscription: {
          include: {
            customer: {
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
            },
            plan: {
              include: {
                service: true
              }
            }
          }
        },
        cycle: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const total = await prisma.bufferPeriod.count({ where });

    res.json({
      success: true,
      data: bufferPeriods,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching buffer periods:', error);
    res.status(500).json({ message: 'Failed to fetch buffer periods' });
  }
};

// Admin: Manually start buffer period for a subscription
const adminStartBufferPeriod = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { subscriptionId } = req.params;
    const { reason = 'ADMIN_PAUSE', notes } = req.body;

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        customer: { include: { user: true } },
        plan: true
      }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (subscription.isInBufferPeriod) {
      return res.status(400).json({ message: 'Subscription is already in buffer period' });
    }

    const bufferPeriod = await subscriptionBufferService.startBufferPeriod(subscription.id, reason);

    // Add admin notes if provided
    if (notes) {
      await prisma.bufferPeriod.update({
        where: { id: bufferPeriod.id },
        data: { notes }
      });
    }

    res.json({
      success: true,
      message: 'Buffer period started by admin',
      bufferPeriod
    });

  } catch (error) {
    console.error('Error starting buffer period (admin):', error);
    res.status(500).json({ message: 'Failed to start buffer period' });
  }
};

// Admin: Manually end buffer period for a subscription
const adminEndBufferPeriod = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { subscriptionId } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        customer: { include: { user: true } },
        plan: true
      }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (!subscription.isInBufferPeriod) {
      return res.status(400).json({ message: 'Subscription is not in buffer period' });
    }

    const updatedSubscription = await subscriptionBufferService.endBufferPeriod(subscription.id);

    res.json({
      success: true,
      message: 'Buffer period ended by admin',
      subscription: updatedSubscription
    });

  } catch (error) {
    console.error('Error ending buffer period (admin):', error);
    res.status(500).json({ message: 'Failed to end buffer period' });
  }
};

// Admin: Get subscription analytics
const getSubscriptionAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get subscription counts
    const totalSubscriptions = await prisma.subscription.count();
    const activeSubscriptions = await prisma.subscription.count({
      where: { status: 'ACTIVE' }
    });
    const subscriptionsInBuffer = await prisma.subscription.count({
      where: { isInBufferPeriod: true }
    });

    // Get monthly statistics
    const thisMonthSubscriptions = await prisma.subscription.count({
      where: {
        createdAt: { gte: monthStart }
      }
    });

    const lastMonthSubscriptions = await prisma.subscription.count({
      where: {
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd }
      }
    });

    // Get buffer period statistics
    const activeBufferPeriods = await prisma.bufferPeriod.count({
      where: { status: 'ACTIVE' }
    });

    const thisMonthBufferPeriods = await prisma.bufferPeriod.count({
      where: {
        createdAt: { gte: monthStart }
      }
    });

    // Get cycle statistics
    const activeCycles = await prisma.subscriptionCycle.count({
      where: { status: 'ACTIVE' }
    });

    const completedCycles = await prisma.subscriptionCycle.count({
      where: { status: 'COMPLETED' }
    });

    // Get revenue statistics
    const thisMonthRevenue = await prisma.payment.aggregate({
      where: {
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        createdAt: { gte: monthStart }
      },
      _sum: {
        finalAmount: true
      }
    });

    const lastMonthRevenue = await prisma.payment.aggregate({
      where: {
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd }
      },
      _sum: {
        finalAmount: true
      }
    });

    res.json({
      success: true,
      data: {
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          inBuffer: subscriptionsInBuffer,
          thisMonth: thisMonthSubscriptions,
          lastMonth: lastMonthSubscriptions,
          growth: lastMonthSubscriptions > 0 ? 
            ((thisMonthSubscriptions - lastMonthSubscriptions) / lastMonthSubscriptions * 100).toFixed(2) : '0'
        },
        bufferPeriods: {
          active: activeBufferPeriods,
          thisMonth: thisMonthBufferPeriods
        },
        cycles: {
          active: activeCycles,
          completed: completedCycles
        },
        revenue: {
          thisMonth: thisMonthRevenue._sum.finalAmount || 0,
          lastMonth: lastMonthRevenue._sum.finalAmount || 0,
          growth: lastMonthRevenue._sum.finalAmount > 0 ?
            (((thisMonthRevenue._sum.finalAmount || 0) - (lastMonthRevenue._sum.finalAmount || 0)) / (lastMonthRevenue._sum.finalAmount || 0) * 100).toFixed(2) : '0'
        }
      }
    });

  } catch (error) {
    console.error('Error getting subscription analytics:', error);
    res.status(500).json({ message: 'Failed to get subscription analytics' });
  }
};

module.exports = {
  getSubscriptionPlans,
  subscribeToPlan,
  getUserSubscription,
  getMonthlySubscriptionStatus,
  startBufferPeriod,
  endBufferPeriod,
  completeSubscriptionPayment,
  cancelSubscription,
  checkSubscriptionStatus,
  updateSubscriptionPlan,
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionCycles,
  getBufferPeriods,
  adminStartBufferPeriod,
  adminEndBufferPeriod,
  getSubscriptionAnalytics
};
