const otpService = require('../services/otpService');
const { getPrismaClient } = require('../utils/database');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

class OtpController {
  async sendVerificationOtp(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { email } });

      // Generic response to prevent email enumeration
      const genericResponse = {
        success: true,
        message: 'If the account exists and is unverified, an OTP has been sent.'
      };

      if (!user || user.emailVerifiedAt) {
        return res.json(genericResponse);
      }

      const rawOtp = await otpService.generateOTP(user.id, 'EMAIL_VERIFICATION');
      await otpService.sendOTPEmail(user, rawOtp);

      return res.json(genericResponse);
    } catch (error) {
      console.error('Send Verification OTP Error:', error);
      if (error.message.includes('wait 60 seconds')) {
        return res.status(429).json({ success: false, message: error.message });
      }
      // Return generic response even on error to prevent enumeration/leaks
      return res.json({
        success: true,
        message: 'If the account exists and is unverified, an OTP has been sent.'
      });
    }
  }

  async verifyEmailOtp(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);
      const otp = String(req.body?.otp || '').trim();

      if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
      }

      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { email } });

      // Prevent email enumeration on verification too
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid email or OTP.' });
      }

      if (user.emailVerifiedAt) {
        return res.status(400).json({ success: false, message: 'Email is already verified.' });
      }

      await otpService.verifyOTP(user.id, 'EMAIL_VERIFICATION', otp);

      // OTP verified successfully, update user
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          status: user.status === 'PENDING_VERIFICATION' ? 'ACTIVE' : user.status,
          tokenVersion: { increment: 1 }
        }
      });

      return res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
    } catch (error) {
      console.error('Verify Email OTP Error:', error);
      return res.status(400).json({ success: false, message: error.message || 'Verification failed.' });
    }
  }

  async resendVerificationOtp(req, res) {
    // This calls the same logic as sendVerificationOtp
    return this.sendVerificationOtp(req, res);
  }
}

// Bind methods so they can be passed directly to router
const controller = new OtpController();
module.exports = {
  sendVerificationOtp: controller.sendVerificationOtp.bind(controller),
  verifyEmailOtp: controller.verifyEmailOtp.bind(controller),
  resendVerificationOtp: controller.resendVerificationOtp.bind(controller)
};
