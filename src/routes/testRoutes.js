const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getPrismaClient } = require('../utils/database');

// SECURITY: Only enable test routes in non-production environments
// Explicitly check that NODE_ENV is NOT production (handles undefined case)
const isTestEnvironment = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== undefined;

if (isTestEnvironment) {
  const prisma = getPrismaClient();

  /**
   * Generate test user data for registration testing
   */
  router.get('/generate-test-users', (req, res) => {
    try {
      const testUsers = {
        customers: [
          {
            name: 'John Smith',
            email: 'john.customer@test.com',
            phone: '9876543210',
            role: 'CUSTOMER',
            password: 'TestPass123!',
            confirmPassword: 'TestPass123!',
            address: '123 Test Street, Test City, Test State - 123456'
          },
          {
            name: 'Sarah Johnson',
            email: 'sarah.customer@test.com',
            phone: '9876543211',
            role: 'CUSTOMER',
            password: 'TestPass123!',
            confirmPassword: 'TestPass123!',
            address: '456 Demo Avenue, Demo Town, Demo State - 654321'
          },
          {
            name: 'Mike Wilson',
            email: 'mike.customer@test.com',
            phone: '9876543212',
            role: 'CUSTOMER',
            password: 'TestPass123!',
            confirmPassword: 'TestPass123!',
            address: '789 Sample Road, Sample City, Sample State - 789012'
          }
        ],
        maids: [
          {
            name: 'Mary Rodriguez',
            email: 'mary.maid@test.com',
            phone: '8765432109',
            role: 'MAID',
            password: 'TestPass123!',
            confirmPassword: 'TestPass123!',
            address: '321 Worker Lane, Service City, Service State - 321654'
          },
          {
            name: 'Lisa Anderson',
            email: 'lisa.maid@test.com',
            phone: '8765432108',
            role: 'MAID',
            password: 'TestPass123!',
            confirmPassword: 'TestPass123!',
            address: '654 Helper Street, Helper Town, Helper State - 987654'
          },
          {
            name: 'Anna Garcia',
            email: 'anna.maid@test.com',
            phone: '8765432107',
            role: 'MAID',
            password: 'TestPass123!',
            confirmPassword: 'TestPass123!',
            address: '987 Cleaner Boulevard, Cleaner City, Cleaner State - 135792'
          }
        ]
      };

      res.json({
        success: true,
        data: testUsers,
        message: 'Test user data generated successfully',
        usage: {
          endpoint: '/api/auth/register',
          method: 'POST',
          note: 'Use any of the above user objects to test registration'
        }
      });

    } catch (error) {
      console.error('Error generating test users:', error);
      res.status(500).json({ error: 'Failed to generate test users' });
    }
  });

  /**
   * Cleanup test users (for testing purposes)
   */
  router.delete('/cleanup-test-users', async (req, res) => {
    try {
      // Delete test users with specific email pattern
      const testEmails = [
        'john.customer@test.com',
        'sarah.customer@test.com',
        'mike.customer@test.com',
        'mary.maid@test.com',
        'lisa.maid@test.com',
        'anna.maid@test.com'
      ];

      // First delete related profiles (due to foreign key constraints)
      await prisma.customerProfile.deleteMany({
        where: {
          user: {
            email: { in: testEmails }
          }
        }
      });

      await prisma.maidProfile.deleteMany({
        where: {
          user: {
            email: { in: testEmails }
          }
        }
      });

      // Then delete users
      const deletedUsers = await prisma.user.deleteMany({
        where: {
          email: { in: testEmails }
        }
      });

      res.json({
        success: true,
        message: `Cleaned up ${deletedUsers.count} test users`,
        deletedCount: deletedUsers.count
      });

    } catch (error) {
      console.error('Error cleaning up test users:', error);
      res.status(500).json({ error: 'Failed to cleanup test users' });
    }
  });

  /**
   * Validate registration data
   */
  router.post('/validate-registration-data', (req, res) => {
    try {
      const { name, email, phone, role, password, confirmPassword, address } = req.body;
      
      const validationResults = {
        valid: true,
        errors: [],
        warnings: [],
        suggestions: []
      };

      // Validate name
      if (!name || name.trim().length < 2) {
        validationResults.valid = false;
        validationResults.errors.push('Name must be at least 2 characters long');
      } else if (!/^[a-zA-Z\s]+$/.test(name)) {
        validationResults.valid = false;
        validationResults.errors.push('Name can only contain letters and spaces');
      }

      // Validate email
      if (!email || /[^\x20-\x7E]/.test(email) || /[`\s]/.test(email) || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        validationResults.valid = false;
        validationResults.errors.push('Please provide a valid email address');
      }

      // Validate phone
      if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
        validationResults.valid = false;
        validationResults.errors.push('Please provide a valid 10-digit Indian phone number starting with 6-9');
      }

      // Validate role
      if (!role || !['CUSTOMER', 'MAID'].includes(role)) {
        validationResults.valid = false;
        validationResults.errors.push('Role must be either CUSTOMER or MAID');
      }

      // Validate password
      if (!password || Array.from(password).length < 8 || /[^\x20-\x7E]/.test(password)) {
        validationResults.valid = false;
        validationResults.errors.push('Password must be at least 8 characters long and cannot contain emojis or non-standard characters');
      } else {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{}|;:'",.<>\/~\`])[A-Za-z\d@$!%*?&#^()_+\-=\[\]{}|;:'",.<>\/~\`]{8,128}$/;
        if (!passwordRegex.test(password)) {
          validationResults.valid = false;
          validationResults.errors.push('Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character');
        }
      }

      // Validate password confirmation
      if (password !== confirmPassword) {
        validationResults.valid = false;
        validationResults.errors.push('Password confirmation does not match password');
      }

      // Validate address
      if (!address || address.trim().length < 10) {
        validationResults.valid = false;
        validationResults.errors.push('Address must be at least 10 characters long');
      } else if (!/^[a-zA-Z0-9\s,.-]+$/.test(address)) {
        validationResults.valid = false;
        validationResults.errors.push('Address contains invalid characters');
      }

      // Add suggestions for improvement
      if (validationResults.valid) {
        validationResults.suggestions.push('All validation checks passed!');
        validationResults.suggestions.push('You can now proceed with registration');
      }

      res.json({
        success: true,
        validation: validationResults,
        nextStep: validationResults.valid ? 'POST /api/auth/register' : 'Fix validation errors first'
      });

    } catch (error) {
      console.error('Error validating registration data:', error);
      res.status(500).json({ error: 'Failed to validate registration data' });
    }
  });

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
