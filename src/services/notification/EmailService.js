const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Email Notification Service
 * Supports both SendGrid (production) and SMTP (development)
 * 
 * Setup:
 * npm install @sendgrid/mail nodemailer
 * 
 * Environment Variables:
 * SENDGRID_API_KEY=your_key (optional, uses SMTP if not provided)
 * SMTP_HOST=smtp.gmail.com
 * SMTP_PORT=587
 * SMTP_USER=your_email@gmail.com
 * SMTP_PASS=your_app_password
 * FROM_EMAIL=noreply@sweeppro.com
 * FROM_NAME=SweepPro
 * FRONTEND_URL=http://localhost:5173
 */

class EmailService {
  constructor() {
    this.provider = null;
    this.client = null;
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@sweeppro.com';
    this.fromName = process.env.FROM_NAME || 'SweepPro';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    this.initializeProvider();
  }

  initializeProvider() {
    // Try SendGrid first
    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.client = sgMail;
        this.provider = 'sendgrid';
        console.log('✅ Email service initialized with SendGrid');
      } catch (error) {
        console.warn('⚠️ SendGrid not available, falling back to SMTP');
        this.initializeSMTP();
      }
    } else {
      this.initializeSMTP();
    }
  }

  initializeSMTP() {
    try {
      const nodemailer = require('nodemailer');
      this.client = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      this.provider = 'smtp';
      console.log('✅ Email service initialized with SMTP');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
      this.provider = 'disabled';
    }
  }

  async sendEmail({ to, subject, html, text }) {
    if (this.provider === 'disabled') {
      console.log('📧 Email service disabled, skipping send to:', to);
      return { success: false, reason: 'disabled' };
    }

    try {
      const emailData = {
        to,
        from: { email: this.fromEmail, name: this.fromName },
        subject,
        html,
        text: text || this.stripHtml(html)
      };

      let result;
      if (this.provider === 'sendgrid') {
        result = await this.client.send(emailData);
      } else {
        result = await this.client.sendMail(emailData);
      }

      console.log(`✅ Email sent to ${to}: ${subject}`);
      return { success: true, messageId: result[0]?.messageId || result.messageId };
    } catch (error) {
      console.error('❌ Email send error:', error);
      return { success: false, error: error.message };
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  async sendNotificationEmail(notification, user) {
    // Check user preferences
    const preferences = await prisma.notificationPreference.findUnique({
      where: { userId: user.id }
    });

    if (preferences && !preferences.emailEnabled) {
      console.log(`📧 Email disabled for user ${user.id}`);
      return { success: false, reason: 'disabled_by_user' };
    }

    const { subject, html } = this.getEmailTemplate(notification.type, {
      name: user.name,
      email: user.email,
      ...notification.data
    });

    return await this.sendEmail({
      to: user.email,
      subject: subject || notification.title,
      html
    });
  }

  getEmailTemplate(type, data) {
    const templates = {
      USER_REGISTERED: {
        subject: 'Welcome to SweepPro! 🎉',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Welcome to SweepPro! 🎉</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #374151;">Hi ${data.name},</p>
              <p style="font-size: 16px; color: #374151;">Thank you for joining SweepPro! We're excited to help you keep your home sparkling clean.</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
                <h3 style="color: #667eea; margin-top: 0;">What's Next?</h3>
                <ul style="color: #374151; line-height: 1.8;">
                  <li>✨ Browse our cleaning plans</li>
                  <li>📅 Schedule your first service</li>
                  <li>🛡️ Meet our verified maids</li>
                  <li>💰 Enjoy flexible pricing</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.frontendUrl}/plans" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  View Plans & Get Started
                </a>
              </div>

              <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                Need help? Reply to this email or contact our support team.
              </p>
              
              <p style="font-size: 16px; color: #374151; margin-top: 20px;">
                Best regards,<br>
                <strong>The SweepPro Team</strong>
              </p>
            </div>
          </div>
        `
      },

      SUBSCRIPTION_CREATED: {
        subject: 'Subscription Confirmed! ✅',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Subscription Confirmed! ✅</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #374151;">Hi ${data.name},</p>
              <p style="font-size: 16px; color: #374151;">Your subscription has been successfully activated!</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #10b981;">
                <h3 style="color: #10b981; margin-top: 0;">Subscription Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Plan:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.planName || 'Monthly Plan'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Start Date:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.startDate || new Date().toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Amount:</td>
                    <td style="padding: 10px 0; color: #374151; font-size: 18px; font-weight: bold;">₹${data.amount || '0'}</td>
                  </tr>
                </table>
              </div>

              <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #059669; font-weight: bold;">🎉 What happens next?</p>
                <p style="margin: 10px 0 0 0; color: #374151;">We're assigning a verified maid to your booking. You'll receive a confirmation with maid details shortly!</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.frontendUrl}/dashboard" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  View Dashboard
                </a>
              </div>

              <p style="font-size: 16px; color: #374151; margin-top: 20px;">
                Best regards,<br>
                <strong>The SweepPro Team</strong>
              </p>
            </div>
          </div>
        `
      },

      MAID_ASSIGNED: {
        subject: 'Maid Assigned to Your Booking! 🧹',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Maid Assigned! 🧹</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #374151;">Hi ${data.customerName || data.name},</p>
              <p style="font-size: 16px; color: #374151;">Great news! We've assigned a verified maid to your booking.</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #3b82f6;">
                <h3 style="color: #3b82f6; margin-top: 0;">Booking Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Maid Name:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.maidName || 'TBD'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Phone:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.maidPhone || 'TBD'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Date:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.date || new Date().toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Time:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.time || data.timeSlot || 'TBD'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Address:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.address || data.serviceAddress || 'Your registered address'}</td>
                  </tr>
                </table>
              </div>

              <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #1e40af; font-weight: bold;">📝 Important Notes:</p>
                <ul style="margin: 10px 0 0 0; color: #374151; padding-left: 20px;">
                  <li>Please ensure someone is available to let the maid in</li>
                  <li>Keep cleaning supplies ready if needed</li>
                  <li>You can track the maid's arrival in real-time</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.frontendUrl}/bookings/${data.bookingId}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Track Booking
                </a>
              </div>

              <p style="font-size: 16px; color: #374151; margin-top: 20px;">
                Best regards,<br>
                <strong>The SweepPro Team</strong>
              </p>
            </div>
          </div>
        `
      },

      INACTIVE_USER_REMINDER: {
        subject: '🧹 Why wait? Get your home sparkling clean!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Special Offer Just for You! 🎁</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #374151;">Hi ${data.name},</p>
              <p style="font-size: 16px; color: #374151;">We noticed you registered with SweepPro but haven't booked a service yet.</p>
              
              <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 25px; border-radius: 8px; margin: 20px 0; text-align: center; border: 3px dashed #f59e0b;">
                <h2 style="color: #d97706; margin: 0 0 10px 0; font-size: 28px;">20% OFF</h2>
                <p style="color: #92400e; margin: 0; font-size: 18px; font-weight: bold;">Your First Booking!</p>
                <p style="color: #92400e; margin: 10px 0 0 0; font-size: 14px;">Limited time offer - Book within 48 hours</p>
              </div>

              <h3 style="color: #374151; margin-top: 30px;">Why Choose SweepPro?</h3>
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <ul style="color: #374151; line-height: 2; padding-left: 20px;">
                  <li>✨ <strong>Verified Maids:</strong> All our maids are background-checked</li>
                  <li>⏰ <strong>Flexible Scheduling:</strong> Book at your convenience</li>
                  <li>🛡️ <strong>Quality Guarantee:</strong> 100% satisfaction or money back</li>
                  <li>💰 <strong>Affordable Pricing:</strong> Starting from just ₹299</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.frontendUrl}/book?discount=FIRST20" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
                  Claim 20% Discount Now
                </a>
              </div>

              <p style="font-size: 14px; color: #6b7280; text-align: center; margin-top: 20px;">
                Offer expires in 48 hours. Don't miss out!
              </p>

              <p style="font-size: 16px; color: #374151; margin-top: 30px;">
                Best regards,<br>
                <strong>The SweepPro Team</strong>
              </p>
            </div>
          </div>
        `
      },

      SUBSCRIPTION_EXPIRING: {
        subject: `Your Subscription Expires Soon! 📅`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Subscription Expiring Soon! ⏰</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #374151;">Hi ${data.name},</p>
              <p style="font-size: 16px; color: #374151;">Your SweepPro subscription is expiring soon!</p>
              
              <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
                <p style="margin: 0; color: #991b1b; font-size: 18px; font-weight: bold;">
                  ⚠️ Expires in ${data.daysLeft || '3'} days
                </p>
                <p style="margin: 10px 0 0 0; color: #7f1d1d;">
                  Renew now to continue enjoying clean spaces without interruption!
                </p>
              </div>

              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #374151; margin-top: 0;">Don't Miss Out On:</h3>
                <ul style="color: #374151; line-height: 2; padding-left: 20px;">
                  <li>✨ Regular professional cleaning</li>
                  <li>💰 Locked-in pricing (prices may increase)</li>
                  <li>⭐ Your favorite maid assignment</li>
                  <li>🎁 Loyalty rewards and benefits</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.frontendUrl}/subscriptions/renew/${data.subscriptionId}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
                  Renew Subscription Now
                </a>
              </div>

              <p style="font-size: 14px; color: #6b7280; text-align: center;">
                Questions? Contact our support team anytime.
              </p>

              <p style="font-size: 16px; color: #374151; margin-top: 30px;">
                Best regards,<br>
                <strong>The SweepPro Team</strong>
              </p>
            </div>
          </div>
        `
      },

      PAYMENT_SUCCESS: {
        subject: 'Payment Received Successfully! ✅',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Payment Successful! ✅</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #374151;">Hi ${data.name},</p>
              <p style="font-size: 16px; color: #374151;">We've received your payment successfully!</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #10b981;">
                <h3 style="color: #10b981; margin-top: 0;">Payment Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280;">Amount Paid:</td>
                    <td style="padding: 10px 0; color: #374151; font-weight: bold; font-size: 20px;">₹${data.amount || '0'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280;">Transaction ID:</td>
                    <td style="padding: 10px 0; color: #374151;">${data.transactionId || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280;">Date:</td>
                    <td style="padding: 10px 0; color: #374151;">${new Date().toLocaleDateString()}</td>
                  </tr>
                </table>
              </div>

              <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #059669;">
                  📧 A receipt has been sent to your email. You can also download it from your dashboard.
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.frontendUrl}/payments/${data.paymentId}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  View Receipt
                </a>
              </div>

              <p style="font-size: 16px; color: #374151; margin-top: 20px;">
                Thank you for your payment!<br>
                <strong>The SweepPro Team</strong>
              </p>
            </div>
          </div>
        `
      }
    };

    return templates[type] || {
      subject: data.title || 'Notification from SweepPro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>${data.title || 'Notification'}</h2>
          <p>${data.message || ''}</p>
          <p>Best regards,<br><strong>The SweepPro Team</strong></p>
        </div>
      `
    };
  }
}

module.exports = new EmailService();
