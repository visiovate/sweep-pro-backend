/**
 * Firebase Admin SDK initializer.
 *
 * SECURITY NOTE – Firebase key exposure:
 * =========================================
 * The server-side Firebase Admin SDK credentials (private key, client email,
 * project ID) are stored exclusively in environment variables and are NEVER
 * committed to source control.
 *
 * If you are also embedding Firebase CLIENT config in the frontend (e.g.
 * apiKey, authDomain) you MUST restrict those keys in the Firebase Console:
 *
 *  1. Go to https://console.firebase.google.com → Project settings → General
 *     → Your apps → API key restrictions.
 *  2. Under "Application restrictions", add your authorised domains
 *     (e.g. sweepro.in, sweep-pro-frontend.vercel.app).
 *  3. Under "API restrictions → Restrict key", enable ONLY the APIs your
 *     app actually uses (Identity Toolkit API, Cloud Messaging, etc.).
 *  4. Disable any Firebase service you are not using (Cloud Functions,
 *     Realtime Database, etc.) in the Firebase Console to reduce the attack
 *     surface.
 *
 * Runtime domain check (optional):
 * If the server detects an unexpected HOST header it logs a warning.  This
 * does not block requests (responsibility lies with the Firebase Console
 * restrictions), but provides an audit trail.
 */

const admin = require('firebase-admin');
const logger = require('../utils/logger');

// Warn if the request originates from an unrecognised domain (development aid)
const KNOWN_DOMAINS = (
  process.env.ALLOWED_DOMAINS ||
  'localhost,sweepro.in,www.sweepro.in,sweep-pro-frontend.vercel.app'
).split(',').map(d => d.trim());

const warnIfUnknownDomain = (host) => {
  if (!host) return;
  const hostname = host.split(':')[0];
  if (!KNOWN_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
    logger.warn('Firebase: request from unrecognised domain – verify API key restrictions', { hostname });
  }
};

// Initialize Firebase Admin SDK
let firebaseAdmin;

const initializeFirebaseAdmin = () => {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  try {
    // Check if Firebase Admin is already initialized
    if (admin.apps.length > 0) {
      firebaseAdmin = admin.app();
      return firebaseAdmin;
    }

    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY_BASE64
      ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
      : process.env.FIREBASE_PRIVATE_KEY;

    // Get Firebase Admin configuration from environment variables
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: rawPrivateKey?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      universe_domain: 'googleapis.com'
    };

    // Validate required environment variables
    const requiredFields = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY_ID',
      // Accept either FIREBASE_PRIVATE_KEY or FIREBASE_PRIVATE_KEY_BASE64
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_CLIENT_ID'
    ];

    const missingFields = requiredFields.filter(field => !process.env[field]);

    if (!process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY_BASE64) {
      missingFields.push('FIREBASE_PRIVATE_KEY (or FIREBASE_PRIVATE_KEY_BASE64)');
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing Firebase Admin configuration: ${missingFields.join(', ')}. ` +
        'Please set the required environment variables in your .env file.'
      );
    }

    // Initialize Firebase Admin
    firebaseAdmin = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });

    logger.info('Firebase Admin SDK initialized successfully');
    return firebaseAdmin;
  } catch (error) {
    logger.error('Firebase Admin initialization error', { message: error.message });
    throw error;
  }
};

// Get Firebase Admin instance
const getFirebaseAdmin = () => {
  if (!firebaseAdmin) {
    return initializeFirebaseAdmin();
  }
  return firebaseAdmin;
};

// Get Firebase Auth instance
const getFirebaseAuth = () => {
  return getFirebaseAdmin().auth();
};

module.exports = {
  initializeFirebaseAdmin,
  getFirebaseAdmin,
  getFirebaseAuth,
  warnIfUnknownDomain
};


