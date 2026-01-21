const { Resend } = require('resend');

class ResendEmailService {
  constructor() {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@sweepro.com';
    this.fromName = process.env.FROM_NAME || 'Sweepro';

    if (!apiKey) {
      this.enabled = false;
      this.client = null;
      return;
    }

    this.enabled = true;
    this.client = new Resend(apiKey);
  }

  async sendEmail({ to, subject, html, text }) {
    if (!this.enabled) {
      return { success: false, provider: 'disabled', reason: 'RESEND_API_KEY_missing' };
    }

    const from = this.fromName ? `${this.fromName} <${this.fromEmail}>` : this.fromEmail;

    try {
      const result = await this.client.emails.send({
        from,
        to,
        subject,
        html,
        text
      });

      const messageId = result?.data?.id;

      return { success: true, provider: 'resend', messageId };
    } catch (error) {
      return {
        success: false,
        provider: 'resend',
        error: error?.message || String(error)
      };
    }
  }
}

module.exports = new ResendEmailService();
