const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function bookingCreatedEmail({ customerName, serviceName, scheduledAt, bookingId }) {
  const subject = 'Booking confirmed ✅';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Booking confirmed</h2>
      <p>Hi ${customerName || 'there'},</p>
      <p>Your booking for <strong>${serviceName || 'service'}</strong> is confirmed.</p>
      <p><strong>Date:</strong> ${scheduledAt ? new Date(scheduledAt).toLocaleString() : 'TBD'}</p>
      <p><a href="${FRONTEND_URL}/bookings/${bookingId}">View booking</a></p>
    </div>
  `;
  return { subject, html, text: stripHtml(html) };
}

function maidAssignedEmail({ customerName, maidName, maidPhone, serviceName, scheduledAt, bookingId }) {
  const subject = 'Maid assigned 🧹';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Maid assigned</h2>
      <p>Hi ${customerName || 'there'},</p>
      <p>Your booking for <strong>${serviceName || 'service'}</strong> has a maid assigned.</p>
      <p><strong>Maid:</strong> ${maidName || 'TBD'}</p>
      ${maidPhone ? `<p><strong>Phone:</strong> ${maidPhone}</p>` : ''}
      <p><strong>Date:</strong> ${scheduledAt ? new Date(scheduledAt).toLocaleString() : 'TBD'}</p>
      <p><a href="${FRONTEND_URL}/bookings/${bookingId}">View booking</a></p>
    </div>
  `;
  return { subject, html, text: stripHtml(html) };
}

function paymentStatusEmail({ customerName, status, amount, paymentId }) {
  const subject = status === 'COMPLETED' ? 'Payment received ✅' : 'Payment update';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Payment update</h2>
      <p>Hi ${customerName || 'there'},</p>
      <p>Status: <strong>${status}</strong></p>
      ${amount !== undefined ? `<p>Amount: ₹${amount}</p>` : ''}
      ${paymentId ? `<p><a href="${FRONTEND_URL}/payments/${paymentId}">View payment</a></p>` : ''}
    </div>
  `;
  return { subject, html, text: stripHtml(html) };
}

function subscriptionActivatedEmail({ customerName, planName, subscriptionId }) {
  const subject = 'Subscription activated ✅';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Subscription activated</h2>
      <p>Hi ${customerName || 'there'},</p>
      <p>Your subscription <strong>${planName || ''}</strong> is now active.</p>
      ${subscriptionId ? `<p><a href="${FRONTEND_URL}/subscriptions">Manage subscription</a></p>` : ''}
    </div>
  `;
  return { subject, html, text: stripHtml(html) };
}

function subscriptionCancelledEmail({ customerName, planName }) {
  const subject = 'Subscription cancelled';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Subscription cancelled</h2>
      <p>Hi ${customerName || 'there'},</p>
      <p>Your subscription ${planName ? `<strong>${planName}</strong>` : ''} was cancelled.</p>
    </div>
  `;
  return { subject, html, text: stripHtml(html) };
}

function pricingAbandonedEmail({ customerName }) {
  const subject = 'Need help choosing a plan?';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Still deciding?</h2>
      <p>Hi ${customerName || 'there'},</p>
      <p>We noticed you checked our pricing but didn\'t subscribe. If you have questions, we\'re here to help.</p>
      <p><a href="${FRONTEND_URL}/#subscription-plans">View plans</a></p>
    </div>
  `;
  return { subject, html, text: stripHtml(html) };
}

module.exports = {
  bookingCreatedEmail,
  maidAssignedEmail,
  paymentStatusEmail,
  subscriptionActivatedEmail,
  subscriptionCancelledEmail,
  pricingAbandonedEmail
};
