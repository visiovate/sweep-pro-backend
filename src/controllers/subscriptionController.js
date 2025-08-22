const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');
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
        nextBillDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
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

// Confirm next day service
const confirmNextDayService = async (req, res) => {
  try {
    const userId = req.user.id;
    const { confirm } = req.body; // true or false

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // Check if user has active subscription
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

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    if (confirm) {
      // Create booking for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM

      // Get user's address
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      const booking = await prisma.booking.create({
        data: {
          customerId: userId,
          serviceId: subscription.plan.serviceId,
          scheduledAt: tomorrow,
          serviceAddress: user.address || 'Address not provided',
          status: 'CONFIRMED',
          estimatedDuration: subscription.plan.service.baseDuration,
          totalAmount: subscription.plan.finalPrice / subscription.plan.sessionsPerMonth,
          finalAmount: subscription.plan.finalPrice / subscription.plan.sessionsPerMonth,
          discount: 0,
          specialInstructions: 'Subscription-based daily service'
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

      // Send notification for booking creation
      await notificationService.notifyBookingCreated(booking);

      res.json({
        success: true,
        message: 'Service confirmed for tomorrow',
        booking
      });
    } else {
      res.json({
        success: true,
        message: 'Service skipped for tomorrow'
      });
    }

  } catch (error) {
    console.error('Error confirming next day service:', error);
    res.status(500).json({ message: 'Failed to confirm service' });
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

module.exports = {
  getSubscriptionPlans,
  subscribeToPlan,
  getUserSubscription,
  confirmNextDayService,
  completeSubscriptionPayment,
  cancelSubscription,
  checkSubscriptionStatus,
  updateSubscriptionPlan,
  createSubscriptionPlan,
  deleteSubscriptionPlan
};
