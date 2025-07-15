const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const app = require('../index');

const prisma = new PrismaClient();

// Store test data for cleanup
let testData = {
  customerWithSubscription: null,
  customerWithoutSubscription: null,
  service: null,
  subscription: null,
  plan: null,
  tokenWithSubscription: null,
  tokenWithoutSubscription: null
};

// Increase timeout for all tests
jest.setTimeout(30000);

describe('Booking Routes - Subscription Only', () => {
  beforeAll(async () => {
    try {
      // Clean up any existing test data
      await prisma.booking.deleteMany({
        where: {
          customer: {
            email: {
              in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
            }
          }
        }
      });
      await prisma.subscription.deleteMany({
        where: {
          customer: {
            user: {
              email: {
                in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
              }
            }
          }
        }
      });
      await prisma.customerProfile.deleteMany({
        where: {
          user: {
            email: {
              in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
            }
          }
        }
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
          }
        }
      });
      await prisma.servicePlan.deleteMany({
        where: {
          name: 'Test Plan'
        }
      });
      await prisma.service.deleteMany({
        where: {
          name: 'Test Maid Service'
        }
      });

      // Create test service
      testData.service = await prisma.service.create({
        data: {
          name: 'Test Maid Service',
          description: 'Test service for booking',
          category: 'CLEANING',
          basePrice: 100,
          baseDuration: 120,
          isActive: true
        }
      });

      // Create test service plan
      testData.plan = await prisma.servicePlan.create({
        data: {
          name: 'Test Plan',
          description: 'Test subscription plan',
          serviceId: testData.service.id,
          basePrice: 1000,
          finalPrice: 800,
          duration: 1,
          sessionsPerMonth: 4,
          isActive: true
        }
      });

      // Create customer with subscription
      testData.customerWithSubscription = await prisma.user.create({
        data: {
          email: 'customer-with-sub@test.com',
          password: 'Test123!',
          name: 'Customer With Subscription',
          phone: '1111111111',
          role: 'CUSTOMER',
          customerProfile: {
            create: {
              preferences: {}
            }
          }
        },
        include: {
          customerProfile: true
        }
      });

      // Create customer without subscription
      testData.customerWithoutSubscription = await prisma.user.create({
        data: {
          email: 'customer-without-sub@test.com',
          password: 'Test123!',
          name: 'Customer Without Subscription',
          phone: '2222222222',
          role: 'CUSTOMER',
          customerProfile: {
            create: {
              preferences: {}
            }
          }
        },
        include: {
          customerProfile: true
        }
      });

      // Create active subscription for first customer
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(startDate.getMonth() + 1);

      testData.subscription = await prisma.subscription.create({
        data: {
          customerId: testData.customerWithSubscription.customerProfile.id,
          planId: testData.plan.id,
          status: 'ACTIVE',
          startDate: startDate,
          endDate: endDate,
          billingCycle: 'MONTHLY',
          amount: 800,
          discount: 200,
          autoRenew: true,
          nextBillDate: endDate
        }
      });

      // Generate JWT tokens
      testData.tokenWithSubscription = jwt.sign(
        { id: testData.customerWithSubscription.id },
        process.env.JWT_SECRET || 'test-secret'
      );

      testData.tokenWithoutSubscription = jwt.sign(
        { id: testData.customerWithoutSubscription.id },
        process.env.JWT_SECRET || 'test-secret'
      );
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      // Clean up test data in correct order
      await prisma.booking.deleteMany({
        where: {
          customer: {
            email: {
              in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
            }
          }
        }
      });
      await prisma.subscription.deleteMany({
        where: {
          customer: {
            user: {
              email: {
                in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
              }
            }
          }
        }
      });
      await prisma.customerProfile.deleteMany({
        where: {
          user: {
            email: {
              in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
            }
          }
        }
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: ['customer-with-sub@test.com', 'customer-without-sub@test.com']
          }
        }
      });
      await prisma.servicePlan.deleteMany({
        where: {
          name: 'Test Plan'
        }
      });
      await prisma.service.deleteMany({
        where: {
          name: 'Test Maid Service'
        }
      });
      await prisma.$disconnect();
    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  });

  describe('POST /api/bookings', () => {
    it('should allow booking for customer with active subscription', async () => {
      const bookingData = {
        serviceId: testData.service.id,
        scheduledDate: '2024-12-25',
        scheduledTime: '10:00',
        notes: 'Test booking with subscription',
        address: '123 Test Street'
      };

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testData.tokenWithSubscription}`)
        .send(bookingData);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasActiveSubscription).toBe(true);
      expect(res.body.data.booking.status).toBe('CONFIRMED');
      expect(res.body.data.booking.totalAmount).toBe(0);
      expect(res.body.data.booking.finalAmount).toBe(0);
      expect(res.body.message).toContain('No additional payment required');
    });

    it('should reject booking for customer without active subscription', async () => {
      const bookingData = {
        serviceId: testData.service.id,
        scheduledDate: '2024-12-25',
        scheduledTime: '10:00',
        notes: 'Test booking without subscription',
        address: '456 Test Avenue'
      };

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testData.tokenWithoutSubscription}`)
        .send(bookingData);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.requiresSubscription).toBe(true);
      expect(res.body.message).toContain('Only customers with active subscriptions can book maid services');
    });

    it('should reject booking with invalid service ID', async () => {
      const bookingData = {
        serviceId: 'invalid-service-id',
        scheduledDate: '2024-12-25',
        scheduledTime: '10:00',
        notes: 'Test booking with invalid service',
        address: '123 Test Street'
      };

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testData.tokenWithSubscription}`)
        .send(bookingData);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('Service not found');
    });

    it('should reject booking with missing required fields', async () => {
      const bookingData = {
        scheduledDate: '2024-12-25',
        scheduledTime: '10:00',
        notes: 'Test booking without service ID',
        address: '123 Test Street'
      };

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testData.tokenWithSubscription}`)
        .send(bookingData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('serviceId, scheduledDate, and scheduledTime are required');
    });

    it('should reject booking without authentication', async () => {
      const bookingData = {
        serviceId: testData.service.id,
        scheduledDate: '2024-12-25',
        scheduledTime: '10:00',
        notes: 'Test booking without auth',
        address: '123 Test Street'
      };

      const res = await request(app)
        .post('/api/bookings')
        .send(bookingData);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/subscriptions/status', () => {
    it('should return active subscription status for customer with subscription', async () => {
      const res = await request(app)
        .get('/api/subscriptions/status')
        .set('Authorization', `Bearer ${testData.tokenWithSubscription}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.hasActiveSubscription).toBe(true);
      expect(res.body.subscription).toBeDefined();
      expect(res.body.message).toContain('Active subscription found');
    });

    it('should return no subscription status for customer without subscription', async () => {
      const res = await request(app)
        .get('/api/subscriptions/status')
        .set('Authorization', `Bearer ${testData.tokenWithoutSubscription}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.hasActiveSubscription).toBe(false);
      expect(res.body.subscription).toBe(null);
      expect(res.body.message).toContain('No active subscription found');
    });
  });
});
