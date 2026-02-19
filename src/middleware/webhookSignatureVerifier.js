/**
 * SECURITY: Razorpay Webhook Signature Verification Middleware
 *
 * CRITICAL: Razorpay signs the raw request body (as bytes), NOT the JSON stringified version.
 *
 * This middleware:
 * 1. Uses express.raw({ type: 'application/json' }) to preserve raw body
 * 2. Verifies HMAC-SHA256 signature using raw body bytes
 * 3. Rejects request if signature doesn't match
 * 4. Parses JSON body after signature verification
 *
 * MUST be applied BEFORE express.json() on the webhook route.
 */

const crypto = require('crypto');
const { getRazorpayWebhookSecret } = require('../config/validateEnv');

/**
 * Middleware that:
 * 1. Receives raw request body as Buffer
 * 2. Verifies Razorpay signature
 * 3. Parses JSON and attaches to req.body
 * 4. Rejects if signature is invalid
 */
function razorpayWebhookVerifier(req, res, next) {
  try {
    const webhookSecret = getRazorpayWebhookSecret();
    const webhookSignature = req.headers['x-razorpay-signature'];

    // Get raw body - Express.raw() middleware provides Buffer as req.body
    const rawBody = req.body;

    if (!webhookSignature) {
      console.error('❌ [WEBHOOK] Missing X-Razorpay-Signature header');
      return res.status(400).json({
        success: false,
        error: 'Missing webhook signature header'
      });
    }

    if (!Buffer.isBuffer(rawBody)) {
      console.error('❌ [WEBHOOK] Raw body is not a Buffer. Make sure express.raw() middleware is applied.');
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook format'
      });
    }

    // CRITICAL: Sign the raw body bytes exactly as Razorpay does
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)  // Use raw Buffer, NOT JSON.stringify()
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(webhookSignature),
      Buffer.from(expectedSignature)
    );

    if (!isSignatureValid) {
      console.error('❌ [WEBHOOK] Invalid webhook signature');
      console.error(`   Expected: ${expectedSignature.substring(0, 20)}...`);
      console.error(`   Received: ${webhookSignature.substring(0, 20)}...`);
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature - verification failed'
      });
    }

    console.log('✅ [WEBHOOK] Signature verified successfully');

    // Parse JSON body after verification succeeded
    try {
      req.body = JSON.parse(rawBody.toString('utf-8'));
      console.log(`✅ [WEBHOOK] Parsed webhook event: ${req.body.event || 'unknown'}`);
    } catch (parseError) {
      console.error('❌ [WEBHOOK] Failed to parse JSON body:', parseError.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON in webhook body'
      });
    }

    // Store raw body for future reference (if needed)
    req.rawBody = rawBody;

    // Proceed to next middleware/handler
    next();
  } catch (error) {
    console.error('❌ [WEBHOOK] Verification middleware error:', error.message);

    // Distinguish between configuration errors and verification failures
    if (error.message.includes('RAZORPAY_WEBHOOK_SECRET')) {
      return res.status(500).json({
        success: false,
        error: 'Webhook secret not configured - please contact support'
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Webhook verification failed'
    });
  }
}

module.exports = {
  razorpayWebhookVerifier
};
