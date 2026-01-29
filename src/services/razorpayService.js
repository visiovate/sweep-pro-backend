const { razorpay, razorpayKeyId, razorpayKeySecret } = require('../utils/razorpay-credintials');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const subscriptionBufferService = require('./subscriptionBufferService');
const { publishNotificationEvent } = require('../notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('../notifications/events/topics');

const prisma = new PrismaClient();

class RazorpayService {
  
  async createBookingOrder(bookingId, amount, currency = 'INR') {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          service: { select: { name: true, description: true } }
        }
      });

      if (!booking) throw new Error('Booking not found');

      const orderOptions = {
        amount: Math.round(amount * 100),
        currency: currency,
        receipt: `bk_${bookingId.substring(0, 8)}_${Date.now()}`,
        notes: {
          bookingId: bookingId,
          customerId: booking.customerId,
          customerName: booking.customer.name,
          customerEmail: booking.customer.email,
          serviceName: booking.service.name,
          paymentType: 'BOOKING'
        }
      };

      const order = await razorpay.orders.create(orderOptions);
      
      await prisma.payment.create({
        data: {
          bookingId: bookingId,
          customerId: booking.customerId,
          amount: amount,
          finalAmount: amount,
          paymentMethod: 'CARD',
          status: 'PENDING',
          paymentType: 'BOOKING',
          gateway: 'razorpay',
          transactionId: order.id,
          gatewayResponse: order
        }
      });

      return { success: true, order: order, booking: booking };

    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      throw error;
    }
  }

  async ensurePostPaymentEffects(paymentRecord) {
    if (!paymentRecord) return;

    if (paymentRecord.bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: paymentRecord.bookingId },
        select: { id: true, status: true }
      });

      if (booking && booking.status !== 'CONFIRMED') {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'CONFIRMED' }
        });
      }
    }

    if (paymentRecord.subscriptionId) {
      const currentSubscription = await prisma.subscription.findUnique({
        where: { id: paymentRecord.subscriptionId },
        include: {
          plan: { include: { service: true } },
          customer: { include: { user: true } }
        }
      });

      if (!currentSubscription) return;

      const wasActive = currentSubscription.status === 'ACTIVE';
      const shouldActivate = !wasActive;

      const activatedSubscription = shouldActivate
        ? await prisma.subscription.update({
            where: { id: currentSubscription.id },
            data: {
              status: 'ACTIVE',
              nextBillDate: this.calculateNextBillDate(currentSubscription)
            },
            include: {
              plan: { include: { service: true } },
              customer: { include: { user: true } }
            }
          })
        : currentSubscription;

      const existingCycle = await prisma.subscriptionCycle.findFirst({
        where: {
          subscriptionId: activatedSubscription.id,
          startDate: { gte: activatedSubscription.startDate }
        }
      });

      if (!existingCycle) {
        await subscriptionBufferService.initializeSubscriptionCycle(activatedSubscription.id, 1);
        await subscriptionBufferService.scheduleMonthlyServices(activatedSubscription.id);
      }

      if (shouldActivate) {
        await publishNotificationEvent({
          topic: NOTIFICATION_TOPICS.SUBSCRIPTION_ACTIVATED,
          payload: { subscriptionId: activatedSubscription.id },
          dedupeKey: `subscription-activated:${activatedSubscription.id}`
        });
      }
    }
  }

  /**
   * Create Razorpay order for subscription payment
   * CLEAN IMPLEMENTATION - Uses updateMany to avoid Prisma validation issues
   */
  async createSubscriptionOrder(subscriptionId, amount, currency = 'INR') {
    try {
      console.log('✅ [PAYMENT] createSubscriptionOrder - Creating order for subscription:', subscriptionId);
      
      if (!razorpayKeyId || !razorpayKeySecret) {
        throw new Error('Razorpay credentials not configured');
      }

      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          customer: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
          plan: { include: { service: { select: { name: true, description: true } } } }
        }
      });

      if (!subscription) throw new Error('Subscription not found');

      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: currency,
        receipt: `sub_${subscriptionId.substring(0, 8)}_${Date.now()}`,
        notes: {
          subscriptionId: subscriptionId,
          paymentType: 'SUBSCRIPTION'
        }
      });

      console.log('✅ [PAYMENT] Razorpay order created:', order.id);

      // Use raw SQL to bypass Prisma validation issues
      await prisma.$executeRaw`
        UPDATE "Payment" 
        SET 
          gateway = 'razorpay',
          "transactionId" = ${order.id},
          "gatewayResponse" = ${JSON.stringify(order)}::jsonb,
          "updatedAt" = NOW()
        WHERE 
          "subscriptionId" = ${subscriptionId} 
          AND status = 'PENDING'
      `;

      console.log('✅ [PAYMENT] Updated payments with order details');

      return { success: true, order, subscription };

    } catch (error) {
      console.error('❌ [PAYMENT] createSubscriptionOrder error:', error.message);
      
      // Mark payment as FAILED using raw SQL
      try {
        await prisma.$executeRaw`
          UPDATE "Payment"
          SET 
            status = 'FAILED',
            "gatewayResponse" = ${JSON.stringify({ error: error.message })}::jsonb,
            "updatedAt" = NOW()
          WHERE
            "subscriptionId" = ${subscriptionId}
            AND status = 'PENDING'
        `;
        console.log('✅ [PAYMENT] Marked payments as FAILED');
      } catch (e) {
        console.error('Failed to mark payment as FAILED:', e.message);
      }
      
      throw error;
    }
  }

  verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    try {
      const body = razorpayOrderId + "|" + razorpayPaymentId;
      const expectedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(body.toString())
        .digest('hex');

      return expectedSignature === razorpaySignature;
    } catch (error) {
      console.error('Error verifying payment signature:', error);
      return false;
    }
  }

  async processSuccessfulPayment(paymentData) {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        payment_method
      } = paymentData;

      const isValidSignature = this.verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValidSignature) {
        throw new Error('Invalid payment signature');
      }

      const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

      if (paymentDetails.status !== 'captured') {
        throw new Error(`Payment status is '${paymentDetails.status}', not 'captured'`);
      }

      const existingPayment = await prisma.payment.findFirst({
        where: { transactionId: razorpay_order_id },
        orderBy: { createdAt: 'desc' }
      });

      if (!existingPayment) {
        throw new Error('Payment record not found for Razorpay order: ' + razorpay_order_id);
      }

      if (existingPayment.status === 'COMPLETED') {
        console.warn(`Payment ${razorpay_order_id} already processed`);
        return {
          success: true,
          payment: existingPayment,
          razorpayPayment: paymentDetails,
          note: 'Payment was already processed'
        };
      }
      
      const updatedPayment = await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: 'COMPLETED',
          paymentMethod: this.mapRazorpayMethod(payment_method || paymentDetails.method),
          gatewayResponse: paymentDetails,
          updatedAt: new Date()
        },
        include: {
          booking: {
            include: {
              customer: { select: { id: true, name: true, email: true, phone: true } },
              service: true
            }
          },
          subscription: {
            include: {
              customer: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
              plan: { include: { service: true } }
            }
          }
        }
      });

      if (updatedPayment.bookingId) {
        await prisma.booking.update({
          where: { id: updatedPayment.bookingId },
          data: { status: 'CONFIRMED' }
        });
      }

      if (updatedPayment.subscriptionId) {
        const subscriptionToActivate = await prisma.subscription.findUnique({
          where: { id: updatedPayment.subscriptionId }
        });

        if (!subscriptionToActivate) {
          throw new Error('Subscription not found');
        }

        if (subscriptionToActivate.status !== 'PENDING_PAYMENT') {
          console.warn(`Subscription already in ${subscriptionToActivate.status} status`);
          return {
            success: true,
            payment: updatedPayment,
            razorpayPayment: paymentDetails,
            note: 'Payment processed but subscription already in desired state'
          };
        }

        const updatedSubscription = await prisma.subscription.update({
          where: { id: updatedPayment.subscriptionId },
          data: {
            status: 'ACTIVE',
            nextBillDate: this.calculateNextBillDate(updatedPayment.subscription)
          },
          include: {
            plan: { include: { service: true } },
            customer: { include: { user: true } }
          }
        });

        const existingCycle = await prisma.subscriptionCycle.findFirst({
          where: { subscriptionId: updatedPayment.subscriptionId, cycleNumber: 1 }
        });

        if (!existingCycle) {
          await subscriptionBufferService.initializeSubscriptionCycle(updatedPayment.subscriptionId, 1);
        }

        await subscriptionBufferService.scheduleMonthlyServices(updatedPayment.subscriptionId);
      }

      return {
        success: true,
        payment: updatedPayment,
        razorpayPayment: paymentDetails
      };

    } catch (error) {
      console.error('Error processing successful payment:', error);
      throw error;
    }
  }

  async processFailedPayment(paymentData) {
    try {
      const { razorpay_order_id, error_code, error_description } = paymentData;

      const existingPayment = await prisma.payment.findFirst({
        where: { transactionId: razorpay_order_id },
        orderBy: { createdAt: 'desc' }
      });

      if (!existingPayment) {
        throw new Error('Payment record not found');
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: 'FAILED',
          gatewayResponse: { error_code, error_description, failed_at: new Date() },
          updatedAt: new Date()
        }
      });

      return {
        success: false,
        payment: updatedPayment,
        error: { code: error_code, description: error_description }
      };

    } catch (error) {
      console.error('Error processing failed payment:', error);
      throw error;
    }
  }

  async processRefund(paymentId, refundAmount, refundReason) {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { booking: true, subscription: true }
      });

      if (!payment) throw new Error('Payment not found');
      if (payment.status !== 'COMPLETED') throw new Error('Can only refund completed payments');

      const razorpayPaymentId = payment.gatewayResponse?.id;
      if (!razorpayPaymentId) throw new Error('Razorpay payment ID not found');

      const refund = await razorpay.payments.refund(razorpayPaymentId, {
        amount: Math.round(refundAmount * 100),
        notes: {
          reason: refundReason,
          refunded_by: 'system',
          original_payment_id: paymentId
        }
      });

      const refundStatus = refundAmount >= payment.finalAmount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      
      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: refundStatus,
          refundAmount: refundAmount,
          refundReason: refundReason,
          refundedAt: new Date(),
          gatewayResponse: { ...payment.gatewayResponse, refund: refund }
        }
      });

      return { success: true, refund: refund, payment: updatedPayment };

    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }

  async getPaymentStatus(razorpayPaymentId) {
    try {
      return await razorpay.payments.fetch(razorpayPaymentId);
    } catch (error) {
      console.error('Error fetching payment status:', error);
      throw error;
    }
  }

  async createSubscriptionPlan(planData) {
    try {
      const { name, description, amount, currency = 'INR', interval = 1, period = 'monthly' } = planData;

      const plan = await razorpay.plans.create({
        period: period,
        interval: interval,
        item: {
          name: name,
          description: description,
          amount: Math.round(amount * 100),
          currency: currency
        }
      });
      return plan;

    } catch (error) {
      console.error('Error creating subscription plan:', error);
      throw error;
    }
  }

  mapRazorpayMethod(method) {
    const methodMap = {
      'card': 'CARD',
      'netbanking': 'NET_BANKING',
      'upi': 'UPI',
      'wallet': 'WALLET',
      'bank_transfer': 'BANK_TRANSFER',
      'emandate': 'BANK_TRANSFER',
      'nach': 'BANK_TRANSFER'
    };
    return methodMap[method] || 'CARD';
  }

  calculateNextBillDate(subscription) {
    const currentDate = new Date();
    const billingCycle = subscription.billingCycle;
    
    switch (billingCycle) {
      case 'WEEKLY':
        return new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'MONTHLY':
        return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
      case 'QUARTERLY':
        return new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, currentDate.getDate());
      case 'YEARLY':
        return new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), currentDate.getDate());
      default:
        return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
    }
  }
}

module.exports = new RazorpayService();
