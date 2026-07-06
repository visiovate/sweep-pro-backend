const request = require('supertest');
const app = require('../index');
const { getPrismaClient } = require('../utils/database');
const crypto = require('crypto');

// Mock email service
jest.mock('../services/notification/EmailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true })
}));

describe('Email OTP Verification System', () => {
  let prisma;
  const testEmail = 'otp.test@example.com';
  const testPassword = 'Password123!';
  let userId;

  beforeAll(async () => {
    prisma = getPrismaClient();
    if (prisma) {
        // Clean up if exists
        await prisma.user.deleteMany({ where: { email: testEmail } });
    }
  });

  afterAll(async () => {
    if (prisma) {
        await prisma.user.deleteMany({ where: { email: testEmail } });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. OTP Generation (Registration & Resend)', () => {
    it('should generate and store OTP on registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'OTP Test',
          email: testEmail,
          password: testPassword,
          confirmPassword: testPassword,
          role: 'CUSTOMER',
          phone: '1234567890'
        });

      expect(res.status).toBe(201);
      
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      expect(user).toBeDefined();
      userId = user.id;

      const otpRecord = await prisma.otpVerification.findFirst({
        where: { userId, type: 'EMAIL_VERIFICATION' }
      });

      expect(otpRecord).toBeDefined();
      expect(otpRecord.used).toBe(false);
      expect(otpRecord.attempts).toBe(0);
      
      const emailServiceMock = require('../services/notification/EmailService').sendEmail;
      expect(emailServiceMock).toHaveBeenCalled();
    });

    it('should enforce 60 second cooldown on resend', async () => {
      // Trying to resend immediately should fail with 429 based on controller logic
      const res = await request(app)
        .post('/api/auth/resend-verification-otp')
        .send({ email: testEmail });

      expect(res.status).toBe(429);
      expect(res.body.message).toContain('wait 60 seconds');
    });
  });

  describe('2. OTP Verification', () => {
    it('should reject wrong OTP and increment attempts', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email-otp')
        .send({ email: testEmail, otp: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const otpRecord = await prisma.otpVerification.findFirst({
        where: { userId, type: 'EMAIL_VERIFICATION' },
        orderBy: { createdAt: 'desc' }
      });
      expect(otpRecord.attempts).toBe(1);
      expect(otpRecord.used).toBe(false);
    });

    it('should lock OTP after 5 failed attempts', async () => {
      for (let i = 0; i < 4; i++) {
        await request(app).post('/api/auth/verify-email-otp').send({ email: testEmail, otp: '000000' });
      }

      const otpRecord = await prisma.otpVerification.findFirst({
        where: { userId, type: 'EMAIL_VERIFICATION' },
        orderBy: { createdAt: 'desc' }
      });
      
      expect(otpRecord.attempts).toBe(5);
      
      // The 6th attempt should return max attempts exceeded
      const res = await request(app).post('/api/auth/verify-email-otp').send({ email: testEmail, otp: '000000' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Maximum verification attempts exceeded');

      const lockedOtp = await prisma.otpVerification.findUnique({ where: { id: otpRecord.id } });
      expect(lockedOtp.used).toBe(true); // Should be marked as used to invalidate it
    });

    it('should verify correct OTP successfully', async () => {
      // First generate a fresh OTP by manipulating the date of the old one to bypass cooldown
      await prisma.otpVerification.updateMany({
        where: { userId },
        data: { createdAt: new Date(Date.now() - 61 * 1000) }
      });

      // Spy on crypto.randomInt to know the OTP
      const cryptoSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(123456);
      
      await request(app).post('/api/auth/resend-verification-otp').send({ email: testEmail });
      
      cryptoSpy.mockRestore();

      const res = await request(app)
        .post('/api/auth/verify-email-otp')
        .send({ email: testEmail, otp: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      expect(user.emailVerifiedAt).not.toBeNull();
      
      const otpRecord = await prisma.otpVerification.findFirst({
        where: { userId, type: 'EMAIL_VERIFICATION' },
        orderBy: { createdAt: 'desc' }
      });
      expect(otpRecord.used).toBe(true);
    });

    it('should prevent replay attacks (using the same OTP again)', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email-otp')
        .send({ email: testEmail, otp: '123456' });

      // Should fail because email is already verified
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Email is already verified');
    });
  });
});
