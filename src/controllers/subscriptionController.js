const { PrismaClient } = require('@prisma/client');
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

    // Create subscription
    const subscription = await prisma.subscription.create({
      data: {
        customerId,
        planId,
        status: 'ACTIVE',
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
        }
      });

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

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
};

module.exports = {
  getSubscriptionPlans,
  subscribeToPlan,
  getUserSubscription,
  confirmNextDayService,
  cancelSubscription
};
