const { PrismaClient } = require('@prisma/client');
const razorpayService = require('../services/razorpayService');
const crypto = require('crypto');
const prisma = new PrismaClient();

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
      const booking = await prisma.booking.findUnique({
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
      const existingPayment = await prisma.payment.findFirst({
        where: { bookingId }
      });

      if (existingPayment) {
        return res.status(409).json({ error: 'Payment already exists for this booking' });
      }
      
      verificationData = { bookingId };
    }

    if (subscriptionId) {
      // Get customer profile first
      const customerProfile = await prisma.customerProfile.findUnique({
        where: { userId }
      });

      if (!customerProfile) {
        return res.status(404).json({ error: 'Customer profile not found' });
      }

      const subscription = await prisma.subscription.findUnique({
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

    const payment = await prisma.payment.create({
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
    const { page = 1, limit = 10, status, paymentMethod } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter object
    const where = {};
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    
    const payments = await prisma.payment.findMany({
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
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    const totalPayments = await prisma.payment.count({ where });
    
    res.json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalPayments,
        totalPages: Math.ceil(totalPayments / parseInt(limit))
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
    const payment = await prisma.payment.findUnique({
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

    const payment = await prisma.payment.update({
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
    const payments = await prisma.payment.findMany({
      where: {
        customerId: userId
      },
      include: {
        booking: {
          include: {
            service: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching user payments:', error);
    res.status(500).json({ error: 'Failed to fetch user payments' });
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
    const payment = await prisma.payment.findUnique({
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
    const updatedPayment = await prisma.payment.update({
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
    const { bookingId, amount, currency } = req.body;
    const userId = req.user.id;

    if (!bookingId || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: bookingId, amount' 
      });
    }

    // Verify booking belongs to user
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        customerId: userId
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or unauthorized' });
    }

    // Check if payment already exists
    const existingPayment = await prisma.payment.findFirst({
      where: { 
        bookingId,
        status: { in: ['PENDING', 'COMPLETED'] }
      }
    });

    if (existingPayment) {
      return res.status(409).json({ error: 'Payment already exists for this booking' });
    }

    // Create Razorpay order
    const result = await razorpayService.createBookingOrder(bookingId, amount, currency);

    res.status(201).json({
      success: true,
      order: result.order,
      booking: result.booking,
      key: process.env.RAZORPAY_TEST_KEY_ID
    });

  } catch (error) {
    console.error('Error creating Razorpay booking order:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
};

// Create Razorpay order for subscription payment
const createRazorpaySubscriptionOrder = async (req, res) => {
  try {
    const { subscriptionId, amount, currency } = req.body;
    const userId = req.user.id;

    if (!subscriptionId || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: subscriptionId, amount' 
      });
    }

    // Get customer profile
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    // Verify subscription belongs to user
    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        customerId: customerProfile.id
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found or unauthorized' });
    }

    // Create Razorpay order
    const result = await razorpayService.createSubscriptionOrder(subscriptionId, amount, currency);

    res.status(201).json({
      success: true,
      order: result.order,
      subscription: result.subscription,
      key: process.env.RAZORPAY_TEST_KEY_ID
    });

  } catch (error) {
    console.error('Error creating Razorpay subscription order:', error);
    res.status(500).json({ error: 'Failed to create subscription payment order' });
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

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: result.payment
    });

  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// Handle Razorpay payment failure
const handleRazorpayPaymentFailure = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      error_code,
      error_description
    } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({ 
        error: 'Missing required field: razorpay_order_id' 
      });
    }

    // Process failed payment
    const result = await razorpayService.processFailedPayment({
      razorpay_order_id,
      error_code,
      error_description
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
const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('Razorpay webhook secret not configured');
      return res.status(400).json({ error: 'Webhook secret not configured' });
    }

    // Verify webhook signature
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== webhookSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body;
    
    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload.payment.entity);
        break;
      case 'refund.created':
        await handleRefundCreated(payload.refund.entity);
        break;
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Error handling Razorpay webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};

// Webhook event handlers
const handlePaymentCaptured = async (paymentEntity) => {
  try {
    // Update payment status in database
    await prisma.payment.updateMany({
      where: { transactionId: paymentEntity.order_id },
      data: {
        status: 'COMPLETED',
        gatewayResponse: paymentEntity,
        updatedAt: new Date()
      }
    });

    console.log(`Payment captured: ${paymentEntity.id}`);
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
};

const handlePaymentFailed = async (paymentEntity) => {
  try {
    // Update payment status in database
    await prisma.payment.updateMany({
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
    const payment = await prisma.payment.findFirst({
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
      
      await prisma.payment.update({
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
  handleRazorpayWebhook
};
