const admin = require('firebase-admin');

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

    console.log('✅ Firebase Admin SDK initialized successfully');
    return firebaseAdmin;
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
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
  getFirebaseAuth
};


