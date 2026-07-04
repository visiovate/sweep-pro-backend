const { razorpay, razorpayKeyId, razorpayKeySecret } = require('../utils/razorpay-credintials');
const crypto = require('crypto');
const { getPrismaClient } = require('../utils/database');
const subscriptionBufferService = require('./subscriptionBufferService');
const { publishNotificationEvent } = require('../notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('../notifications/events/topics');
const { incrementTimeSlotCount } = require('../controllers/subscriptionController');
const { getWeekdayName } = require('../utils/timeUtils');

// Using getPrismaClient() directly

class RazorpayService {
  
  async createBookingOrder(bookingId, amount, currency = 'INR') {
    try {
      const booking = await getPrismaClient().booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          service: { select: { name: true, description: true } }
        }
      });

      if (!booking) throw new Error('Booking not found');

      // IDEMPOTENCY: If an order already exists for this booking with the same amount (e.g. network
      // retry), return it instead of creating a duplicate Razorpay order.
      const existingOrder = await getPrismaClient().payment.findFirst({
        where: { bookingId, status: { in: ['PENDING', 'PROCESSING'] }, transactionId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { transactionId: true, gatewayResponse: true, amount: true }
      });

      if (existingOrder?.transactionId && existingOrder?.gatewayResponse && Math.round(existingOrder.amount * 100) === Math.round(amount * 100)) {
        console.warn(`[IDEMPOTENCY] Returning existing Razorpay order ${existingOrder.transactionId} for booking ${bookingId}`);
        return { success: true, order: existingOrder.gatewayResponse, booking };
      }

      // receipt must be unique per merchant; append short timestamp to avoid collision if amount changed or retried after failure
      const orderOptions = {
        amount: Math.round(amount * 100),
        currency: currency,
        receipt: `bk_${bookingId.replace(/-/g, '').substring(0, 20)}_${Date.now().toString().slice(-8)}`,
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
      
      await getPrismaClient().payment.create({
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
      const booking = await getPrismaClient().booking.findUnique({
        where: { id: paymentRecord.bookingId },
        select: { id: true, status: true }
      });

      if (booking && booking.status !== 'CONFIRMED') {
        await getPrismaClient().booking.update({
          where: { id: booking.id },
          data: { status: 'CONFIRMED' }
        });
      }
    }

    if (paymentRecord.subscriptionId) {
      const currentSubscription = await getPrismaClient().subscription.findUnique({
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
        ? await getPrismaClient().subscription.update({
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

      const existingCycle = await getPrismaClient().subscriptionCycle.findFirst({
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

        // Create initial booking for tomorrow immediately after payment
        // This ensures the "Next Booking" shows up right away in the admin panel
        await this.createInitialBookingForSubscriber(activatedSubscription);
      }
    }
  }

  /**
   * Create the first booking for a new subscriber immediately after payment
   * This ensures they see a booking in "Next Booking" right away
   * @param {Object} subscription - The activated subscription with customer and plan info
   */
  async createInitialBookingForSubscriber(subscription) {
    try {
      const customerId = subscription.customer.userId;
      const customer = subscription.customer.user;

      console.log(`📅 Creating initial booking for new subscriber: ${customer.name} (${customerId})`);

      // Check if customer has an active maid assignment
      const assignment = await getPrismaClient().customerMaidAssignment.findFirst({
        where: {
          customerId: customerId,
          isActive: true
        },
        include: {
          maid: {
            include: {
              user: { select: { id: true, name: true } }
            }
          }
        }
      });

      if (!assignment) {
        console.log(`⚠️ No maid assigned to customer ${customer.name}, skipping initial booking creation`);
        return null;
      }

      // Calculate tomorrow's date
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);

      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);

      // Check if maid is on weekly off tomorrow
      const tomorrowWeekday = getWeekdayName(tomorrow);
      if (assignment.maid.weeklyOffDay) {
        const normalizedWeekday = tomorrowWeekday.toUpperCase();
        const normalizedOffDay = assignment.maid.weeklyOffDay.toUpperCase();
        if (normalizedWeekday === normalizedOffDay) {
          console.log(`🏖️ Maid's weekly off tomorrow (${assignment.maid.weeklyOffDay}), skipping booking`);
          return null;
        }
      }

      // Check if booking already exists for tomorrow
      const existingBooking = await getPrismaClient().booking.findFirst({
        where: {
          customerId: customerId,
          scheduledAt: {
            gte: tomorrow,
            lt: dayAfterTomorrow
          }
        }
      });

      if (existingBooking) {
        console.log(`📋 Booking already exists for tomorrow (${existingBooking.id}), skipping`);
        return existingBooking;
      }

      // Get default service
      let defaultService = await getPrismaClient().service.findFirst({
        where: {
          isActive: true,
          isSubscriptionService: true
        }
      });

      if (!defaultService) {
        defaultService = await getPrismaClient().service.findFirst({
          where: { isActive: true }
        });
      }

      if (!defaultService) {
        console.error('❌ No active service found for booking creation');
        return null;
      }

      // Parse customer's time slot
      const timeSlot = customer.timeSlot || '09:00-12:00';
      const startTime = timeSlot.split('-')[0] || '09:00';
      const [hoursIST, minutesIST] = startTime.split(':').map(Number);

      // Convert IST to UTC (IST is UTC+5:30)
      const scheduledAtIST = new Date(tomorrow);
      scheduledAtIST.setUTCHours(hoursIST || 9, minutesIST || 0, 0, 0);
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const scheduledAt = new Date(scheduledAtIST.getTime() - IST_OFFSET_MS);

      // Create the booking
      const booking = await getPrismaClient().booking.create({
        data: {
          customerId: customerId,
          maidId: assignment.maid.userId,
          serviceId: defaultService.id,
          scheduledAt: scheduledAt,
          slot_date: tomorrow,
          slot_time: scheduledAt,
          timeSlot: timeSlot,
          status: 'PENDING',
          assignmentStatus: 'PENDING_ASSIGNMENT',
          assignment_sent: false,
          totalAmount: defaultService.basePrice,
          finalAmount: defaultService.basePrice,
          serviceAddress: customer.address || 'Customer Address',
          estimatedDuration: defaultService.baseDuration,
          isAutomatic: true,
          specialInstructions: `Initial booking after subscription payment for ${timeSlot} time slot`
        }
      });

      // Calculate expiry time for assignment request (24 hours or 2 hours before service)
      const ASSIGNMENT_REQUEST_EXPIRY_HOURS = 24;
      const MIN_HOURS_BEFORE_SERVICE = 2;
      const hoursBeforeService = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      let expiresAt;
      if (hoursBeforeService > ASSIGNMENT_REQUEST_EXPIRY_HOURS + MIN_HOURS_BEFORE_SERVICE) {
        expiresAt = new Date(now.getTime() + (ASSIGNMENT_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000));
      } else {
        expiresAt = new Date(scheduledAt.getTime() - (MIN_HOURS_BEFORE_SERVICE * 60 * 60 * 1000));
      }

      // Create AssignmentRequest so maid can accept/reject
      const assignmentRequest = await getPrismaClient().assignmentRequest.create({
        data: {
          bookingId: booking.id,
          maidId: assignment.maid.id, // MaidProfile ID
          status: 'pending',
          expiresAt: expiresAt
        }
      });

      // Update booking to mark assignment request sent
      await getPrismaClient().booking.update({
        where: { id: booking.id },
        data: {
          assignment_sent: true,
          assignment_sent_at: now
        }
      });

      // Send notification to maid
      try {
        await getPrismaClient().notification.create({
          data: {
            userId: assignment.maid.userId,
            type: 'ASSIGNMENT_REQUEST',
            title: 'New Service Assignment Request',
            message: `You have a new service assignment for ${customer.name} on ${tomorrow.toISOString().split('T')[0]} at ${hoursIST}:${String(minutesIST || 0).padStart(2, '0')} IST. Please respond within 24 hours.`,
            data: {
              bookingId: booking.id,
              assignmentRequestId: assignmentRequest.id,
              serviceAddress: customer.address,
              scheduledAt: scheduledAt.toISOString(),
              expiresAt: expiresAt.toISOString()
            }
          }
        });
      } catch (notifError) {
        console.warn(`⚠️ Failed to send notification to maid: ${notifError.message}`);
      }

      console.log(`✅ Initial booking created for ${customer.name}: ${booking.id.substring(0, 8)}... @ ${hoursIST}:${minutesIST || '00'} IST`);
      console.log(`📬 Assignment request created: ${assignmentRequest.id.substring(0, 8)}... (expires: ${expiresAt.toISOString()})`);
      return booking;

    } catch (error) {
      console.error(`❌ Failed to create initial booking for subscriber:`, error.message);
      // Don't throw - this is a non-critical operation
      return null;
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

      const subscription = await getPrismaClient().subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          customer: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
          plan: { include: { service: { select: { name: true, description: true } } } }
        }
      });

      if (!subscription) throw new Error('Subscription not found');

      // IDEMPOTENCY: If an order already exists for this subscription with the same amount,
      // return it instead of creating a duplicate Razorpay order.
      const existingOrder = await getPrismaClient().payment.findFirst({
        where: { 
          subscriptionId, 
          status: { in: ['PENDING', 'PROCESSING'] }, 
          transactionId: { not: null },
          gatewayResponse: { not: null }
        },
        orderBy: { createdAt: 'desc' },
        select: { transactionId: true, gatewayResponse: true, amount: true }
      });

      if (existingOrder?.transactionId && existingOrder?.gatewayResponse && Math.round(existingOrder.amount * 100) === Math.round(amount * 100)) {
        console.warn(`[IDEMPOTENCY] Returning existing Razorpay order ${existingOrder.transactionId} for subscription ${subscriptionId}`);
        return { success: true, order: existingOrder.gatewayResponse, subscription };
      }

      // receipt must be unique per merchant; append short timestamp to avoid collision if amount changed or retried after failure
      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: currency || 'INR',
        receipt: `sub_${subscriptionId.replace(/-/g, '').substring(0, 20)}_${Date.now().toString().slice(-8)}`,
        notes: {
          subscriptionId: subscriptionId,
          paymentType: 'SUBSCRIPTION'
        }
      });

      console.log('✅ [PAYMENT] Razorpay order created:', order.id);

      // Use Prisma Client updateMany to avoid raw SQL database driver and enum/json casting issues
      await getPrismaClient().payment.updateMany({
        where: {
          subscriptionId: subscriptionId,
          status: 'PENDING'
        },
        data: {
          gateway: 'razorpay',
          transactionId: order.id,
          gatewayResponse: order,
          updatedAt: new Date()
        }
      });

      console.log('✅ [PAYMENT] Updated payments with order details');

      return { success: true, order, subscription };

    } catch (error) {
      console.error('❌ [PAYMENT] createSubscriptionOrder error:', error.message);
      
      // Mark payment as FAILED using Prisma Client updateMany
      try {
        await getPrismaClient().payment.updateMany({
          where: {
            subscriptionId: subscriptionId,
            status: 'PENDING'
          },
          data: {
            status: 'FAILED',
            gatewayResponse: { error: error.message },
            updatedAt: new Date()
          }
        });
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

      const existingPayment = await getPrismaClient().payment.findFirst({
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

      // ATOMIC IDEMPOTENCY GUARD: only update if status is still not COMPLETED.
      // If two concurrent verify calls race, only one will update count=1; the
      // other will get count=0 and safely return the already-completed record.
      const updateResult = await getPrismaClient().payment.updateMany({
        where: {
          id: existingPayment.id,
          status: { not: 'COMPLETED' }          // atomic guard
        },
        data: {
          status: 'COMPLETED',
          paymentMethod: this.mapRazorpayMethod(payment_method || paymentDetails.method),
          gatewayResponse: paymentDetails,
          updatedAt: new Date()
        }
      });

      // If nothing was updated, someone else just completed it — fetch & return
      if (updateResult.count === 0) {
        console.warn(`Payment ${razorpay_order_id} concurrently completed — returning existing`);
        const completedPayment = await getPrismaClient().payment.findUnique({
          where: { id: existingPayment.id },
          include: {
            booking: { include: { customer: { select: { id: true, name: true, email: true, phone: true } }, service: true } },
            subscription: { include: { customer: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } }, plan: { include: { service: true } } } }
          }
        });
        return { success: true, payment: completedPayment, razorpayPayment: paymentDetails, note: 'Payment was already processed' };
      }

      // Fetch the full updated record (updateMany doesn't return the record)
      const updatedPayment = await getPrismaClient().payment.findUnique({
        where: { id: existingPayment.id },
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
        await getPrismaClient().booking.update({
          where: { id: updatedPayment.bookingId },
          data: { status: 'CONFIRMED' }
        });
      }

      if (updatedPayment.subscriptionId) {
        const subscriptionToActivate = await getPrismaClient().subscription.findUnique({
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

        const updatedSubscription = await getPrismaClient().subscription.update({
          where: { id: updatedPayment.subscriptionId },
          data: {
            status: 'ACTIVE',
            nextBillDate: this.calculateNextBillDate(updatedPayment.subscription)
          },
          include: {
            plan: { include: { service: true } },
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    timeSlot: true  // EXPLICITLY select timeSlot
                  }
                }
              }
            }
          }
        });

        // Increment time slot count for the user's selected time slot (global count)
        try {
          const user = updatedSubscription.customer?.user;
          let timeSlotToIncrement = user?.timeSlot;

          // Debug logging
          console.log(`🔍 Time slot increment check - User: ${user?.id}, TimeSlot: ${timeSlotToIncrement}`);

          // If timeSlot is not on user, try to fetch it directly from the database
          if (!timeSlotToIncrement) {
            const freshUser = await getPrismaClient().user.findUnique({
              where: { id: user?.id },
              select: { id: true, timeSlot: true }
            });
            timeSlotToIncrement = freshUser?.timeSlot;
            console.log(`🔄 Fetched fresh user data - TimeSlot: ${timeSlotToIncrement}`);
          }

          if (timeSlotToIncrement) {
            await incrementTimeSlotCount(timeSlotToIncrement);
            console.log(`✅ Time slot count incremented for subscription ${updatedPayment.subscriptionId} - Slot: ${timeSlotToIncrement}`);
          } else {
            console.warn(`⚠️ No timeSlot found for user ${user?.id} in subscription ${updatedPayment.subscriptionId}. Time slot count not incremented.`);
          }
        } catch (slotError) {
          console.error('Failed to increment time slot count (non-fatal):', slotError);
          // Don't throw - this is a non-critical operation
        }

        const existingCycle = await getPrismaClient().subscriptionCycle.findFirst({
          where: { subscriptionId: updatedPayment.subscriptionId, cycleNumber: 1 }
        });

        if (!existingCycle) {
          await subscriptionBufferService.initializeSubscriptionCycle(updatedPayment.subscriptionId, 1);
        }

        await subscriptionBufferService.scheduleMonthlyServices(updatedPayment.subscriptionId);

        // Create initial booking for tomorrow immediately after subscription activation
        // This ensures the "Next Booking" shows up right away in the admin panel
        await this.createInitialBookingForSubscriber(updatedSubscription);
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

      const existingPayment = await getPrismaClient().payment.findFirst({
        where: { transactionId: razorpay_order_id },
        orderBy: { createdAt: 'desc' }
      });

      // Gracefully handle missing record — the Razorpay order may have been
      // created before a DB payment record existed (e.g. network failure).
      if (!existingPayment) {
        console.warn(`[FAILURE] No payment record for order ${razorpay_order_id} — ignoring`);
        return {
          success: false,
          payment: null,
          error: { code: error_code, description: error_description }
        };
      }

      // Idempotency: don't overwrite a COMPLETED payment with FAILED
      if (existingPayment.status === 'COMPLETED') {
        console.warn(`[FAILURE] Payment ${razorpay_order_id} already COMPLETED — ignoring failure`);
        return {
          success: false,
          payment: existingPayment,
          error: { code: error_code, description: error_description }
        };
      }

      const updatedPayment = await getPrismaClient().payment.update({
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
      const payment = await getPrismaClient().payment.findUnique({
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
      
      const updatedPayment = await getPrismaClient().payment.update({
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
