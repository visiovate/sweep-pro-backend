const { razorpay, razorpayKeyId, razorpayKeySecret } = require('../utils/razorpay-credintials');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const subscriptionBufferService = require('./subscriptionBufferService');
const notificationService = require('./notificationService');

const prisma = new PrismaClient();

class RazorpayService {
  
  /**
   * Create Razorpay order for booking payment
   */
  async createBookingOrder(bookingId, amount, currency = 'INR') {
    try {
      // Verify booking exists
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          service: {
            select: {
              name: true,
              description: true
            }
          }
        }
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Create Razorpay order
      const orderOptions = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: currency,
        receipt: `bk_${bookingId.substring(0, 8)}_${Date.now().toString().slice(-8)}`,
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
      
      // Store order details in database
      await prisma.payment.create({
        data: {
          bookingId: bookingId,
          customerId: booking.customerId,
          amount: amount,
          finalAmount: amount,
          paymentMethod: 'CARD', // Default, will be updated
          status: 'PENDING',
          paymentType: 'BOOKING',
          gateway: 'razorpay',
          transactionId: order.id,
          gatewayResponse: order
        }
      });

      return {
        success: true,
        order: order,
        booking: booking
      };

    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      throw error;
    }
  }

  /**
   * Create Razorpay order for subscription payment
   * IMPORTANT: This does NOT create/modify subscription. Only creates payment order.
   * Subscription activation happens ONLY after successful payment.
   */
  async createSubscriptionOrder(subscriptionId, amount, currency = 'INR') {
    try {
      if (!razorpayKeyId || !razorpayKeySecret) {
        throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET (or RAZORPAY_TEST_KEY_ID/RAZORPAY_TEST_KEY_SECRET) in backend environment.');
      }

      // Verify subscription exists
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
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
              service: {
                select: {
                  name: true,
                  description: true
                }
              }
            }
          }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const customerUser = subscription?.customer?.user;
      const customerUserId = customerUser?.id || subscription?.customer?.userId;
      const planName = subscription?.plan?.name || 'Subscription Plan';
      const serviceName = subscription?.plan?.service?.name || 'Service';

      // Create Razorpay order
      const orderOptions = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: currency,
        receipt: `sub_${subscriptionId.substring(0, 8)}_${Date.now().toString().slice(-8)}`,
        notes: {
          subscriptionId: subscriptionId,
          customerId: customerUserId || subscription.customerId,
          customerName: customerUser?.name || '',
          customerEmail: customerUser?.email || '',
          planName,
          serviceName,
          paymentType: 'SUBSCRIPTION'
        }
      };

      const order = await razorpay.orders.create(orderOptions);
      
      // ===== IMPORTANT: ONLY create payment record, NOT subscription =====
      // Subscription will be activated ONLY after successful payment verification
      
      const existingPendingPayment = await prisma.payment.findFirst({
        where: {
          subscriptionId: subscriptionId,
          status: 'PENDING',
          gateway: { in: [null, 'razorpay'] }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (existingPendingPayment) {
        // Update existing pending payment
        await prisma.payment.update({
          where: { id: existingPendingPayment.id },
          data: {
            amount: amount,
            finalAmount: amount,
            paymentMethod: 'CARD',
            paymentType: 'SUBSCRIPTION',
            gateway: 'razorpay',
            transactionId: order.id,
            gatewayResponse: order,
            updatedAt: new Date()
          }
        });
      } else {
        // Create new pending payment
        // NOTE: customerId should be userId from customer.user.id
        await prisma.payment.create({
          data: {
            subscriptionId: subscriptionId,
            customerId: customerUserId,
            amount: amount,
            finalAmount: amount,
            paymentMethod: 'CARD',
            status: 'PENDING',
            paymentType: 'SUBSCRIPTION',
            gateway: 'razorpay',
            transactionId: order.id,
            gatewayResponse: order
          }
        });
      }

      return {
        success: true,
        order: order,
        subscription: subscription
      };

    } catch (error) {
      console.error('Error creating subscription order:', error);
      throw error;
    }
  }

  /**
   * Verify Razorpay payment signature
   */
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

  /**
   * Process successful payment
   * STRICT RULE: Does NOT activate subscription. Controller handles subscription activation.
   */
  async processSuccessfulPayment(paymentData) {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        payment_method
      } = paymentData;

      // Verify signature
      const isValidSignature = this.verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValidSignature) {
        throw new Error('Invalid payment signature');
      }

      // Fetch payment details from Razorpay
      const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

      const existingPayment = await prisma.payment.findFirst({
        where: { transactionId: razorpay_order_id },
        orderBy: { createdAt: 'desc' }
      });

      if (!existingPayment) {
        throw new Error('Payment record not found for this order');
      }
      
      // Update payment record in database to COMPLETED
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
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              },
              service: true
            }
          },
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
          }
        }
      });

      // Update booking status if it's a booking payment
      if (updatedPayment.bookingId) {
        await prisma.booking.update({
          where: { id: updatedPayment.bookingId },
          data: { status: 'CONFIRMED' }
        });
      }

      // Update subscription status if it's a subscription payment
      if (updatedPayment.subscriptionId) {
        const existingCycle = await prisma.subscriptionCycle.findFirst({
          where: {
            subscriptionId: updatedPayment.subscriptionId,
            cycleNumber: 1
          }
        });

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

        if (!existingCycle) {
          await subscriptionBufferService.initializeSubscriptionCycle(updatedPayment.subscriptionId, 1);
        }

        await subscriptionBufferService.scheduleMonthlyServices(updatedPayment.subscriptionId);
        await notificationService.notifySubscriptionCreated(updatedSubscription);
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

  /**
   * Handle failed payment
   */
  async processFailedPayment(paymentData) {
    try {
      const { razorpay_order_id, error_code, error_description } = paymentData;

      const existingPayment = await prisma.payment.findFirst({
        where: { transactionId: razorpay_order_id },
        orderBy: { createdAt: 'desc' }
      });

      if (!existingPayment) {
        throw new Error('Payment record not found for this order');
      }

      // Update payment record
      const updatedPayment = await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: 'FAILED',
          gatewayResponse: {
            error_code,
            error_description,
            failed_at: new Date()
          },
          updatedAt: new Date()
        }
      });

      return {
        success: false,
        payment: updatedPayment,
        error: {
          code: error_code,
          description: error_description
        }
      };

    } catch (error) {
      console.error('Error processing failed payment:', error);
      throw error;
    }
  }

  /**
   * Process refund
   */
  async processRefund(paymentId, refundAmount, refundReason) {
    try {
      // Get payment details
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          booking: true,
          subscription: true
        }
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'COMPLETED') {
        throw new Error('Can only refund completed payments');
      }

      // Get Razorpay payment ID from gateway response
      const razorpayPaymentId = payment.gatewayResponse?.id;
      if (!razorpayPaymentId) {
        throw new Error('Razorpay payment ID not found');
      }

      // Create refund in Razorpay
      const refundOptions = {
        amount: Math.round(refundAmount * 100), // Convert to paise
        notes: {
          reason: refundReason,
          refunded_by: 'system',
          original_payment_id: paymentId
        }
      };

      const refund = await razorpay.payments.refund(razorpayPaymentId, refundOptions);

      // Update payment record
      const refundStatus = refundAmount >= payment.finalAmount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      
      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: refundStatus,
          refundAmount: refundAmount,
          refundReason: refundReason,
          refundedAt: new Date(),
          gatewayResponse: {
            ...payment.gatewayResponse,
            refund: refund
          }
        }
      });

      return {
        success: true,
        refund: refund,
        payment: updatedPayment
      };

    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }

  /**
   * Get payment status from Razorpay
   */
  async getPaymentStatus(razorpayPaymentId) {
    try {
      const payment = await razorpay.payments.fetch(razorpayPaymentId);
      return payment;
    } catch (error) {
      console.error('Error fetching payment status:', error);
      throw error;
    }
  }

  /**
   * Create subscription plan in Razorpay
   */
  async createSubscriptionPlan(planData) {
    try {
      const {
        name,
        description,
        amount,
        currency = 'INR',
        interval = 1,
        period = 'monthly'
      } = planData;

      const planOptions = {
        period: period,
        interval: interval,
        item: {
          name: name,
          description: description,
          amount: Math.round(amount * 100), // Convert to paise
          currency: currency
        }
      };

      const plan = await razorpay.plans.create(planOptions);
      return plan;

    } catch (error) {
      console.error('Error creating subscription plan:', error);
      throw error;
    }
  }

  /**
   * Utility Methods
   */
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
