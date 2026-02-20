const { getPrismaClient } = require('../utils/database');
/**
 * Middleware to validate subscription status for booking operations
 * CRITICAL: Only ACTIVE subscriptions are allowed to create bookings
 * PENDING_PAYMENT subscriptions must complete payment first
 */

const { PrismaClient } = require('@prisma/client');
const prisma = getPrismaClient();

const validateActiveSubscription = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    console.log(`🔍 Validating subscription for user: ${userId}`);

    // Get customer profile
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      // Create customer profile if doesn't exist
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true }
      });

      if (!user || user.role !== 'CUSTOMER') {
        return res.status(403).json({
          success: false,
          message: 'Only customers can create bookings'
        });
      }

      customerProfile = await prisma.customerProfile.create({
        data: {
          userId,
          preferences: {},
          emergencyContact: null,
          specialInstructions: null
        }
      });
    }

    // ✅ CRITICAL: Only allow ACTIVE subscriptions (NOT PENDING_PAYMENT)
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      include: {
        plan: true,
        payments: {
          where: { status: 'COMPLETED' },
          take: 1
        }
      }
    });

    if (!subscription) {
      console.warn(`⚠️  User ${userId} attempted to book without ACTIVE subscription`);
      
      // Check if they have a PENDING_PAYMENT subscription
      const pendingSubscription = await prisma.subscription.findFirst({
        where: {
          customerId: customerProfile.id,
          status: 'PENDING_PAYMENT'
        }
      });

      if (pendingSubscription) {
        return res.status(402).json({
          success: false,
          message: 'Payment Pending - Your subscription payment is not complete. Please complete payment to book services.',
          code: 'PAYMENT_PENDING',
          subscriptionId: pendingSubscription.id
        });
      }

      return res.status(403).json({
        success: false,
        message: 'Active Subscription Required - You need an active subscription to book services.',
        code: 'NO_ACTIVE_SUBSCRIPTION'
      });
    }

    // Verify subscription has a completed payment
    if (subscription.payments.length === 0) {
      console.warn(`⚠️  CRITICAL: ACTIVE subscription ${subscription.id} has no completed payments. Reverting to PENDING_PAYMENT.`);
      
      // Revert subscription to PENDING_PAYMENT
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'PENDING_PAYMENT',
          updatedAt: new Date()
        }
      });

      return res.status(402).json({
        success: false,
        message: 'Payment Validation Failed - Subscription was in invalid state. Please complete payment to book.',
        code: 'PAYMENT_VALIDATION_FAILED'
      });
    }

    // Store subscription in request for controller use
    req.subscription = subscription;
    req.customerProfile = customerProfile;

    console.log(`✅ Subscription validated for user ${userId}:`, {
      subscriptionId: subscription.id,
      planName: subscription.plan.name,
      status: subscription.status,
      hasPayment: subscription.payments.length > 0
    });

    next();
  } catch (error) {
    console.error('Error validating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  validateActiveSubscription
};
