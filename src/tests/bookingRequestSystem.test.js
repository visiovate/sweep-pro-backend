const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../index');

const prisma = new PrismaClient();

describe('Booking Request and Completion System', () => {
  let testCustomer, testMaid, testService, testAssignment, testBooking, testAssignmentRequest;
  let customerToken, maidToken;

  beforeAll(async () => {
    // Clean up existing test data
    await cleanupTestData();

    // Create test customer
    testCustomer = await prisma.user.create({
      data: {
        email: 'test.customer@test.com',
        password: 'hashedpassword',
        name: 'Test Customer',
        phone: '+919876543210',
        role: 'CUSTOMER',
        address: 'Test Address',
        timeSlot: '09:00-12:00'
      }
    });

    // Create customer profile
    await prisma.customerProfile.create({
      data: {
        userId: testCustomer.id,
        preferences: { cleaningType: 'deep' },
        specialInstructions: 'Test instructions'
      }
    });

    // Create test maid
    testMaid = await prisma.user.create({
      data: {
        email: 'test.maid@test.com',
        password: 'hashedpassword',
        name: 'Test Maid',
        phone: '+919876543211',
        role: 'MAID',
        address: 'Maid Address'
      }
    });

    // Create maid profile
    const maidProfile = await prisma.maidProfile.create({
      data: {
        userId: testMaid.id,
        skills: ['cleaning'],
        languages: ['English'],
        availability: { monday: ['09:00-17:00'] },
        status: 'ACTIVE'
      }
    });

    // Create test service
    testService = await prisma.service.create({
      data: {
        name: 'Deep Cleaning',
        description: 'Complete deep cleaning service',
        category: 'DEEP_CLEANING',
        baseDuration: 120,
        basePrice: 500.0,
        isActive: true
      }
    });

    // Create customer-maid assignment
    testAssignment = await prisma.customerMaidAssignment.create({
      data: {
        customerId: testCustomer.id,
        maidId: maidProfile.id,
        isActive: true,
        notes: 'Test assignment'
      }
    });

    // Generate tokens (mock implementation)
    customerToken = 'mock-customer-token';
    maidToken = 'mock-maid-token';
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function cleanupTestData() {
    try {
      await prisma.assignmentRequest.deleteMany({
        where: { 
          OR: [
            { booking: { customerId: testCustomer?.id } },
            { maid: { userId: testMaid?.id } }
          ]
        }
      });
      await prisma.booking.deleteMany({
        where: { 
          OR: [
            { customerId: testCustomer?.id },
            { maidId: testMaid?.id }
          ]
        }
      });
      await prisma.customerMaidAssignment.deleteMany({
        where: { customerId: testCustomer?.id }
      });
      await prisma.maidProfile.deleteMany({
        where: { userId: testMaid?.id }
      });
      await prisma.customerProfile.deleteMany({
        where: { userId: testCustomer?.id }
      });
      await prisma.user.deleteMany({
        where: { 
          email: { 
            in: ['test.customer@test.com', 'test.maid@test.com'] 
          }
        }
      });
      await prisma.service.deleteMany({
        where: { name: 'Deep Cleaning' }
      });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  describe('Booking Request Timing', () => {
    test('should calculate request time 20 hours before service', () => {
      const { calculateRequestTime, getNextServiceDateTime } = require('../utils/timeSlotUtils');
      
      const serviceDateTime = getNextServiceDateTime('09:00-12:00');
      const requestTime = calculateRequestTime(serviceDateTime);
      
      const hoursDifference = (serviceDateTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
      
      expect(hoursDifference).toBe(20);
    });

    test('should determine when to send request immediately', () => {
      const { shouldSendRequestImmediately, ASSIGNMENT_REQUEST_HOURS_BEFORE } = require('../utils/timeSlotUtils');
      
      // Mock time slot that should trigger immediate request
      const timeSlot = '09:00-12:00';
      const result = shouldSendRequestImmediately(timeSlot);
      
      // Result depends on current time, but function should execute without error
      expect(typeof result).toBe('boolean');
      expect(ASSIGNMENT_REQUEST_HOURS_BEFORE).toBe(20);
    });
  });

  describe('Booking Request API', () => {
    beforeEach(async () => {
      // Create a test booking and assignment request
      testBooking = await prisma.booking.create({
        data: {
          customerId: testCustomer.id,
          serviceId: testService.id,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          estimatedDuration: 120,
          serviceAddress: testCustomer.address,
          totalAmount: 500.0,
          finalAmount: 500.0,
          status: 'PENDING',
          assignmentStatus: 'PENDING_ASSIGNMENT',
          timeSlot: '09:00-12:00'
        }
      });

      const maidProfile = await prisma.maidProfile.findUnique({
        where: { userId: testMaid.id }
      });

      testAssignmentRequest = await prisma.assignmentRequest.create({
        data: {
          bookingId: testBooking.id,
          maidId: maidProfile.id,
          status: 'pending',
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
          requestedAt: new Date()
        }
      });
    });

    test('should get pending requests for maid', async () => {
      // Mock authentication middleware
      const mockAuth = (req, res, next) => {
        req.user = testMaid;
        next();
      };

      const response = await request(app)
        .get('/api/booking-requests/pending')
        .set('Authorization', `Bearer ${maidToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0]).toHaveProperty('booking');
      expect(response.body.data[0].booking).toHaveProperty('customer');
      expect(response.body.data[0].booking.customer.name).toBe(testCustomer.name);
    });

    test('should accept booking request', async () => {
      const response = await request(app)
        .post(`/api/booking-requests/${testAssignmentRequest.id}/accept`)
        .set('Authorization', `Bearer ${maidToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CONFIRMED');
      expect(response.body.data.assignmentStatus).toBe('ACCEPTED');

      // Verify database update
      const updatedRequest = await prisma.assignmentRequest.findUnique({
        where: { id: testAssignmentRequest.id }
      });
      expect(updatedRequest.status).toBe('accepted');
      expect(updatedRequest.respondedAt).toBeTruthy();
    });

    test('should reject booking request with reason', async () => {
      const rejectionReason = 'Not available at that time';

      const response = await request(app)
        .post(`/api/booking-requests/${testAssignmentRequest.id}/reject`)
        .set('Authorization', `Bearer ${maidToken}`)
        .send({ rejectionReason })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CANCELLED');
      expect(response.body.data.assignmentStatus).toBe('REJECTED');

      // Verify database update
      const updatedRequest = await prisma.assignmentRequest.findUnique({
        where: { id: testAssignmentRequest.id }
      });
      expect(updatedRequest.status).toBe('rejected');
      expect(updatedRequest.rejectionReason).toBe(rejectionReason);
    });

    test('should fail to reject without reason', async () => {
      const response = await request(app)
        .post(`/api/booking-requests/${testAssignmentRequest.id}/reject`)
        .set('Authorization', `Bearer ${maidToken}`)
        .send({ rejectionReason: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });
  });

  describe('Booking Completion API', () => {
    beforeEach(async () => {
      // Create a confirmed booking
      testBooking = await prisma.booking.create({
        data: {
          customerId: testCustomer.id,
          maidId: testMaid.id,
          serviceId: testService.id,
          scheduledAt: new Date(),
          estimatedDuration: 120,
          serviceAddress: testCustomer.address,
          totalAmount: 500.0,
          finalAmount: 500.0,
          status: 'CONFIRMED',
          assignmentStatus: 'ACCEPTED',
          timeSlot: '09:00-12:00',
          assignedAt: new Date()
        }
      });
    });

    test('should get assigned bookings for maid', async () => {
      const response = await request(app)
        .get('/api/booking-completion/maid/assigned')
        .set('Authorization', `Bearer ${maidToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0]).toHaveProperty('customer');
      expect(response.body.data[0].customer.name).toBe(testCustomer.name);
    });

    test('should get customer bookings', async () => {
      const response = await request(app)
        .get('/api/booking-completion/customer/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0]).toHaveProperty('maid');
      expect(response.body.data[0].maid.name).toBe(testMaid.name);
    });

    test('should start booking service', async () => {
      const response = await request(app)
        .post(`/api/booking-completion/${testBooking.id}/start`)
        .set('Authorization', `Bearer ${maidToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('IN_PROGRESS');
      expect(response.body.data.actualStartTime).toBeTruthy();

      // Verify database update
      const updatedBooking = await prisma.booking.findUnique({
        where: { id: testBooking.id }
      });
      expect(updatedBooking.status).toBe('IN_PROGRESS');
      expect(updatedBooking.actualStartTime).toBeTruthy();
    });

    test('should generate QR code for maid', async () => {
      const response = await request(app)
        .get('/api/booking-completion/maid/qr-code')
        .set('Authorization', `Bearer ${maidToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('qrCodeData');
      expect(response.body.data).toHaveProperty('maidInfo');

      // Parse QR code data
      const qrData = JSON.parse(response.body.data.qrCodeData);
      expect(qrData.userId).toBe(testMaid.id);
      expect(qrData.name).toBe(testMaid.name);
      expect(qrData.type).toBe('maid_verification');
    });

    test('should complete booking with valid QR code', async () => {
      // First start the service
      await prisma.booking.update({
        where: { id: testBooking.id },
        data: { status: 'IN_PROGRESS' }
      });

      // Get maid profile for QR data
      const maidProfile = await prisma.maidProfile.findUnique({
        where: { userId: testMaid.id }
      });

      const qrCodeData = JSON.stringify({
        maidId: maidProfile.id,
        userId: testMaid.id,
        name: testMaid.name,
        type: 'maid_verification'
      });

      const response = await request(app)
        .post(`/api/booking-completion/${testBooking.id}/complete`)
        .set('Authorization', `Bearer ${maidToken}`)
        .send({ qrCodeData })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('COMPLETED');
      expect(response.body.data.qrVerified).toBe(true);
      expect(response.body.data.completedAt).toBeTruthy();

      // Verify database update
      const updatedBooking = await prisma.booking.findUnique({
        where: { id: testBooking.id }
      });
      expect(updatedBooking.status).toBe('COMPLETED');
      expect(updatedBooking.completedAt).toBeTruthy();
      expect(updatedBooking.actualEndTime).toBeTruthy();
    });

    test('should fail to complete booking with invalid QR code', async () => {
      const invalidQRData = JSON.stringify({
        maidId: 'invalid-maid-id',
        userId: 'invalid-user-id',
        name: 'Invalid Maid',
        type: 'maid_verification'
      });

      const response = await request(app)
        .post(`/api/booking-completion/${testBooking.id}/complete`)
        .set('Authorization', `Bearer ${maidToken}`)
        .send({ qrCodeData: invalidQRData })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('verification failed');
    });

    test('should fail to complete booking without QR code', async () => {
      const response = await request(app)
        .post(`/api/booking-completion/${testBooking.id}/complete`)
        .set('Authorization', `Bearer ${maidToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('QR code data is required');
    });
  });

  describe('Job Scheduler', () => {
    test('should schedule assignment for customer', async () => {
      const JobScheduler = require('../services/jobScheduler');

      const maidProfile = await prisma.maidProfile.findUnique({
        where: { userId: testMaid.id }
      });

      const result = await JobScheduler.scheduleForCustomer(
        testCustomer.id,
        maidProfile.id,
        testCustomer.timeSlot,
        {
          customerName: testCustomer.name,
          maidName: testMaid.name,
          maidUserId: testMaid.id
        }
      );

      expect(result.success).toBe(true);
      expect(result.customerId).toBe(testCustomer.id);
      expect(result.scheduledTime).toBeTruthy();
      expect(result.serviceTime).toBeTruthy();
    });

    test('should handle buffer period customers', async () => {
      const JobScheduler = require('../services/jobScheduler');

      // Create a customer profile with subscription in buffer period
      const subscription = await prisma.subscription.create({
        data: {
          customerId: (await prisma.customerProfile.findUnique({
            where: { userId: testCustomer.id }
          })).id,
          planId: (await prisma.servicePlan.findFirst()).id || 'test-plan',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amount: 1000,
          status: 'ACTIVE',
          isInBufferPeriod: true
        }
      });

      const maidProfile = await prisma.maidProfile.findUnique({
        where: { userId: testMaid.id }
      });

      const result = await JobScheduler.scheduleForCustomer(
        testCustomer.id,
        maidProfile.id,
        testCustomer.timeSlot
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('buffer period');

      // Cleanup
      await prisma.subscription.delete({
        where: { id: subscription.id }
      });
    });
  });

  describe('Notification System', () => {
    test('should create notification on booking acceptance', async () => {
      // Create a fresh assignment request
      testBooking = await prisma.booking.create({
        data: {
          customerId: testCustomer.id,
          serviceId: testService.id,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          estimatedDuration: 120,
          serviceAddress: testCustomer.address,
          totalAmount: 500.0,
          finalAmount: 500.0,
          status: 'PENDING',
          assignmentStatus: 'PENDING_ASSIGNMENT',
          timeSlot: '09:00-12:00'
        }
      });

      const maidProfile = await prisma.maidProfile.findUnique({
        where: { userId: testMaid.id }
      });

      testAssignmentRequest = await prisma.assignmentRequest.create({
        data: {
          bookingId: testBooking.id,
          maidId: maidProfile.id,
          status: 'pending',
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          requestedAt: new Date()
        }
      });

      // Accept the request
      await request(app)
        .post(`/api/booking-requests/${testAssignmentRequest.id}/accept`)
        .set('Authorization', `Bearer ${maidToken}`)
        .expect(200);

      // Check if notification was created
      const notifications = await prisma.notification.findMany({
        where: {
          userId: testCustomer.id,
          type: 'BOOKING_CONFIRMED'
        },
        orderBy: { createdAt: 'desc' },
        take: 1
      });

      expect(notifications.length).toBe(1);
      expect(notifications[0].title).toBe('Booking Confirmed');
      expect(notifications[0].message).toContain(testMaid.name);
    });

    test('should create notification on booking completion', async () => {
      // Create and complete a booking
      testBooking = await prisma.booking.create({
        data: {
          customerId: testCustomer.id,
          maidId: testMaid.id,
          serviceId: testService.id,
          scheduledAt: new Date(),
          estimatedDuration: 120,
          serviceAddress: testCustomer.address,
          totalAmount: 500.0,
          finalAmount: 500.0,
          status: 'IN_PROGRESS',
          assignmentStatus: 'ACCEPTED',
          timeSlot: '09:00-12:00'
        }
      });

      const maidProfile = await prisma.maidProfile.findUnique({
        where: { userId: testMaid.id }
      });

      const qrCodeData = JSON.stringify({
        maidId: maidProfile.id,
        userId: testMaid.id,
        name: testMaid.name,
        type: 'maid_verification'
      });

      // Complete the booking
      await request(app)
        .post(`/api/booking-completion/${testBooking.id}/complete`)
        .set('Authorization', `Bearer ${maidToken}`)
        .send({ qrCodeData })
        .expect(200);

      // Check if notification was created
      const notifications = await prisma.notification.findMany({
        where: {
          userId: testCustomer.id,
          type: 'SERVICE_COMPLETED'
        },
        orderBy: { createdAt: 'desc' },
        take: 1
      });

      expect(notifications.length).toBe(1);
      expect(notifications[0].title).toBe('Service Completed');
      expect(notifications[0].message).toContain(testMaid.name);
    });
  });
});

describe('Integration Tests', () => {
  test('should complete full booking workflow', async () => {
    // This test would simulate the complete workflow:
    // 1. Customer-maid assignment
    // 2. Automatic booking request scheduling  
    // 3. Maid receives request
    // 4. Maid accepts request
    // 5. Booking gets confirmed
    // 6. Service starts
    // 7. Service completes with QR verification
    // 8. Customer gets notified

    // Note: This would require more complex setup with time manipulation
    // and mocking of the scheduling system
    expect(true).toBe(true); // Placeholder
  });
});