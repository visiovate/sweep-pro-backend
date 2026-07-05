const crypto = require('crypto');
const { getPrismaClient } = require('../utils/database');
const emailService = require('./notification/EmailService');

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// Hash OTP securely
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

class OtpService {
  async generateOTP(userId, type) {
    const prisma = getPrismaClient();

    // Check cooldown
    const latestOtp = await prisma.otpVerification.findFirst({
      where: { userId, type },
      orderBy: { createdAt: 'desc' }
    });

    if (latestOtp) {
      const timeSinceLastOtp = Date.now() - new Date(latestOtp.createdAt).getTime();
      if (timeSinceLastOtp < RESEND_COOLDOWN_MS) {
        throw new Error('Please wait 60 seconds before requesting a new OTP.');
      }
    }

    // Invalidate previous unused OTPs
    await prisma.otpVerification.updateMany({
      where: { userId, type, used: false },
      data: { used: true }
    });

    // Generate cryptographically secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = hashOtp(rawOtp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Store in DB
    await prisma.otpVerification.create({
      data: {
        userId,
        type,
        otpHash,
        expiresAt
      }
    });

    return rawOtp;
  }

  async verifyOTP(userId, type, rawOtp) {
    const prisma = getPrismaClient();

    // Fetch the latest valid OTP
    const otpRecord = await prisma.otpVerification.findFirst({
      where: { userId, type, used: false },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      throw new Error('No valid OTP found. Please request a new one.');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new Error('OTP has expired. Please request a new one.');
    }

    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      // Invalidate it
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { used: true }
      });
      throw new Error('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // Compare securely (Constant-time comparison)
    const providedHash = hashOtp(rawOtp);
    const isValid = crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(otpRecord.otpHash));

    if (!isValid) {
      // Increment attempts
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } }
      });
      throw new Error('Invalid OTP.');
    }

    // Mark as used
    await prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: { used: true }
    });

    return true;
  }

  async sendOTPEmail(user, rawOtp) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1800ad 0%, #1f2fd1 100%); padding: 24px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Verify your Sweepro email</h1>
        </div>
        <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #374151;">Hi ${String(user.name || 'there').replace(/[<>&"]/g, '')},</p>
          <p style="font-size: 16px; color: #374151;">Please use the following One-Time Password (OTP) to verify your email address. This OTP is valid for 10 minutes.</p>
          <div style="text-align: center; margin: 24px 0;">
            <div style="display: inline-block; padding: 14px 22px; background: #e5e7eb; color: #111827; border-radius: 8px; font-weight: bold; font-size: 24px; letter-spacing: 4px;">
              ${rawOtp}
            </div>
          </div>
          <p style="font-size: 14px; color: #6b7280;">If you didn't request this, please ignore this email or contact support.</p>
        </div>
      </div>
    `;

    await emailService.sendEmail({
      to: user.email,
      subject: 'Verify your Sweepro email - OTP',
      html
    });
  }
}

module.exports = new OtpService();
