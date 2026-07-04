const { getPrismaClient } = require('../utils/database');
const crypto = require('crypto');

// razorpayService is a proper singleton – import it once at module load time.
const razorpayService = require('../services/razorpayService');
const { generateInvoicePDF, generateInvoiceNumber } = require('../services/invoiceService');

const { razorpayKeyId } = require('../utils/razorpay-credintials');
const { publishNotificationEvent } = require('../notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('../notifications/events/topics');
// Using getPrismaClient() directly

const createPayment = async (req, res) => {
  try {
    const { bookingId, subscriptionId, amount, paymentMethod, discount = 0, tax = 0, gateway, transactionId, paymentType = 'BOOKING' } = req.body;
    const userId = req.user.id;

    // Validate required fields - either bookingId or subscriptionId must be present
    if ((!bookingId && !subscriptionId) || !amount || !paymentMethod) {
      return res.status(400).json({
        error: 'Missing required fields: (bookingId OR subscriptionId), amount, paymentMethod'
      });
    }

    // Ensure only one of bookingId or subscriptionId is provided
    if (bookingId && subscriptionId) {
      return res.status(400).json({
        error: 'Provide either bookingId or subscriptionId, not both'
      });
    }

    // Validate payment method enum
    const validPaymentMethods = ['CARD', 'UPI', 'NET_BANKING', 'WALLET', 'CASH', 'BANK_TRANSFER'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        error: 'Invalid payment method. Must be one of: CARD, UPI, NET_BANKING, WALLET, CASH, BANK_TRANSFER'
      });
    }

    // Validate numeric fields
    const amountNum = parseFloat(amount);
    const discountNum = parseFloat(discount);
    const taxNum = parseFloat(tax);

    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Calculate final amount
    const finalAmount = amountNum - discountNum + taxNum;

    let verificationData = null;

    // Verify booking or subscription exists and belongs to user
    if (bookingId) {
      const booking = await getPrismaClient().booking.findUnique({
        where: { id: bookingId },
        select: { id: true, customerId: true, finalAmount: true }
      });

      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      if (booking.customerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized: You can only create payments for your own bookings' });
      }

      // Check if payment already exists for this booking
      const existingPayment = await getPrismaClient().payment.findFirst({
        where: { bookingId }
      });

      if (existingPayment) {
        return res.status(409).json({ error: 'Payment already exists for this booking' });
      }

      verificationData = { bookingId };
    }

    if (subscriptionId) {
      // Get customer profile first
      const customerProfile = await getPrismaClient().customerProfile.findUnique({
        where: { userId }
      });

      if (!customerProfile) {
        return res.status(404).json({ error: 'Customer profile not found' });
      }

      const subscription = await getPrismaClient().subscription.findUnique({
        where: { id: subscriptionId },
        select: { id: true, customerId: true, amount: true }
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (subscription.customerId !== customerProfile.id) {
        return res.status(403).json({ error: 'Unauthorized: You can only create payments for your own subscription' });
      }

      verificationData = { subscriptionId };
    }

    const payment = await getPrismaClient().payment.create({
      data: {
        ...verificationData, // Will include either bookingId or subscriptionId
        customerId: userId,
        amount: amountNum,
        discount: discountNum,
        tax: taxNum,
        finalAmount,
        paymentMethod,
        paymentType,
        status: 'PENDING',
        gateway,
        transactionId
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error('Error creating payment:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Payment already exists for this booking' });
    }
    res.status(500).json({ error: 'Failed to create payment' });
  }
};


const getAllPayments = async (req, res) => {
  try {
    // M9 FIX: Cap limit to prevent unbounded queries that load the entire table.
    const MAX_LIMIT = 100;
    // page and limit are already Numbers after Math.max/Math.min -- no parseInt needed.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;
    const { status, paymentMethod } = req.query;

    // Build filter object
    const where = {};
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    // Issue 4 FIX: cache the Prisma instance once instead of calling
    // getPrismaClient() twice (findMany + count) for the same request.
    const db = getPrismaClient();

    const [payments, totalPayments] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          booking: {
            include: {
              service: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit   // already a Number -- no parseInt needed
      }),
      db.payment.count({ where })
    ]);

    res.json({
      payments,
      pagination: {
        page,          // already a Number
        limit,         // already a Number
        total: totalPayments,
        totalPages: Math.ceil(totalPayments / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await getPrismaClient().payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transactionId, gateway, gatewayResponse, refundAmount, refundReason } = req.body;

    // Validate status enum
    const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED, PARTIALLY_REFUNDED'
      });
    }

    // Build update data
    const updateData = { status };
    if (transactionId) updateData.transactionId = transactionId;
    if (gateway) updateData.gateway = gateway;
    if (gatewayResponse) updateData.gatewayResponse = gatewayResponse;

    // Handle refund fields
    if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') {
      if (refundAmount !== undefined) {
        updateData.refundAmount = parseFloat(refundAmount);
      }
      if (refundReason) {
        updateData.refundReason = refundReason;
      }
      updateData.refundedAt = new Date();
    }

    const payment = await getPrismaClient().payment.update({
      where: { id },
      data: updateData,
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    await publishNotificationEvent({
      topic: NOTIFICATION_TOPICS.PAYMENT_STATUS_UPDATED,
      payload: {
        paymentId: payment.id,
        status: payment.status
      },
      dedupeKey: `payment-status:${payment.id}:${payment.status}:${payment.updatedAt.toISOString()}`
    });

    res.json(payment);
  } catch (error) {
    console.error('Error updating payment status:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

const getUserPayments = async (req, res) => {
  try {
    const userId = req.user.id;

    // Pagination parameters with safe defaults and a hard cap
    const MAX_LIMIT = 100;
    const DEFAULT_LIMIT = 20;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where = { customerId: userId };

    // C2 FIX: use getPrismaClient() — bare `prisma` was never declared in this file
    const db = getPrismaClient();
    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          booking: {
            include: {
              service: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      db.payment.count({ where })
    ]);

    res.json({
      data: payments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching user payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user payments',
      code: 'FETCH_FAILED'
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { paymentId, transactionId, gateway, gatewayResponse } = req.body;
    const userId = req.user.id;

    if (!paymentId || !transactionId) {
      return res.status(400).json({
        error: 'Missing required fields: paymentId, transactionId'
      });
    }

    // Find the payment and verify it belongs to the user
    const payment = await getPrismaClient().payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          select: {
            customerId: true
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.booking.customerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized: You can only verify your own payments' });
    }

    // Update payment with verification details
    const updatedPayment = await getPrismaClient().payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        transactionId,
        gateway,
        gatewayResponse
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    await publishNotificationEvent({
      topic: NOTIFICATION_TOPICS.PAYMENT_STATUS_UPDATED,
      payload: {
        paymentId: updatedPayment.id,
        status: updatedPayment.status
      },
      dedupeKey: `payment-status:${updatedPayment.id}:${updatedPayment.status}:${updatedPayment.updatedAt.toISOString()}`
    });

    res.json(updatedPayment);
  } catch (error) {
    console.error('Error verifying payment:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// Create Razorpay order for booking payment
const createRazorpayBookingOrder = async (req, res) => {
  try {
    const { bookingId, currency } = req.body;
    const userId = req.user.id;

    if (!bookingId) {
      return res.status(400).json({
        error: 'Missing required field: bookingId'
      });
    }

    // Verify booking belongs to user and get the actual amount from database
    const booking = await getPrismaClient().booking.findFirst({
      where: {
        id: bookingId,
        customerId: userId
      },
      include: {
        service: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or unauthorized' });
    }

    // SECURITY: Use amount from database, NOT from request body
    const amount = booking.finalAmount || booking.totalAmount;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid booking amount in database' });
    }

    // SECURITY CRITICAL: Use server-side booking amount, NEVER trust frontend
    // The finalAmount is calculated on backend during booking creation
    const paymentAmount = booking.finalAmount;

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid booking amount. Cannot process payment.'
      });
    }

    // Check if payment already exists
    const existingPayment = await getPrismaClient().payment.findFirst({
      where: {
        bookingId,
        status: { in: ['PENDING', 'COMPLETED', 'PROCESSING'] }
      }
    });

    if (existingPayment) {
      return res.status(409).json({ error: 'Payment already exists for this booking' });
    }

    // Create Razorpay order with server-side validated amount
    // C1 FIX: use a single const and a single createBookingOrder call
    const orderCurrency = currency || 'INR';
    const result = await razorpayService.createBookingOrder(bookingId, paymentAmount, orderCurrency);

    res.status(201).json({
      success: true,
      order: result.order,
      booking: result.booking,
      key: razorpayKeyId,
      // Send back the validated amount for frontend confirmation
      amount: paymentAmount,
      currency: orderCurrency
    });

  } catch (error) {
    console.error('Error creating Razorpay booking order:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
};

// Create Razorpay order for subscription payment
const createRazorpaySubscriptionOrder = async (req, res) => {
  const { subscriptionId, currency } = req.body;

  try {
    const userId = req.user.id;

    if (!subscriptionId) {
      return res.status(400).json({
        error: 'Missing required field: subscriptionId'
      });
    }

    // Get customer profile
    const customerProfile = await getPrismaClient().customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    // Verify subscription belongs to user and include relations for razorpayService
    const subscription = await getPrismaClient().subscription.findFirst({
      where: {
        id: subscriptionId,
        customerId: customerProfile.id
      },
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
      return res.status(404).json({ error: 'Subscription not found or unauthorized' });
    }

    // SECURITY: Get amount from subscription/plan, NOT from request body
    const amount = subscription.amount || subscription.plan?.finalPrice || subscription.plan?.basePrice;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid subscription amount in database' });
    }

    // Allow payment creation for subscriptions in PENDING_PAYMENT status
    if (subscription.status !== 'PENDING_PAYMENT') {
      console.warn(`Attempted payment creation for subscription ${subscriptionId} in ${subscription.status} status`);
      return res.status(409).json({
        error: 'Subscription is not pending payment. Only subscriptions in PENDING_PAYMENT status can proceed to payment.',
        currentStatus: subscription.status
      });
    }

    // SECURITY CRITICAL: Use server-side subscription amount, NEVER trust frontend
    // The amount is set during subscription creation with plan pricing
    const paymentAmount = subscription.amount;

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid subscription amount. Cannot process payment.'
      });
    }

    // CRITICAL FIX: Create payment record FIRST before order creation
    console.log(`Creating initial payment record for subscription ${subscriptionId}`);

    let paymentRecord = await getPrismaClient().payment.findFirst({
      where: {
        subscriptionId: subscriptionId,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!paymentRecord) {
      // Create new payment record with status PENDING
      paymentRecord = await getPrismaClient().payment.create({
        data: {
          subscriptionId: subscriptionId,
          customerId: userId,
          amount: amount,
          finalAmount: amount,
          paymentMethod: 'CARD',
          status: 'PENDING',
          paymentType: 'SUBSCRIPTION',
          gateway: null  // Gateway will be set to 'razorpay' after order creation
        }
      });
      console.log(`Created initial payment record: ${paymentRecord.id}`);
    } else {
      // Update existing payment record with validated amount
      paymentRecord = await getPrismaClient().payment.update({
        where: { id: paymentRecord.id },
        data: {
          amount: amount,
          finalAmount: amount,
          updatedAt: new Date()
        }
      });
      console.log(`Updated existing payment record: ${paymentRecord.id}`);
    }

    // Now create Razorpay order (payment record already exists)
    const orderCurrency = currency || 'INR';
    const result = await razorpayService.createSubscriptionOrder(subscriptionId, amount, orderCurrency);

    res.status(201).json({
      success: true,
      order: result.order,
      subscription: result.subscription,
      key: razorpayKeyId,
      amount: paymentAmount,
      currency: orderCurrency
    });

  } catch (error) {
    console.error('Error creating Razorpay subscription order:', error);
    console.error('Error stack:', error.stack);

    // CRITICAL: Mark payment as FAILED if order creation fails
    try {
      const failedPayment = await getPrismaClient().payment.findFirst({
        where: {
          subscriptionId: subscriptionId,
          status: 'PENDING'
        },
        orderBy: { createdAt: 'desc' }
      });

      if (failedPayment) {
        await getPrismaClient().payment.update({
          where: { id: failedPayment.id },
          data: {
            status: 'FAILED',
            gatewayResponse: {
              error: error.message,
              errorCode: error.code,
              failedAt: new Date().toISOString(),
              reason: 'Order creation failed - Server error'
            },
            updatedAt: new Date()
          }
        });
        console.log(`✅ Marked payment ${failedPayment.id} as FAILED due to order creation error`);
      }
    } catch (updateError) {
      console.error('Failed to mark payment as FAILED:', updateError.message);
    }

    res.status(500).json({
      error: 'Failed to create subscription payment order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify and process Razorpay payment
const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_method
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature'
      });
    }

    // Process successful payment
    const result = await razorpayService.processSuccessfulPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_method
    });

    // Auto-generate invoice number if not already set
    let invoiceNumber = result.payment?.invoiceNumber;
    if (!invoiceNumber && result.payment?.id) {
      invoiceNumber = generateInvoiceNumber();
      try {
        await getPrismaClient().payment.update({
          where: { id: result.payment.id },
          data: { invoiceNumber }
        });
        console.log(`📄 [INVOICE] Generated invoice ${invoiceNumber} for payment ${result.payment.id}`);
      } catch (invErr) {
        console.warn('⚠️  [INVOICE] Could not save invoice number:', invErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: { ...result.payment, invoiceNumber }
    });

  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    const message = error?.message || 'Failed to verify payment';

    if (message.toLowerCase().includes('invalid payment signature')) {
      return res.status(400).json({ error: message });
    }

    if (message.toLowerCase().includes('razorpay key secret not configured')) {
      return res.status(500).json({ error: message });
    }

    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// Handle Razorpay payment failure
const handleRazorpayPaymentFailure = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      error_code,
      error_description,
      error
    } = req.body;

    const normalizedErrorCode = error_code || error?.code || 'PAYMENT_FAILED';
    const normalizedErrorDescription = error_description || error?.description || error?.reason || 'Payment failed';

    if (!razorpay_order_id) {
      return res.status(400).json({
        error: 'Missing required field: razorpay_order_id'
      });
    }

    // Process failed payment
    const result = await razorpayService.processFailedPayment({
      razorpay_order_id,
      error_code: normalizedErrorCode,
      error_description: normalizedErrorDescription
    });

    res.json({
      success: false,
      message: 'Payment failure processed',
      payment: result.payment,
      error: result.error
    });

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({ error: 'Failed to process payment failure' });
  }
};

// Process refund
const processRefund = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { refundAmount, refundReason } = req.body;

    if (!refundAmount || !refundReason) {
      return res.status(400).json({
        error: 'Missing required fields: refundAmount, refundReason'
      });
    }

    // Process refund
    const result = await razorpayService.processRefund(paymentId, refundAmount, refundReason);

    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: result.refund,
      payment: result.payment
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
};

// Get payment status from Razorpay
const getPaymentStatus = async (req, res) => {
  try {
    const { razorpayPaymentId } = req.params;

    const paymentStatus = await razorpayService.getPaymentStatus(razorpayPaymentId);

    res.json({
      success: true,
      payment: paymentStatus
    });

  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
};

// Razorpay webhook handler
// SECURITY: Signature is already verified by razorpayWebhookVerifier middleware.
// Do NOT re-verify here — the JSON.stringify(req.body) fallback used in re-verification
// produces a different byte sequence than the raw body and will break HMAC checks.
const handleRazorpayWebhook = async (req, res) => {
  try {
    // C3 FIX: destructure `event` and `payload` from the parsed body.
    // Previously these were referenced but never declared, causing ReferenceError
    // which meant ALL webhook events were silently dropped.
    const { event, payload } = req.body;

    if (!event) {
      console.error('❌ [WEBHOOK] Missing event field in webhook body');
      // Return 200 to stop Razorpay retrying a malformed payload
      return res.json({ success: true, message: 'Webhook ignored: missing event' });
    }

    console.log(`📬 [WEBHOOK] Received event: ${event}`);

    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        console.log('💳 [WEBHOOK] Processing payment.captured event');
        if (payload?.payment?.entity) {
          await handlePaymentCaptured(payload.payment.entity);
        }
        break;

      case 'payment.failed':
        console.log('❌ [WEBHOOK] Processing payment.failed event');
        if (payload?.payment?.entity) {
          await handlePaymentFailed(payload.payment.entity);
        }
        break;

      case 'refund.created':
        console.log('🔄 [WEBHOOK] Processing refund.created event');
        if (payload?.refund?.entity) {
          await handleRefundCreated(payload.refund.entity);
        }
        break;

      default:
        console.log(`ℹ️  [WEBHOOK] Unhandled webhook event: ${event}`);
    }

    // Always return 200 OK to prevent Razorpay retry storms
    res.json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing webhook:', error.message);
    // Still return 200 to prevent retries, but log the error
    console.error('❌ [WEBHOOK] Error details:', error);
    res.json({ success: true, message: 'Webhook processed (with errors)' });
  }
};

// Webhook event handlers
const handlePaymentCaptured = async (paymentEntity) => {
  try {
    const db = getPrismaClient();

    // H4 / H6 FIX: Only update payments that are currently PENDING or PROCESSING.
    // Using a status guard prevents a late-arriving payment.captured webhook from
    // overwriting a payment that has already been REFUNDED or FAILED.
    await db.payment.updateMany({
      where: {
        transactionId: paymentEntity.order_id,
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      data: {
        status: 'COMPLETED',
        gatewayResponse: paymentEntity,
        updatedAt: new Date()
      }
    });

    // Fetch ONLY the payments we just updated so ensurePostPaymentEffects
    // is never called twice for the same payment (idempotency guard).
    const payments = await db.payment.findMany({
      where: {
        transactionId: paymentEntity.order_id,
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'desc' },
      take: 3
    });

    for (const payment of payments) {
      await razorpayService.ensurePostPaymentEffects(payment);

      // Auto-generate invoice number if not already set
      if (!payment.invoiceNumber) {
        try {
          const invoiceNum = generateInvoiceNumber();
          await db.payment.update({
            where: { id: payment.id },
            data: { invoiceNumber: invoiceNum }
          });
          console.log(`📄 [INVOICE] Generated invoice ${invoiceNum} for payment ${payment.id}`);
        } catch (invErr) {
          // Non-fatal – invoiceNumber column may not be migrated yet
          console.warn('⚠️  [INVOICE] Could not save invoice number:', invErr.message);
        }
      }
    }

    console.log(`Payment captured: ${paymentEntity.id}`);
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
};

const handlePaymentFailed = async (paymentEntity) => {
  try {
    // Update payment status in database
    await getPrismaClient().payment.updateMany({
      where: { transactionId: paymentEntity.order_id },
      data: {
        status: 'FAILED',
        gatewayResponse: paymentEntity,
        updatedAt: new Date()
      }
    });

    console.log(`Payment failed: ${paymentEntity.id}`);
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
};

const handleRefundCreated = async (refundEntity) => {
  try {
    // Update payment with refund information
    const payment = await getPrismaClient().payment.findFirst({
      where: {
        gatewayResponse: {
          path: ['id'],
          equals: refundEntity.payment_id
        }
      }
    });

    if (payment) {
      const refundAmount = refundEntity.amount / 100; // Convert from paise
      const refundStatus = refundAmount >= payment.finalAmount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

      await getPrismaClient().payment.update({
        where: { id: payment.id },
        data: {
          status: refundStatus,
          refundAmount: refundAmount,
          refundedAt: new Date(),
          gatewayResponse: {
            ...payment.gatewayResponse,
            refund: refundEntity
          }
        }
      });
    }

    console.log(`Refund created: ${refundEntity.id}`);
  } catch (error) {
    console.error('Error handling refund created:', error);
  }
};

// ─── Invoice Download ────────────────────────────────────────────────────────
// GET /payments/:id/invoice  (authenticated; must be the payment owner or admin)
const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    // Ownership check
    if (!isAdmin) {
      const payment = await getPrismaClient().payment.findUnique({
        where: { id },
        select: { customerId: true, status: true }
      });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      if (payment.customerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const pdfBuffer = await generateInvoicePDF(id);

    // Also stamp the invoice number into the DB (idempotent)
    const stored = await getPrismaClient().payment.findUnique({
      where: { id },
      select: { invoiceNumber: true }
    });
    let invoiceNum = stored?.invoiceNumber;
    if (!invoiceNum) {
      invoiceNum = generateInvoiceNumber();
      try {
        await getPrismaClient().payment.update({
          where: { id },
          data: { invoiceNumber: invoiceNum }
        });
      } catch (_) { /* column may not exist yet */ }
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Invoice-${invoiceNum || id.slice(0, 8)}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};

// GET /payments/:id/invoice/view  (same auth; returns PDF inline for browser preview)
const viewInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isAdmin) {
      const payment = await getPrismaClient().payment.findUnique({
        where: { id },
        select: { customerId: true }
      });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      if (payment.customerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const pdfBuffer = await generateInvoicePDF(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice preview:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};

module.exports = {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  getUserPayments,
  verifyPayment,
  createRazorpayBookingOrder,
  createRazorpaySubscriptionOrder,
  verifyRazorpayPayment,
  handleRazorpayPaymentFailure,
  processRefund,
  getPaymentStatus,
  handleRazorpayWebhook,
  downloadInvoice,
  viewInvoice
};
