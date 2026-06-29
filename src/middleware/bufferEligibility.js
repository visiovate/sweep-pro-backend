/**
 * Middleware to check if user's subscription plan has buffer system access
 * Only Sweepro Lux users should have access to buffer features
 */

const checkBufferEligibility = async (req, res, next) => {
  try {
    // Get user's current subscription
    const subscription = await req.prisma.subscription.findFirst({
      where: {
        customer: {
          userId: req.user.id
        },
        status: 'ACTIVE'
      },
      include: {
        plan: true
      }
    });

    // Check if subscription exists and is active
    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: 'No active subscription found. Buffer system is only available for active subscriptions.',
        code: 'NO_ACTIVE_SUBSCRIPTION'
      });
    }

    // Check if plan has buffer system enabled
    if (!subscription.plan.hasBufferSystem) {
      return res.status(403).json({
        success: false,
        message: `Buffer system is only available for Sweepro Lux plan. Your current plan (${subscription.plan.name}) does not have access to buffer features.`,
        code: 'PLAN_NOT_ELIGIBLE_FOR_BUFFER',
        currentPlan: subscription.plan.name,
        requiredPlan: 'Sweepro Lux'
      });
    }

    // Attach subscription to request for use in controller
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Buffer eligibility check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking buffer eligibility',
      error: error.message
    });
  }
};

module.exports = checkBufferEligibility;
