const crypto = require('crypto');

class TestUtils {
  
  /**
   * Generate test signature for Razorpay payment verification
   * Use this in Postman or testing environments
   */
  static generateTestSignature(orderId, paymentId, secret) {
    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');
    return expectedSignature;
  }

  /**
   * Generate test webhook signature
   */
  static generateWebhookSignature(body, secret) {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return signature;
  }

  /**
   * Create mock Razorpay order response
   */
  static createMockOrder(amount, currency = 'INR') {
    return {
      id: `order_test_${Date.now()}`,
      entity: 'order',
      amount: amount * 100, // Convert to paise
      amount_paid: 0,
      amount_due: amount * 100,
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      status: 'created',
      attempts: 0,
      created_at: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Create mock Razorpay payment response
   */
  static createMockPayment(orderId, amount, method = 'card') {
    return {
      id: `pay_test_${Date.now()}`,
      entity: 'payment',
      amount: amount * 100,
      currency: 'INR',
      status: 'captured',
      order_id: orderId,
      method: method,
      captured: true,
      created_at: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Create test environment setup script for Postman
   */
  static getPostmanPreRequestScript() {
    return `
// Pre-request script for Postman
// This generates a valid signature for testing

const orderId = pm.environment.get('razorpay_order_id');
const paymentId = 'pay_test_' + Math.random().toString(36).substring(7);
const secret = pm.environment.get('RAZORPAY_TEST_KEY_SECRET');

if (orderId && secret) {
    const CryptoJS = require('crypto-js');
    const body = orderId + "|" + paymentId;
    const signature = CryptoJS.HmacSHA256(body, secret).toString();
    
    pm.environment.set('test_payment_id', paymentId);
    pm.environment.set('test_signature', signature);
}
    `;
  }

  /**
   * Validate test environment variables
   */
  static validateTestEnvironment() {
    const requiredEnvVars = [
      'RAZORPAY_TEST_KEY_ID',
      'RAZORPAY_TEST_KEY_SECRET',
      'JWT_SECRET',
      'DATABASE_URL'
    ];

    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return true;
  }

  /**
   * Create test booking data
   */
  static createTestBookingData(serviceId) {
    return {
      serviceId: serviceId,
      scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
      scheduledTime: '10:00',
      address: '123 Test Street, Test City, Test State 12345',
      notes: 'Test booking for Razorpay payment integration'
    };
  }

  /**
   * Create test service data
   */
  static createTestServiceData() {
    return {
      name: 'Test Cleaning Service',
      description: 'Basic cleaning service for testing',
      category: 'CLEANING',
      baseDuration: 120, // 2 hours
      basePrice: 500, // ₹500
      isActive: true
    };
  }
}

module.exports = TestUtils;
