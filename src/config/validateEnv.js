/**
 * SECURITY: Environment Variable Validation
 *
 * This module validates critical environment variables on server startup.
 * If validation fails, the application MUST crash immediately.
 *
 * NEVER use fallback/default values for security-critical variables like JWT_SECRET.
 */

const REQUIRED_ENV_VARS = [
  {
    key: 'JWT_SECRET',
    minLength: 32,
    description: 'JWT signing secret (min 32 characters for security)',
    isCritical: true
  },
  {
    key: 'DATABASE_URL',
    minLength: 20,
    description: 'PostgreSQL database connection string',
    isCritical: true
  },
  {
    key: 'RAZORPAY_WEBHOOK_SECRET',
    minLength: 20,
    description: 'Razorpay webhook signature verification secret',
    isCritical: true
  }
];

const RECOMMENDED_ENV_VARS = [
  {
    key: 'RAZORPAY_TEST_KEY_ID',
    description: 'Razorpay API key ID'
  },
  {
    key: 'RAZORPAY_TEST_KEY_SECRET',
    description: 'Razorpay API key secret'
  },
  {
    key: 'FIREBASE_PROJECT_ID',
    description: 'Firebase project ID'
  }
];

/**
 * Validate all critical environment variables
 * Throws error if validation fails - application will not start
 */
function validateEnvironmentVariables() {
  console.log('🔐 [SECURITY] Validating environment variables...\n');

  const errors = [];
  const warnings = [];

  // Validate critical variables
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.key];

    // Check if variable exists
    if (!value || value.trim() === '') {
      errors.push(
        `❌ CRITICAL: ${envVar.key} is not set\n` +
        `   Description: ${envVar.description}\n` +
        `   This is a REQUIRED environment variable and the application CANNOT start without it.`
      );
      continue;
    }

    // Check minimum length for sensitive variables
    if (envVar.minLength && value.length < envVar.minLength) {
      errors.push(
        `❌ CRITICAL: ${envVar.key} is too short\n` +
        `   Required minimum length: ${envVar.minLength} characters\n` +
        `   Actual length: ${value.length} characters\n` +
        `   Description: ${envVar.description}`
      );
    }

    // Check for default/placeholder values
    if (value.includes('your-') || value.includes('CHANGE_ME') || value.includes('replace-')) {
      errors.push(
        `❌ CRITICAL: ${envVar.key} appears to be a placeholder\n` +
        `   Value seems to be: "...${value.substring(0, 20)}..."\n` +
        `   Please set a proper value for this variable.`
      );
    }
  }

  // Warn about recommended variables
  for (const envVar of RECOMMENDED_ENV_VARS) {
    const value = process.env[envVar.key];
    if (!value || value.trim() === '') {
      warnings.push(
        `⚠️  WARNING: ${envVar.key} is not set\n` +
        `   Description: ${envVar.description}\n` +
        `   The application will continue, but some features may not work correctly.`
      );
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:\n');
    warnings.forEach((warning, index) => {
      console.log(`${index + 1}. ${warning}`);
    });
    console.log();
  }

  // If there are errors, crash the application
  if (errors.length > 0) {
    console.error('❌ ENVIRONMENT VALIDATION FAILED\n');
    console.error('The following critical environment variables are missing or invalid:\n');
    errors.forEach((error, index) => {
      console.error(`${index + 1}. ${error}`);
      console.error();
    });

    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'APPLICATION STARTUP HALTED FOR SECURITY REASONS\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '\n' +
      'Please set all required environment variables and restart the application.\n' +
      'Do NOT run production with incomplete environment configuration.\n'
    );

    process.exit(1);
  }

  console.log('✅ [SECURITY] All critical environment variables validated successfully\n');
}

/**
 * Get JWT secret - NEVER USE FALLBACK
 * This function ensures JWT_SECRET is always available and valid
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'CRITICAL SECURITY ERROR: JWT_SECRET is not properly configured. ' +
      'Application cannot proceed with JWT token operations.'
    );
  }

  return secret;
}

/**
 * Get Razorpay webhook secret - NEVER USE FALLBACK
 */
function getRazorpayWebhookSecret() {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      'CRITICAL SECURITY ERROR: RAZORPAY_WEBHOOK_SECRET is not configured. ' +
      'Webhook signature verification cannot be performed.'
    );
  }

  return secret;
}

module.exports = {
  validateEnvironmentVariables,
  getJwtSecret,
  getRazorpayWebhookSecret
};
