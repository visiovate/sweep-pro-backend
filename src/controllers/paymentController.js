const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createPayment = async (req, res) => {
  try {
    const { bookingId, amount, paymentMethod, discount = 0, tax = 0, gateway, transactionId } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!bookingId || !amount || !paymentMethod) {
      return res.status(400).json({ 
        error: 'Missing required fields: bookingId, amount, paymentMethod' 
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

    // Verify booking exists and belongs to user
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
    const existingPayment = await prisma.payment.findUnique({
      where: { bookingId }
    });

    if (existingPayment) {
      return res.status(409).json({ error: 'Payment already exists for this booking' });
    }

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        customerId: userId,
        amount: amountNum,
        discount: discountNum,
        tax: taxNum,
        finalAmount,
        paymentMethod,
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

module.exports = {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  getUserPayments,
  verifyPayment
};
