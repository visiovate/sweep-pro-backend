const { getPrismaClient, initializePrisma } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const subscriptionBufferService = require('../services/subscriptionBufferService');
const { calculatePrice } = require('../services/pricingService');
const { publishNotificationEvent } = require('../notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('../notifications/events/topics');
const prisma = getPrismaClient();

// Get all subscription plans
const getSubscriptionPlans = async (req, res) => {
  try {
    // Use initializePrisma() to ensure Prisma is ready on first request,
    // avoiding a null-dereference crash when the module-level `prisma`
    // snapshot was taken before the DB connection was established.
    const db = (await initializePrisma()) || prisma;
    const plans = await db.servicePlan.findMany({
      where: { isActive: true },
      include: {
        service: true,
        propertyPricing: {
          orderBy: [
            { bhkType: 'asc' },
            { squareFeet: 'asc' }
          ]
        }
      }
    });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ message: 'Failed to fetch subscription plans' });
  }
};

// Available time slots (limited to 14:00)
const AVAILABLE_TIME_SLOTS = [
  // Frontend payment page slots (2-hour slots with spaces)
  '06:00 - 08:00',
  '08:00 - 10:00',
  '10:00 - 12:00',
  '12:00 - 14:00',
  // Database/seed slots (3-hour slots without spaces)
  '08:00-11:00',
  '09:00-12:00',
  '10:00-13:00',
  '11:00-14:00',
  '12:00-15:00',
  '13:00-16:00',
  '14:00-17:00',
  '15:00-18:00',
  '16:00-19:00'
];

const MAX_USERS_PER_SLOT = 20;

// Subscribe user to a plan
const subscribeToPlan = async (req, res) => {
  try {
    const { planId, startDate: requestedStartDate, serviceDetails, planDuration } = req.body;
    const userId = req.user.id;

    // Extract timeSlot from serviceDetails
    const timeSlot = serviceDetails?.timeSlot;

    // Validate time slot if provided
    if (timeSlot && !AVAILABLE_TIME_SLOTS.includes(timeSlot)) {
      return res.status(400).json({
        success: false,
        message: `Invalid time slot. Available slots are: ${AVAILABLE_TIME_SLOTS.join(', ')}`
      });
    }

    // Check time slot availability if time slot is provided (global count, not date-specific)
    if (timeSlot) {
      const slotAvailable = await isTimeSlotAvailableInternal(timeSlot);
      if (!slotAvailable) {
        return res.status(400).json({
          success: false,
          message: `Time slot ${timeSlot} is fully booked (maximum ${MAX_USERS_PER_SLOT} users). Please select a different time slot.`,
          slotFull: true
        });
      }
    }

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

    // Get the plan details
    const plan = await prisma.servicePlan.findUnique({
      where: { id: planId }
    });

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    if (!plan.isActive) {
      return res.status(400).json({ message: 'This plan is no longer available for new subscriptions' });
    }

    // Calculate subscription dates
    // Use the requested start date from frontend, or default to today
    const startDate = requestedStartDate ? new Date(requestedStartDate) : new Date();
    // Ensure start date is at least today (not in the past)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      startDate.setTime(today.getTime());
    }
    console.log(`✅ Subscription start date: ${startDate.toISOString()} (requested: ${requestedStartDate || 'none'})`);

    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + plan.duration);

    // Authoritatively determine subscription amount using PricingService
    const propertyType = serviceDetails?.propertyType || 'apartment';
    const bhkType = serviceDetails?.bhkType;
    const squareFeet = serviceDetails?.squareFeet;
    const billingCycle = planDuration || serviceDetails?.planDuration || '1month';

    const pricingResult = await calculatePrice({
      planId,
      propertyType,
      bhkType,
      squareFeet,
      billingCycle
    });

    const billedAmount = pricingResult.amount;
    console.log(`✅ Authoritative subscription price calculated: ₹${billedAmount} (${propertyType}, ${bhkType}, ${squareFeet} sq ft, cycle: ${billingCycle})`);

    const existingSubscription = await prisma.subscription.findUnique({
      where: { customerId },
      include: {
        plan: {
          include: {
            service: true
          }
        }
      }
    });

    if (existingSubscription) {
      if (existingSubscription.status === 'ACTIVE' && existingSubscription.endDate >= new Date()) {
        return res.status(400).json({
          message: 'You already have an active subscription'
        });
      }

      if (existingSubscription.status === 'PENDING_PAYMENT') {
        const updatedSubscription = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            planId,
            startDate,
            endDate,
            amount: billedAmount,
            discount: 0,
            nextBillDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000),
            bufferDaysCount: plan.hasBufferSystem ? (plan.bufferDaysAllowed || 0) : 0,
            bufferDaysUsed: 0,
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

        return res.status(200).json({
          success: true,
          data: updatedSubscription,
          message: 'Subscription is pending payment'
        });
      }

      const updatedSubscription = await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          planId,
          status: 'PENDING_PAYMENT',
          startDate,
          endDate,
          billingCycle: 'MONTHLY',
          amount: billedAmount,
          discount: 0,
          autoRenew: true,
          nextBillDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000),
          bufferDaysCount: plan.hasBufferSystem ? (plan.bufferDaysAllowed || 0) : 0,
          bufferDaysUsed: 0,
          isInBufferPeriod: false,
          bufferStartDate: null,
          bufferEndDate: null,
          isPaused: false,
          pausedAt: null,
          resumeAt: null,
          pauseReason: null,
          totalCycles: 0,
          completedCycles: 0,
          lastRenewalDate: null,
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

      return res.status(201).json({
        success: true,
        data: updatedSubscription,
        message: 'Successfully subscribed to plan'
      });
    }

    // Create subscription (initially pending payment)
    // Buffer configuration depends on plan type
    const subscription = await prisma.subscription.create({
      data: {
        customerId,
        planId,
        status: 'PENDING_PAYMENT',
        startDate,
        endDate,
        billingCycle: 'MONTHLY',
        amount: billedAmount,
        discount: 0,
        autoRenew: true,
        nextBillDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        bufferDaysCount: plan.hasBufferSystem ? (plan.bufferDaysAllowed || 0) : 0,
        bufferDaysUsed: 0,
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

    // Update user's timeSlot if provided in serviceDetails
    if (timeSlot) {
      await prisma.user.update({
        where: { id: userId },
        data: { timeSlot: timeSlot }
      });
      console.log(`✅ Updated user ${userId} timeSlot to: ${timeSlot}`);
    }

    // NOTE: We no longer create an initial PENDING payment here.
    // Razorpay flows create payment records via razorpayService when
    // an order is created and later mark them COMPLETED on verification.

    res.status(201).json({
      success: true,
      data: subscription,
      message: 'Successfully subscribed to plan'
    });

  } catch (error) {
    console.error('Error subscribing to plan:', error);
    if (error.message && (error.message.includes('PropertyPricing record not found') || error.message.includes('Invalid') || error.message.includes('Missing required calculation parameters'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ message: 'Failed to subscribe to plan' });
  }
};

// Get user's current subscription
const getUserSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get customer profile
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      if (!user || user.role !== 'CUSTOMER') {
        return res.status(404).json({ message: 'Customer profile not found' });
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

    const customerIdCandidates = [customerProfile.id, userId];

    // First check for active subscription
    let subscription = await prisma.subscription.findFirst({
      where: {
        customerId: { in: customerIdCandidates },
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      include: {
        plan: {
          include: {
            service: true
          }
        },
        customer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true
              }
            }
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
          customerId: { in: customerIdCandidates },
          status: 'PENDING_PAYMENT'
        },
        include: {
          plan: {
            include: {
              service: true
            }
          },
          customer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  address: true
                }
              }
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
      // Return success with null subscription instead of 404 error
      return res.json({
        success: true,
        subscription: null,
        message: 'No active subscription found'
      });
    }

    // CRITICAL VALIDATION: Verify ACTIVE subscription has a COMPLETED payment
    // If an ACTIVE subscription doesn't have a COMPLETED payment, revert it to PENDING_PAYMENT
    if (subscription.status === 'ACTIVE') {
      const completedPayment = await prisma.payment.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: 'COMPLETED'
        }
      });

      if (!completedPayment) {
        console.warn(`⚠️  CRITICAL: ACTIVE subscription ${subscription.id} has NO completed payment. Reverting to PENDING_PAYMENT.`);

        // Revert to PENDING_PAYMENT
        subscription = await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'PENDING_PAYMENT',
            updatedAt: new Date()
          },
          include: {
            plan: {
              include: {
                service: true
              }
            },
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    address: true
                  }
                }
              }
            },
            payments: {
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        });

        return res.json({
          success: true,
          subscription,
          message: 'Subscription was in invalid state (ACTIVE without payment). Reverted to PENDING_PAYMENT. Please complete payment.'
        });
      }
    }

    res.json({
      success: true,
      subscription
    });
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
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      if (!user || user.role !== 'CUSTOMER') {
        return res.status(404).json({ message: 'Customer profile not found' });
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

    const customerIdCandidates = [customerProfile.id, userId];

    // ✅ FIXED: Only return ACTIVE subscriptions (not PENDING_PAYMENT)
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: { in: customerIdCandidates },
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      }
    });

    if (!subscription) {
      return res.json({
        hasActiveSubscription: false,
        message: 'No active subscription found. Please complete payment or purchase a subscription.'
      });
    }

    // CRITICAL VALIDATION: Verify ACTIVE subscription has a COMPLETED payment
    const completedPayment = await prisma.payment.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: 'COMPLETED'
      }
    });

    if (!completedPayment) {
      console.warn(`⚠️  CRITICAL: ACTIVE subscription ${subscription.id} has NO completed payment. Reverting to PENDING_PAYMENT.`);

      // Revert to PENDING_PAYMENT
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'PENDING_PAYMENT',
          updatedAt: new Date()
        }
      });

      return res.json({
        hasActiveSubscription: false,
        message: 'Subscription was in invalid state. Reverted to PENDING_PAYMENT. Please complete payment to activate.'
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

    // Get active subscription with plan details
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerProfile.id,
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      include: {
        plan: true
      }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    // Check if plan supports buffer system
    if (!subscription.plan.hasBufferSystem) {
      return res.status(400).json({
        message: 'Your current plan (Sweepro Touch) does not support buffer system. Please upgrade to Sweepro Lux to access buffer functionality.',
        planType: subscription.plan.planType,
        upgradeRequired: true
      });
    }

    if (subscription.isInBufferPeriod) {
      return res.status(400).json({ message: 'Subscription is already in buffer period' });
    }

    // Check buffer days availability
    if (subscription.bufferDaysUsed >= subscription.bufferDaysCount) {
      return res.status(400).json({
        message: `You have used all ${subscription.bufferDaysCount} buffer days for this period.`,
        bufferDaysUsed: subscription.bufferDaysUsed,
        bufferDaysTotal: subscription.bufferDaysCount
      });
    }

    const bufferPeriod = await subscriptionBufferService.startBufferPeriod(subscription.id, reason);

    res.json({
      success: true,
      message: 'Buffer period started successfully',
      bufferPeriod,
      remainingBufferDays: subscription.bufferDaysCount - subscription.bufferDaysUsed - 1
    });

  } catch (error) {
    console.error('Error starting buffer period:', error);
    res.status(500).json({
      message: error.message || 'Failed to start buffer period',
      error: error.message
    });
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
    return res.status(410).json({
      error: 'This endpoint is deprecated. Use /api/payments/razorpay/verify to verify payment and activate subscription.'
    });

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

    await publishNotificationEvent({
      topic: NOTIFICATION_TOPICS.SUBSCRIPTION_ACTIVATED,
      payload: { subscriptionId: subscription.id },
      dedupeKey: `subscription-activated:${subscription.id}:${subscription.updatedAt.toISOString()}`
    });

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

    if (existingSubscription) {
      await publishNotificationEvent({
        topic: NOTIFICATION_TOPICS.SUBSCRIPTION_CANCELLED,
        payload: { subscriptionId: existingSubscription.id },
        dedupeKey: `subscription-cancelled:${existingSubscription.id}:${new Date().toISOString().slice(0, 10)}`
      });
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
      serviceId,
      planType,
      bufferDaysAllowed,
      hasBufferSystem
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

    // Validate buffer configuration
    const finalHasBufferSystem = hasBufferSystem !== undefined ? hasBufferSystem : existingPlan.hasBufferSystem;
    const finalBufferDaysAllowed = bufferDaysAllowed !== undefined ? bufferDaysAllowed : existingPlan.bufferDaysAllowed;

    if (!finalHasBufferSystem && finalBufferDaysAllowed > 0) {
      return res.status(400).json({
        message: 'Cannot set buffer days for a plan without buffer system enabled'
      });
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
        serviceId,
        planType: planType || existingPlan.planType,
        bufferDaysAllowed: finalBufferDaysAllowed,
        hasBufferSystem: finalHasBufferSystem
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
      serviceId,
      planType,
      bufferDaysAllowed,
      hasBufferSystem
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

    // Validate buffer configuration
    const finalHasBufferSystem = hasBufferSystem || false;
    const finalBufferDaysAllowed = bufferDaysAllowed || 0;

    if (!finalHasBufferSystem && finalBufferDaysAllowed > 0) {
      return res.status(400).json({
        message: 'Cannot set buffer days for a plan without buffer system enabled'
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
        serviceId,
        planType: planType || 'TOUCH',
        bufferDaysAllowed: finalBufferDaysAllowed,
        hasBufferSystem: finalHasBufferSystem
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

// Admin: Get subscription by ID with full details
const getSubscriptionById = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
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
                addressLine: true,
                city: true,
                state: true,
                pincode: true,
                landmark: true,
                locality: true,
                apartment_id: true,
                profileImage: true,
                timeSlot: true,
                createdAt: true,
              }
            }
          }
        },
        plan: {
          include: {
            service: true
          }
        },
        cycles: {
          orderBy: { startDate: 'desc' },
          take: 5,
        },
        bufferPeriods: {
          orderBy: { startDate: 'desc' },
          take: 5,
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            amount: true,
            finalAmount: true,
            status: true,
            paymentMethod: true,
            transactionId: true,
            createdAt: true,
          }
        },
      }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    // Get recent bookings for this customer
    const recentBookings = await prisma.booking.findMany({
      where: {
        customerId: subscription.customer?.userId,
        isSubscriptionBased: true,
      },
      orderBy: { scheduledAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        completedAt: true,
        service: { select: { name: true } },
        maid: { select: { name: true } },
      }
    });

    res.json({
      success: true,
      data: { ...subscription, recentBookings }
    });
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    res.status(500).json({ message: 'Failed to fetch subscription details' });
  }
};

// Admin: Cancel a subscription
const adminCancelSubscription = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { customer: { include: { user: { select: { name: true, email: true } } } } }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
      return res.status(400).json({ message: `Subscription is already ${subscription.status.toLowerCase()}` });
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        pauseReason: reason || 'Cancelled by admin',
        updatedAt: new Date(),
      }
    });

    res.json({
      success: true,
      data: updated,
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
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

// Get upcoming services for subscription
const getUpcomingServices = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ message: 'Customer profile not found' });
    }

    // Get upcoming bookings for the customer
    const now = new Date();
    const upcomingBookings = await prisma.booking.findMany({
      where: {
        customerId: userId,
        scheduledAt: { gte: now },
        status: { in: ['CONFIRMED', 'ASSIGNED', 'PENDING'] },
        isSubscriptionBased: true
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
      orderBy: { scheduledAt: 'asc' },
      take: 10
    });

    res.json({
      success: true,
      data: {
        services: upcomingBookings.map(booking => ({
          id: booking.id,
          serviceName: booking.service.name,
          status: booking.status,
          scheduledTime: booking.scheduledAt,
          maidName: booking.maid?.name,
          duration: booking.service.baseDuration,
          isSubscriptionBased: booking.isSubscriptionBased,
          isBufferSkipped: booking.isBufferSkipped,
          serviceAddress: booking.serviceAddress,
          finalAmount: booking.finalAmount
        }))
      }
    });

  } catch (error) {
    console.error('Error getting upcoming services:', error);
    res.status(500).json({ message: 'Failed to get upcoming services' });
  }
};

// Get global time slot counts (total customers who selected each slot)
const getTimeSlotCounts = async (req, res) => {
  try {
    // Get all time slot bookings (global counts)
    const existingSlots = await prisma.timeSlotBooking.findMany();

    console.log(`📊 Time Slot Counts Query - Found ${existingSlots.length} slots in database:`);
    existingSlots.forEach(slot => {
      console.log(`   - ${slot.timeSlot}: ${slot.count}/${slot.maxLimit}`);
    });

    // Build the response with counts for all available slots
    const slotCounts = AVAILABLE_TIME_SLOTS.map(slot => {
      const existingSlot = existingSlots.find(s => s.timeSlot === slot);
      const count = existingSlot ? existingSlot.count : 0;
      const maxLimit = existingSlot ? existingSlot.maxLimit : MAX_USERS_PER_SLOT;

      return {
        timeSlot: slot,
        count: count,
        maxLimit: maxLimit,
        available: maxLimit - count,
        isDisabled: count >= maxLimit
      };
    });

    console.log(`📤 Returning time slot counts response:`, JSON.stringify(slotCounts, null, 2));

    res.json({
      success: true,
      data: {
        slots: slotCounts,
        totalSlots: AVAILABLE_TIME_SLOTS.length,
        maxUsersPerSlot: MAX_USERS_PER_SLOT
      }
    });

  } catch (error) {
    console.error('Error getting time slot counts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get time slot counts'
    });
  }
};

// Increment time slot count when a subscription is created/activated
const incrementTimeSlotCount = async (timeSlot) => {
  try {
    console.log(`🔄 Attempting to increment count for timeSlot: "${timeSlot}"`);

    // Validate timeSlot format
    if (!timeSlot || typeof timeSlot !== 'string') {
      console.warn(`⚠️ Invalid timeSlot provided to incrementTimeSlotCount:`, timeSlot);
      throw new Error(`Invalid timeSlot: ${timeSlot}`);
    }

    // Check if timeSlot is in available slots
    if (!AVAILABLE_TIME_SLOTS.includes(timeSlot)) {
      console.warn(`⚠️ TimeSlot not in AVAILABLE_TIME_SLOTS list: "${timeSlot}"`);
      console.warn(`Available slots:`, AVAILABLE_TIME_SLOTS);
    }

    // Upsert - create if doesn't exist, increment if exists
    const result = await prisma.timeSlotBooking.upsert({
      where: {
        timeSlot: timeSlot
      },
      update: {
        count: { increment: 1 }
      },
      create: {
        timeSlot: timeSlot,
        count: 1,
        maxLimit: MAX_USERS_PER_SLOT
      }
    });

    console.log(`✅ Time slot count incremented: "${timeSlot}" - new count: ${result.count}/${result.maxLimit}`);

    // Verify the increment actually worked by reading the record back
    const verified = await prisma.timeSlotBooking.findUnique({
      where: { timeSlot: timeSlot }
    });

    if (verified) {
      console.log(`✅ Verified in database: "${timeSlot}" count is ${verified.count}`);
    } else {
      console.error(`❌ Failed to verify timeSlot "${timeSlot}" in database after increment!`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error incrementing time slot count for "${timeSlot}":`, error.message);
    throw error;
  }
};

// Internal function to check if a time slot is available (used within subscribeToPlan)
const isTimeSlotAvailableInternal = async (timeSlot) => {
  try {
    const existingSlot = await prisma.timeSlotBooking.findUnique({
      where: {
        timeSlot: timeSlot
      }
    });

    if (!existingSlot) {
      return true; // Slot doesn't exist yet, so it's available
    }

    return existingSlot.count < existingSlot.maxLimit;
  } catch (error) {
    console.error('Error checking time slot availability:', error);
    return false;
  }
};

// Check if a time slot is available (not at max capacity) - exported version
const isTimeSlotAvailable = async (timeSlot) => {
  return isTimeSlotAvailableInternal(timeSlot);
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
  getSubscriptionAnalytics,
  getUpcomingServices,
  getTimeSlotCounts,
  incrementTimeSlotCount,
  isTimeSlotAvailable,
  getSubscriptionById,
  adminCancelSubscription,
  AVAILABLE_TIME_SLOTS,
  MAX_USERS_PER_SLOT
};
