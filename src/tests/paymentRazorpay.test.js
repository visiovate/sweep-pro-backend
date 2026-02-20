const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

// Mock Razorpay service so tests don't call real Razorpay APIs
jest.mock('../services/razorpayService', () => {
  const createSubscriptionOrder = jest.fn();
  const processSuccessfulPayment = jest.fn();
  const processFailedPayment = jest.fn();

  return {
    createSubscriptionOrder,
    processSuccessfulPayment,
    processFailedPayment,
  };
});

const razorpayService = require('../services/razorpayService');
const app = require('../index');
const prisma = getPrismaClient();

jest.setTimeout(30000);

describe('Razorpay payment routes', () => {
  const TEST_EMAIL = 'razorpay-test-customer@example.com';
  const TEST_PLAN_NAME = 'Razorpay Test Plan';

  const testData = {
    user: null,
    customerProfile: null,
    service: null,
    plan: null,
    subscription: null,
    token: null,
  };

  beforeAll(async () => {
    // Ensure test Razorpay env vars exist (values are dummy for tests)
    process.env.RAZORPAY_TEST_KEY_ID = process.env.RAZORPAY_TEST_KEY_ID || 'rzp_test_dummy_key';
    process.env.RAZORPAY_TEST_KEY_SECRET = process.env.RAZORPAY_TEST_KEY_SECRET || 'rzp_test_dummy_secret';

    // Clean previous test data if any
    await prisma.payment.deleteMany({
      where: {
        customer: {
          email: TEST_EMAIL,
        },
      },
    });

    await prisma.subscription.deleteMany({
      where: {
        customer: {
          user: {
            email: TEST_EMAIL,
          },
        },
      },
    });

    await prisma.customerProfile.deleteMany({
      where: {
        user: {
          email: TEST_EMAIL,
        },
      },
    });

    await prisma.user.deleteMany({
      where: { email: TEST_EMAIL },
    });

    await prisma.servicePlan.deleteMany({
      where: { name: TEST_PLAN_NAME },
    });

    await prisma.service.deleteMany({
      where: { name: 'Razorpay Test Service' },
    });

    // Create minimal data needed for subscription + payment flow
    testData.service = await prisma.service.create({
      data: {
        name: 'Razorpay Test Service',
        description: 'Test service for Razorpay payments',
        category: 'CLEANING',
        basePrice: 100,
        baseDuration: 60,
        isActive: true,
      },
    });

    testData.plan = await prisma.servicePlan.create({
      data: {
        name: TEST_PLAN_NAME,
        description: 'Razorpay test subscription plan',
        serviceId: testData.service.id,
        basePrice: 2000,
        finalPrice: 1500,
        duration: 1,
        sessionsPerWeek: 6,
        sessionsPerMonth: 24,
        isActive: true,
      },
    });

    testData.user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        password: 'Test123!',
        name: 'Razorpay Test Customer',
        phone: '9999999999',
        role: 'CUSTOMER',
        customerProfile: {
          create: {
            preferences: {},
          },
        },
      },
      include: {
        customerProfile: true,
      },
    });

    testData.customerProfile = testData.user.customerProfile;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + 1);

    testData.subscription = await prisma.subscription.create({
      data: {
        customerId: testData.customerProfile.id,
        planId: testData.plan.id,
        status: 'PENDING_PAYMENT',
        startDate,
        endDate,
        billingCycle: 'MONTHLY',
        amount: 1500,
        discount: 500,
        autoRenew: true,
      },
    });

    testData.token = jwt.sign(
      { id: testData.user.id },
      process.env.JWT_SECRET || 'test-secret',
    );
  });

  afterAll(async () => {
    try {
      await prisma.payment.deleteMany({
        where: {
          customer: {
            email: TEST_EMAIL,
          },
        },
      });

      await prisma.subscription.deleteMany({
        where: {
          customer: {
            user: {
              email: TEST_EMAIL,
            },
          },
        },
      });

      await prisma.customerProfile.deleteMany({
        where: {
          user: {
            email: TEST_EMAIL,
          },
        },
      });

      await prisma.user.deleteMany({
        where: { email: TEST_EMAIL },
      });

      await prisma.servicePlan.deleteMany({
        where: { name: TEST_PLAN_NAME },
      });

      await prisma.service.deleteMany({
        where: { name: 'Razorpay Test Service' },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('POST /api/payments/razorpay/subscription/create-order', () => {
    it('should create a Razorpay order for a valid subscription and amount', async () => {
      const testAmount = 1999; // amount in rupees (before Razorpay multiplies to paise)

      razorpayService.createSubscriptionOrder.mockResolvedValue({
        success: true,
        order: {
          id: 'order_test_123',
          amount: testAmount * 100,
          currency: 'INR',
        },
        subscription: testData.subscription,
      });

      const res = await request(app)
        .post('/api/payments/razorpay/subscription/create-order')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          subscriptionId: testData.subscription.id,
          amount: testAmount,
          currency: 'INR',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.id).toBe('order_test_123');
      expect(res.body.order.amount).toBe(testAmount * 100);
      expect(res.body.key).toBe(process.env.RAZORPAY_TEST_KEY_ID);

      expect(razorpayService.createSubscriptionOrder).toHaveBeenCalledWith(
        testData.subscription.id,
        testAmount,
        'INR',
      );
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/payments/razorpay/subscription/create-order')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('subscriptionId');
    });
  });

  describe('POST /api/payments/razorpay/verify', () => {
    it('should verify a successful Razorpay payment using the service', async () => {
      razorpayService.processSuccessfulPayment.mockResolvedValue({
        success: true,
        payment: { id: 'payment_test_123', status: 'COMPLETED' },
        razorpayPayment: { id: 'pay_test_123' },
      });

      const res = await request(app)
        .post('/api/payments/razorpay/verify')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          razorpay_order_id: 'order_test_123',
          razorpay_payment_id: 'pay_test_123',
          razorpay_signature: 'signature_test_123',
          payment_method: 'card',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Payment verified successfully');
      expect(res.body.payment).toBeDefined();
      expect(res.body.payment.id).toBe('payment_test_123');

      expect(razorpayService.processSuccessfulPayment).toHaveBeenCalledWith({
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_123',
        razorpay_signature: 'signature_test_123',
        payment_method: 'card',
      });
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/payments/razorpay/verify')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('razorpay_order_id');
    });
  });
});
