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
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification Code</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 30px 20px; background: linear-gradient(135deg, #1800ad 0%, #1f2fd1 100%); text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Sweepro</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Hello ${String(user.name || 'there').replace(/[<>&"]/g, '')},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Your verification code is:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 30px auto;">
                <tr>
                  <td style="padding: 20px 30px; background-color: #f0f0f0; border-radius: 8px; text-align: center;">
                    <span style="font-size: 32px; font-weight: bold; color: #1800ad; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                      ${rawOtp}
                    </span>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0; font-size: 14px; color: #666666; line-height: 1.6;">
                This code will expire in 10 minutes for your security.
              </p>
              <p style="margin: 20px 0; font-size: 14px; color: #666666; line-height: 1.6;">
                If you didn't request this code, please ignore this email. Your account remains secure.
              </p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
              <p style="margin: 20px 0 0 0; font-size: 12px; color: #999999; text-align: center;">
                This is an automated message from Sweepro. Please do not reply to this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; background-color: #f5f5f5; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999999;">
                © ${new Date().getFullYear()} Sweepro. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const text = `
      Sweepro - Email Verification Code
      
      Hello ${String(user.name || 'there').replace(/[<>&"]/g, '')},
      
      Your verification code is: ${rawOtp}
      
      This code will expire in 10 minutes for your security.
      
      If you didn't request this code, please ignore this email. Your account remains secure.
      
      This is an automated message from Sweepro. Please do not reply to this email.
      
      © ${new Date().getFullYear()} Sweepro. All rights reserved.
    `;

    console.log(`📧 Attempting to send OTP email to ${user.email}`);
    const result = await emailService.sendEmail({
      to: user.email,
      subject: `Your Sweepro Verification Code: ${rawOtp.substring(0, 3)}***`,
      html,
      text
    });
    console.log(`📧 Email send result:`, result);
    if (!result.success) {
      console.error(`❌ Failed to send OTP email to ${user.email}:`, result.error || result.reason);
    }
    return result;
  }
}

module.exports = new OtpService();
