const express = require('express');
const router = express.Router();
const TestUtils = require('../utils/testUtils');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Only enable in development/test environments
if (process.env.NODE_ENV !== 'production') {

  /**
   * Create test data for Razorpay testing
   */
  router.post('/setup-test-data', async (req, res) => {
    try {
      // Create test service if it doesn't exist
      let testService = await prisma.service.findFirst({
        where: { name: 'Test Cleaning Service' }
      });

      if (!testService) {
        testService = await prisma.service.create({
          data: TestUtils.createTestServiceData()
        });
      }

      // Get test customer
      const testCustomer = await prisma.user.findUnique({
        where: { email: 'customer@sweepro.com' }
      });

      if (!testCustomer) {
        return res.status(404).json({ 
          error: 'Test customer not found. Please run database seed first.' 
        });
      }

      res.json({
        success: true,
        testService: {
          id: testService.id,
          name: testService.name,
          basePrice: testService.basePrice
        },
        testCustomer: {
          id: testCustomer.id,
          email: testCustomer.email
        },
        message: 'Test data ready for Razorpay integration testing'
      });

    } catch (error) {
      console.error('Error setting up test data:', error);
      res.status(500).json({ error: 'Failed to setup test data' });
    }
  });

  /**
   * Generate test signature for payment verification
   */
  router.post('/generate-signature', (req, res) => {
    try {
      const { orderId, paymentId } = req.body;
      
      if (!orderId || !paymentId) {
        return res.status(400).json({ 
          error: 'Missing orderId or paymentId' 
        });
      }

      const secret = process.env.RAZORPAY_TEST_KEY_SECRET;
      if (!secret) {
        return res.status(500).json({ 
          error: 'Razorpay secret not configured' 
        });
      }

      const signature = TestUtils.generateTestSignature(orderId, paymentId, secret);

      res.json({
        success: true,
        signature: signature,
        orderId: orderId,
        paymentId: paymentId
      });

    } catch (error) {
      console.error('Error generating signature:', error);
      res.status(500).json({ error: 'Failed to generate signature' });
    }
  });

  /**
   * Create test booking for payment testing
   */
  router.post('/create-test-booking', async (req, res) => {
    try {
      const { customerId, serviceId } = req.body;

      if (!customerId || !serviceId) {
        return res.status(400).json({ 
          error: 'Missing customerId or serviceId' 
        });
      }

      // Verify service exists
      const service = await prisma.service.findUnique({
        where: { id: serviceId }
      });

      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      // Create customer profile if it doesn't exist
      let customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: customerId }
      });

      if (!customerProfile) {
        customerProfile = await prisma.customerProfile.create({
          data: {
            userId: customerId,
            preferences: {},
            emergencyContact: null
          }
        });
      }

      // Create test booking
      const bookingData = TestUtils.createTestBookingData(serviceId);
      const booking = await prisma.booking.create({
        data: {
          customerId: customerId,
          serviceId: serviceId,
          scheduledAt: new Date(`${bookingData.scheduledDate}T${bookingData.scheduledTime}:00`),
          estimatedDuration: service.baseDuration,
          serviceAddress: bookingData.address,
          specialInstructions: bookingData.notes,
          totalAmount: service.basePrice,
          finalAmount: service.basePrice,
          status: 'PENDING' // Will be confirmed after payment
        },
        include: {
          service: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          }
        }
      });

      res.json({
        success: true,
        booking: booking,
        message: 'Test booking created successfully'
      });

    } catch (error) {
      console.error('Error creating test booking:', error);
      res.status(500).json({ error: 'Failed to create test booking' });
    }
  });

  /**
   * Get Razorpay configuration for frontend testing
   */
  router.get('/razorpay-config', (req, res) => {
    try {
      TestUtils.validateTestEnvironment();

      res.json({
        success: true,
        config: {
          key: process.env.RAZORPAY_TEST_KEY_ID,
          currency: 'INR',
          name: 'Sweep Pro',
          description: 'Professional Cleaning Services',
          theme: {
            color: '#3399cc'
          }
        },
        message: 'Razorpay configuration ready'
      });

    } catch (error) {
      console.error('Error getting Razorpay config:', error);
      res.status(500).json({ error: 'Failed to get Razorpay configuration' });
    }
  });

  /**
   * Test webhook endpoint
   */
  router.post('/test-webhook', (req, res) => {
    try {
      const body = JSON.stringify(req.body);
      const signature = TestUtils.generateWebhookSignature(body, process.env.RAZORPAY_WEBHOOK_SECRET || 'test_secret');

      res.json({
        success: true,
        webhook: {
          body: req.body,
          signature: signature,
          headers: {
            'x-razorpay-signature': signature
          }
        },
        message: 'Test webhook data generated'
      });

    } catch (error) {
      console.error('Error generating test webhook:', error);
      res.status(500).json({ error: 'Failed to generate test webhook' });
    }
  });

} else {
  // In production, return 404 for all test routes
  router.use('*', (req, res) => {
    res.status(404).json({ error: 'Test endpoints not available in production' });
  });
}

module.exports = router;
