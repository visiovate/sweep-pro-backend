/**
 * Sweep Pro — Client Handover E2E Test Runner
 * 
 * Comprehensive automated test that covers every workflow step:
 * Phase 0: Health check & connectivity
 * Phase 1: Authentication, Registration & Profile Onboarding
 * Phase 2: Service Selection & Booking Creation
 * Phase 3: Maid Assignment & Acceptance Lifecycle
 * Phase 4: Maid Service Execution & QR Code Generation
 * Phase 5: Customer QR Scanning & Booking Completion
 * Phase 6: Edge Cases, Feedback & Admin Audit
 * Phase 7: Teardown & Cleanup
 * 
 * Usage: node scripts/run-client-handover-e2e.js
 */

const http = require('http');
const https = require('https');

// ─── Configuration ────────────────────────────────────────────────────────
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

const TEST_CUSTOMER = {
  name: 'E2E Test Customer',
  email: 'e2e.test.customer@sweepro-test.com',
  phone: '9876500001',
  role: 'CUSTOMER',
  password: 'TestPass123!',
  confirmPassword: 'TestPass123!',
  address: '101 E2E Test Lane, Bangalore, Karnataka - 560001'
};

const TEST_MAID = {
  name: 'E2E Test Maid',
  email: 'e2e.test.maid@sweepro-test.com',
  phone: '9876500002',
  role: 'MAID',
  password: 'TestPass123!',
  confirmPassword: 'TestPass123!',
  address: '202 E2E Service Road, Bangalore, Karnataka - 560002',
  pincode: '560002'
};

const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'admin@sweepro.com',
  password: process.env.ADMIN_PASSWORD || 'admin123'
};

// ─── State ────────────────────────────────────────────────────────────────
let customerToken = null;
let maidToken = null;
let adminToken = null;
let customerId = null;
let maidId = null;
let maidProfileId = null;
let bookingId = null;
let serviceId = null;
let verificationCode = null;
let assignmentId = null;

const bugs = [];
let testNumber = 0;
let passed = 0;
let failed = 0;
let skipped = 0;

// ─── HTTP Helper ──────────────────────────────────────────────────────────
function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = { rawBody: data };
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Test Helpers ─────────────────────────────────────────────────────────
function reportBug(id, title, component, severity, steps, expected, observed, rootCause = 'TBD') {
  bugs.push({ id, title, component, severity, steps, expected, observed, rootCause });
}

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

async function runTest(name, testFn) {
  testNumber++;
  const label = `Test ${testNumber}: ${name}`;
  try {
    await testFn();
    passed++;
    log('✅', `${label} — PASSED`);
  } catch (err) {
    failed++;
    log('❌', `${label} — FAILED: ${err.message}`);
    return false;
  }
  return true;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 0: Health Check & Connectivity
// ═══════════════════════════════════════════════════════════════════════════
async function phase0() {
  log('🔵', '═══ PHASE 0: Health Check & Connectivity ═══');

  await runTest('Backend Health Check', async () => {
    const res = await makeRequest('GET', '/health');
    assert(res.status === 200 || res.status === 503, `Health check returned ${res.status}`);
    assert(res.body.status === 'ok' || res.body.status === 'degraded', `Health status: ${res.body.status}`);
    log('📋', `  Database: ${res.body.dependencies?.database || 'N/A'}, Redis: ${res.body.dependencies?.redis || 'N/A'}`);
    if (res.body.dependencies?.database === 'unhealthy') {
      reportBug('BUG-001', 'Database connection unhealthy', 'Backend/Database', 'HIGH',
        ['1. GET /health'], 'database: healthy', `database: ${res.body.dependencies.database}`,
        'Database connection or migration issue');
    }
    if (res.body.dependencies?.redis === 'unhealthy') {
      log('⚠️', '  Redis is unhealthy — some features (queues, caching) may not work');
    }
  });

  await runTest('CORS Configuration', async () => {
    const res = await makeRequest('GET', '/api/cors-test');
    assert(res.status === 200, `CORS test returned ${res.status}`);
    assert(res.body.success === true, 'CORS test failed');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: Authentication, Registration & Profile Onboarding
// ═══════════════════════════════════════════════════════════════════════════
async function phase1() {
  log('🔵', '═══ PHASE 1: Authentication, Registration & Profile Onboarding ═══');

  // --- 1.1: Customer Registration ---
  await runTest('1.1 — Customer Registration', async () => {
    const res = await makeRequest('POST', '/api/auth/register', TEST_CUSTOMER);
    log('📋', `  Status: ${res.status}, Message: ${res.body.message}`);
    if (res.status === 400 && res.body.message?.includes('already exists')) {
      log('⚠️', '  Customer already exists — will attempt login instead');
      skipped++;
    } else {
      assert(res.status === 201, `Registration returned ${res.status}: ${res.body.message}`);
      assert(res.body.success === true, `Registration failed: ${res.body.message}`);
      customerId = res.body.data?.user?.id;
      log('📋', `  Customer ID: ${customerId}`);
      log('📋', `  Email verification sent: ${res.body.data?.verificationEmailSent}`);
    }
  });

  // --- 1.1b: Customer Login (via direct DB setup for testing) ---
  await runTest('1.1b — Customer Login', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      email: TEST_CUSTOMER.email,
      password: TEST_CUSTOMER.password
    });
    log('📋', `  Status: ${res.status}, Message: ${res.body.message}`);
    if (res.status === 403 && res.body.code === 'EMAIL_NOT_VERIFIED') {
      log('⚠️', '  Email not verified — this is expected for new registrations');
      log('📋', '  BUG NOTE: E2E test accounts need email auto-verification for seamless testing');
      reportBug('BUG-002', 'Test accounts require email verification', 'Backend/Auth', 'MEDIUM',
        ['1. Register new test account', '2. Attempt login'],
        'Login succeeds for test accounts',
        'Login blocked with EMAIL_NOT_VERIFIED — no way to programmatically verify without email access',
        'Registration sets status=PENDING_VERIFICATION and emailVerifiedAt=null. Need to either auto-verify test accounts or provide a test OTP bypass.');
    } else if (res.status === 200) {
      assert(res.body.success === true, `Login failed: ${res.body.message}`);
      customerToken = res.body.data?.token;
      customerId = res.body.data?.user?.id;
      assert(customerToken, 'No token returned');
      log('📋', `  Customer Token: ${customerToken?.substring(0, 20)}...`);
      log('📋', `  Customer Role: ${res.body.data?.user?.role}`);
    } else {
      assert(false, `Login returned unexpected ${res.status}: ${res.body.message}`);
    }
  });

  // --- 1.2: Maid Registration ---
  await runTest('1.2 — Maid Registration', async () => {
    const res = await makeRequest('POST', '/api/auth/register', TEST_MAID);
    log('📋', `  Status: ${res.status}, Message: ${res.body.message}`);
    if (res.status === 400 && res.body.message?.includes('already exists')) {
      log('⚠️', '  Maid already exists — will attempt login instead');
      skipped++;
    } else {
      assert(res.status === 201, `Registration returned ${res.status}: ${res.body.message}`);
      assert(res.body.success === true, `Registration failed: ${res.body.message}`);
      maidId = res.body.data?.user?.id;
      log('📋', `  Maid ID: ${maidId}`);
    }
  });

  // --- 1.2b: Maid Login ---
  await runTest('1.2b — Maid Login', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      email: TEST_MAID.email,
      password: TEST_MAID.password
    });
    log('📋', `  Status: ${res.status}, Message: ${res.body.message}`);
    if (res.status === 403 && res.body.code === 'EMAIL_NOT_VERIFIED') {
      log('⚠️', '  Email not verified — same issue as customer');
    } else if (res.status === 200) {
      maidToken = res.body.data?.token;
      maidId = res.body.data?.user?.id;
      assert(maidToken, 'No token returned');
      log('📋', `  Maid Token: ${maidToken?.substring(0, 20)}...`);
    } else {
      log('⚠️', `  Maid login returned ${res.status}: ${res.body.message}`);
    }
  });

  // --- 1.3: Admin Login ---
  await runTest('1.3 — Admin Login', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password
    });
    log('📋', `  Status: ${res.status}, Message: ${res.body.message}`);
    if (res.status === 200) {
      assert(res.body.success === true, `Admin login failed: ${res.body.message}`);
      adminToken = res.body.data?.token;
      assert(adminToken, 'No admin token returned');
      assert(res.body.data?.user?.role === 'ADMIN', `Expected ADMIN role, got ${res.body.data?.user?.role}`);
      log('📋', `  Admin Token: ${adminToken?.substring(0, 20)}...`);
    } else {
      reportBug('BUG-003', 'Admin login fails', 'Backend/Auth', 'HIGH',
        [`1. POST /api/auth/login with admin credentials`],
        'Login succeeds with admin token',
        `Status ${res.status}: ${res.body.message}`,
        'Admin user may not be seeded or email may not be verified');
      log('⚠️', '  Admin login failed — many subsequent tests will be skipped');
    }
  });

  // --- 1.4: Verify /auth/me endpoints ---
  if (customerToken) {
    await runTest('1.4a — Customer /auth/me', async () => {
      const res = await makeRequest('GET', '/api/auth/me', null, customerToken);
      assert(res.status === 200, `GET /auth/me returned ${res.status}`);
      assert(res.body.success === true, `/auth/me failed`);
      assert(res.body.data?.role === 'CUSTOMER', `Expected CUSTOMER, got ${res.body.data?.role}`);
      log('📋', `  Profile completed: ${res.body.data?.profile_completed}`);
    });
  }

  if (adminToken) {
    await runTest('1.4b — Admin /auth/me', async () => {
      const res = await makeRequest('GET', '/api/auth/me', null, adminToken);
      assert(res.status === 200, `GET /auth/me returned ${res.status}`);
      assert(res.body.data?.role === 'ADMIN', `Expected ADMIN, got ${res.body.data?.role}`);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1.5: Setup — Use existing seed data if test accounts can't log in
// ═══════════════════════════════════════════════════════════════════════════
async function phase1_5_fallback() {
  log('🔵', '═══ PHASE 1.5: Fallback — Try Seed Account Login ═══');

  if (!customerToken) {
    await runTest('1.5a — Fallback: Seed Customer Login', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'customer@sweepro.com',
        password: 'customer123'
      });
      if (res.status === 200 && res.body.success) {
        customerToken = res.body.data?.token;
        customerId = res.body.data?.user?.id;
        log('📋', `  Using seed customer: ${res.body.data?.user?.name} (${customerId})`);
      } else {
        log('⚠️', `  Seed customer login failed: ${res.status} — ${res.body.message}`);
        reportBug('BUG-004', 'Neither test nor seed customer can log in', 'Backend/Auth', 'HIGH',
          ['1. Register test customer', '2. Login test customer', '3. Login seed customer'],
          'At least one customer login succeeds',
          `All customer logins failed. Last: ${res.status} ${res.body.message}`,
          'Email verification blocking or seed data missing');
      }
    });
  }

  if (!maidToken) {
    await runTest('1.5b — Fallback: Seed Maid Login', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'maid@sweepro.com',
        password: 'maid123'
      });
      if (res.status === 200 && res.body.success) {
        maidToken = res.body.data?.token;
        maidId = res.body.data?.user?.id;
        log('📋', `  Using seed maid: ${res.body.data?.user?.name} (${maidId})`);
      } else {
        log('⚠️', `  Seed maid login failed: ${res.status} — ${res.body.message}`);
        reportBug('BUG-005', 'Neither test nor seed maid can log in', 'Backend/Auth', 'HIGH',
          ['1. Register test maid', '2. Login test maid', '3. Login seed maid'],
          'At least one maid login succeeds',
          `All maid logins failed. Last: ${res.status} ${res.body.message}`,
          'Email verification blocking or seed data missing');
      }
    });
  }

  if (!adminToken) {
    log('⚠️', '  No admin token — cannot proceed with admin-dependent tests');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: Service Selection & Booking Creation
// ═══════════════════════════════════════════════════════════════════════════
async function phase2() {
  log('🔵', '═══ PHASE 2: Service Selection & Booking Creation ═══');

  if (!customerToken) {
    log('⏭️', '  SKIPPING Phase 2 — no customer token');
    skipped += 3;
    return;
  }

  // --- 2.1: Get available services ---
  await runTest('2.1 — Get Available Services', async () => {
    const res = await makeRequest('GET', '/api/services', null, customerToken);
    log('📋', `  Status: ${res.status}`);
    if (res.status === 200) {
      const services = Array.isArray(res.body) ? res.body : (res.body.data || []);
      log('📋', `  Found ${services.length} services`);
      if (services.length > 0) {
        serviceId = services[0].id;
        log('📋', `  Using service: ${services[0].name} (${serviceId}), Price: ₹${services[0].basePrice}`);
      } else {
        reportBug('BUG-006', 'No services found in database', 'Backend/Services', 'HIGH',
          ['1. GET /api/services'], 'At least 1 service exists', 'Empty array returned',
          'Seed data may not have created services');
      }
    } else {
      assert(false, `GET /api/services returned ${res.status}`);
    }
  });

  // --- 2.2: Check available time slots ---
  await runTest('2.2 — Check Available Time Slots', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await makeRequest('GET', `/api/bookings/available-slots?date=${tomorrow}`, null, customerToken);
    log('📋', `  Status: ${res.status}`);
    if (res.status === 200) {
      log('📋', `  Response: ${JSON.stringify(res.body).substring(0, 200)}`);
    } else {
      log('⚠️', `  Available slots endpoint returned ${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`);
    }
  });

  // --- 2.3: Create Booking ---
  await runTest('2.3 — Create Booking', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const bookingData = {
      scheduledDate: tomorrow,
      timeSlot: '09:00-12:00',
      specialInstructions: 'E2E Test Booking — Please ignore'
    };

    const res = await makeRequest('POST', '/api/bookings', bookingData, customerToken);
    log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);

    if (res.status === 402 && res.body.code === 'PAYMENT_PENDING') {
      reportBug('BUG-007', 'Booking blocked by PENDING_PAYMENT subscription', 'Backend/Bookings', 'MEDIUM',
        ['1. POST /api/bookings with valid data'],
        'Booking created successfully',
        `402: ${res.body.message}`,
        'Customer subscription is in PENDING_PAYMENT state; need to complete payment first or activate subscription');
    } else if (res.status === 402 || res.status === 403) {
      log('⚠️', `  Booking blocked: ${res.body.message}`);
      reportBug('BUG-008', 'Booking creation blocked — no active subscription', 'Backend/Bookings', 'MEDIUM',
        ['1. Customer attempts to create booking without active subscription'],
        'Booking created (or clear subscription flow)',
        `${res.status}: ${res.body.message}`,
        'Customer does not have an active subscription. The validateActiveSubscription middleware blocks booking creation.');
    } else if (res.status === 201 || res.status === 200) {
      assert(res.body.success === true || res.body.data, `Booking creation failed: ${res.body.message}`);
      bookingId = res.body.data?.id || res.body.data?.booking?.id;
      log('📋', `  Booking ID: ${bookingId}`);
      log('📋', `  Booking Status: ${res.body.data?.status || res.body.data?.booking?.status}`);
    } else {
      log('⚠️', `  Unexpected: ${res.status} — ${JSON.stringify(res.body).substring(0, 300)}`);
      reportBug('BUG-009', `Booking creation returned ${res.status}`, 'Backend/Bookings', 'HIGH',
        [`1. POST /api/bookings with: ${JSON.stringify(bookingData)}`],
        'Booking created with 200/201',
        `${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`,
        'TBD');
    }
  });

  // --- 2.4: Role Security Guard ---
  if (maidToken) {
    await runTest('2.4 — Role Guard: Maid Cannot Create Booking', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const res = await makeRequest('POST', '/api/bookings', {
        scheduledDate: tomorrow,
        timeSlot: '14:00-17:00'
      }, maidToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 403) {
        log('📋', '  ✅ Role guard correctly prevents maid from creating booking');
      } else if (res.status === 402) {
        log('⚠️', `  Got 402 (subscription check) instead of 403 (role check) — role guard may be bypassed`);
        reportBug('BUG-010', 'Maid booking blocked by subscription check instead of role check', 'Backend/Security', 'MEDIUM',
          ['1. POST /api/bookings using maid JWT'],
          'HTTP 403 Forbidden (role guard)',
          `HTTP ${res.status}: ${res.body.message}`,
          'The subscriptionValidation middleware runs before checkRole, so it returns 402/403 for subscription instead of the role-based 403. Order of middleware matters.');
      } else {
        reportBug('BUG-011', 'Maid can create bookings', 'Backend/Security', 'HIGH',
          ['1. POST /api/bookings using maid JWT'],
          'HTTP 403 Forbidden',
          `HTTP ${res.status}`,
          'Missing or misconfigured role guard');
      }
    });
  }

  // --- 2.5: Get customer's bookings ---
  await runTest('2.5 — Get Customer Bookings', async () => {
    const res = await makeRequest('GET', '/api/bookings/my-bookings', null, customerToken);
    log('📋', `  Status: ${res.status}`);
    if (res.status === 200) {
      const bookings = Array.isArray(res.body) ? res.body : (res.body.data || []);
      log('📋', `  Total customer bookings: ${bookings.length}`);
      // If we didn't create one but there are existing ones, use the first suitable one
      if (!bookingId && bookings.length > 0) {
        const pending = bookings.find(b => ['PENDING', 'CONFIRMED'].includes(b.status));
        if (pending) {
          bookingId = pending.id;
          log('📋', `  Using existing booking: ${bookingId} (status: ${pending.status})`);
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: Maid Assignment & Acceptance
// ═══════════════════════════════════════════════════════════════════════════
async function phase3() {
  log('🔵', '═══ PHASE 3: Maid Assignment & Acceptance ═══');

  if (!adminToken || !bookingId) {
    log('⏭️', `  SKIPPING Phase 3 — adminToken: ${!!adminToken}, bookingId: ${bookingId}`);
    skipped += 3;
    return;
  }

  // --- 3.1: Admin assigns maid to booking ---
  await runTest('3.1 — Admin Assigns Maid to Booking', async () => {
    const res = await makeRequest('PUT', `/api/bookings/${bookingId}/assign`, {
      maidId: maidId
    }, adminToken);
    log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);
    if (res.status === 200) {
      log('📋', `  Assignment status: ${res.body.data?.assignmentStatus || 'N/A'}`);
    } else {
      log('⚠️', `  Assignment failed: ${res.body.message}`);
      reportBug('BUG-012', `Maid assignment failed (${res.status})`, 'Backend/Assignments', 'HIGH',
        [`1. PUT /api/bookings/${bookingId}/assign with maidId=${maidId}`],
        'Maid assigned successfully',
        `${res.status}: ${res.body.message}`,
        'TBD');
    }
  });

  // --- 3.2: Maid checks assigned bookings ---
  if (maidToken) {
    await runTest('3.2 — Maid Gets Assigned Bookings', async () => {
      const res = await makeRequest('GET', '/api/booking-completion/maid/assigned', null, maidToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const count = res.body.count || (res.body.data?.length || 0);
        log('📋', `  Assigned bookings: ${count}`);
        if (count === 0) {
          log('⚠️', '  No assigned bookings found for maid — assignment may have different status');
        }
      } else {
        reportBug('BUG-013', 'Maid cannot retrieve assigned bookings', 'Backend/BookingCompletion', 'HIGH',
          ['1. GET /api/booking-completion/maid/assigned with maid JWT'],
          'Returns list of assigned bookings',
          `${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`,
          'TBD');
      }
    });

    // --- 3.3: Maid checks assignments via assignments endpoint ---
    await runTest('3.3 — Maid Gets Pending Assignments', async () => {
      const res = await makeRequest('GET', '/api/assignments/pending', null, maidToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const assignments = Array.isArray(res.body) ? res.body : (res.body.data || []);
        log('📋', `  Pending assignments: ${assignments.length}`);
        if (assignments.length > 0) {
          assignmentId = assignments[0].id;
          log('📋', `  Assignment ID for acceptance: ${assignmentId}`);
        }
      }
    });

    // --- 3.4: Maid accepts assignment ---
    if (assignmentId) {
      await runTest('3.4 — Maid Accepts Assignment', async () => {
        const res = await makeRequest('POST', `/api/assignments/${assignmentId}/accept`, {}, maidToken);
        log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);
        if (res.status === 200) {
          log('📋', '  ✅ Assignment accepted');
        } else {
          reportBug('BUG-014', 'Maid cannot accept assignment', 'Backend/Assignments', 'HIGH',
            [`1. POST /api/assignments/${assignmentId}/accept`],
            'Assignment accepted, booking status updated',
            `${res.status}: ${res.body.message}`,
            'TBD');
        }
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Maid Service Execution & QR Code
// ═══════════════════════════════════════════════════════════════════════════
async function phase4() {
  log('🔵', '═══ PHASE 4: Maid Service Execution & QR Code ═══');

  if (!maidToken || !bookingId) {
    log('⏭️', `  SKIPPING Phase 4 — maidToken: ${!!maidToken}, bookingId: ${bookingId}`);
    skipped += 3;
    return;
  }

  // --- 4.1: Maid starts service ---
  await runTest('4.1 — Maid Starts Service', async () => {
    const res = await makeRequest('POST', `/api/booking-completion/${bookingId}/start`, {}, maidToken);
    log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);
    if (res.status === 200) {
      log('📋', `  Booking status: ${res.body.data?.status}`);
      log('📋', `  Start time: ${res.body.data?.actualStartTime}`);
    } else {
      log('⚠️', `  Start service failed: ${res.body.message}`);
      reportBug('BUG-015', 'Maid cannot start service', 'Backend/BookingCompletion', 'HIGH',
        [`1. POST /api/booking-completion/${bookingId}/start`],
        'Booking transitions to IN_PROGRESS',
        `${res.status}: ${res.body.message}`,
        'TBD');
    }
  });

  // --- 4.2: Maid gets verification QR code ---
  await runTest('4.2 — Maid Gets Verification Code / QR', async () => {
    const res = await makeRequest('GET', '/api/booking-completion/maid/qr-code', null, maidToken);
    log('📋', `  Status: ${res.status}`);
    if (res.status === 200) {
      verificationCode = res.body.data?.verificationCode;
      log('📋', `  Verification Code: ${verificationCode}`);
      log('📋', `  Maid Name: ${res.body.data?.maidName}`);
      log('📋', `  Profile ID: ${res.body.data?.maidProfileId}`);
      maidProfileId = res.body.data?.maidProfileId;
      if (!verificationCode) {
        reportBug('BUG-016', 'Maid verification code is null', 'Backend/BookingCompletion', 'HIGH',
          ['1. GET /api/booking-completion/maid/qr-code'],
          'Returns verificationCode like ABCDE12345',
          `verificationCode is ${verificationCode}`,
          'Maid profile may not have a verificationCode generated. The code is generated during maid verification or via admin endpoint.');
      }
    } else {
      reportBug('BUG-017', 'Maid QR code endpoint fails', 'Backend/BookingCompletion', 'MEDIUM',
        ['1. GET /api/booking-completion/maid/qr-code'],
        'Returns verification code data',
        `${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`,
        'TBD');
    }
  });

  // --- 4.3: Also test the booking-specific QR code ---
  await runTest('4.3 — Maid Gets Booking-Specific QR Code', async () => {
    const res = await makeRequest('GET', `/api/booking-completion/${bookingId}/qr-code`, null, maidToken);
    log('📋', `  Status: ${res.status}`);
    if (res.status === 200) {
      log('📋', `  QR Data: ${res.body.data?.qrCodeData?.substring(0, 100)}...`);
    } else {
      log('⚠️', `  Booking QR code: ${res.status} — ${res.body.message || 'N/A'}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: Customer QR Scanning & Booking Completion
// ═══════════════════════════════════════════════════════════════════════════
async function phase5() {
  log('🔵', '═══ PHASE 5: Customer QR Scanning & Booking Completion ═══');

  if (!customerToken || !bookingId) {
    log('⏭️', `  SKIPPING Phase 5 — customerToken: ${!!customerToken}, bookingId: ${bookingId}`);
    skipped += 3;
    return;
  }

  // --- 5.1: Negative test — invalid verification code ---
  await runTest('5.1 — Negative: Invalid Verification Code', async () => {
    const res = await makeRequest('POST', `/api/bookings/${bookingId}/complete-with-qr`, {
      verificationCode: 'WRONGCODE1',
      completionNotes: 'E2E negative test'
    }, customerToken);
    log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);
    if (res.status === 400) {
      log('📋', '  ✅ Correctly rejected invalid verification code');
    } else if (res.status === 404) {
      log('⚠️', '  404 — Booking not found or not in completable state');
    } else {
      reportBug('BUG-018', 'Invalid verification code not rejected properly', 'Backend/Security', 'HIGH',
        [`1. POST /api/bookings/${bookingId}/complete-with-qr with code WRONGCODE1`],
        'HTTP 400 with code mismatch error',
        `HTTP ${res.status}: ${res.body.message}`,
        'TBD');
    }
  });

  // --- 5.2: Positive test — correct verification code ---
  if (verificationCode) {
    await runTest('5.2 — Positive: Correct Verification Code → COMPLETED', async () => {
      const res = await makeRequest('POST', `/api/bookings/${bookingId}/complete-with-qr`, {
        verificationCode: verificationCode,
        completionNotes: 'E2E test — service completed successfully'
      }, customerToken);
      log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);
      if (res.status === 200) {
        assert(res.body.success === true, `Completion failed: ${res.body.message}`);
        log('📋', `  Booking Status: ${res.body.data?.status}`);
        log('📋', `  Completed At: ${res.body.data?.completedAt}`);
        log('📋', `  QR Verified: ${res.body.data?.qrVerified}`);
      } else {
        reportBug('BUG-019', 'Booking completion with valid code fails', 'Backend/BookingCompletion', 'HIGH',
          [`1. POST /api/bookings/${bookingId}/complete-with-qr with correct code`],
          'Booking marked COMPLETED with timestamps',
          `${res.status}: ${res.body.message}`,
          'TBD');
      }
    });
  } else {
    log('⏭️', '  SKIPPING 5.2 — no verification code available');
    skipped++;
  }

  // --- 5.3: Also test the customer-booking-completion route ---
  // NOTE: This route is mounted differently: /api/customer-booking-completion/:bookingId/complete
  // We've already tested via /api/bookings/:bookingId/complete-with-qr above
  // Let's verify the alternate route exists
  await runTest('5.3 — Customer Booking Completion (Customer Bookings View)', async () => {
    const res = await makeRequest('GET', '/api/booking-completion/customer/bookings', null, customerToken);
    log('📋', `  Status: ${res.status}`);
    if (res.status === 200) {
      const count = res.body.count || (res.body.data?.length || 0);
      log('📋', `  Total bookings visible: ${count}`);
      const completed = (res.body.data || []).filter(b => b.status === 'COMPLETED');
      log('📋', `  Completed bookings: ${completed.length}`);
    } else {
      log('⚠️', `  Customer bookings view: ${res.status}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: Feedback, Edge Cases & Admin Audit
// ═══════════════════════════════════════════════════════════════════════════
async function phase6() {
  log('🔵', '═══ PHASE 6: Feedback, Edge Cases & Admin Audit ═══');

  // --- 6.1: Customer submits feedback ---
  if (customerToken && bookingId) {
    await runTest('6.1 — Customer Submits Feedback', async () => {
      const res = await makeRequest('POST', '/api/feedback', {
        bookingId: bookingId,
        overallRating: 5,
        qualityRating: 5,
        punctualityRating: 4,
        behaviorRating: 5,
        comment: 'Excellent E2E test service!',
        wouldRecommend: true
      }, customerToken);
      log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);
      if (res.status === 201 || res.status === 200) {
        log('📋', '  ✅ Feedback submitted successfully');
      } else if (res.status === 400 && res.body.message?.includes('already')) {
        log('📋', '  Feedback already exists for this booking — OK');
      } else {
        log('⚠️', `  Feedback submission: ${res.body.message}`);
      }
    });

    // --- 6.2: Get eligible bookings for feedback ---
    await runTest('6.2 — Get Eligible Bookings for Feedback', async () => {
      const res = await makeRequest('GET', '/api/feedback/eligible-bookings', null, customerToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const bookings = Array.isArray(res.body) ? res.body : (res.body.data || []);
        log('📋', `  Eligible for feedback: ${bookings.length} bookings`);
      }
    });
  }

  // --- 6.3: Admin audit endpoints ---
  if (adminToken) {
    await runTest('6.3a — Admin Stats Dashboard', async () => {
      const res = await makeRequest('GET', '/api/admin/stats', null, adminToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        log('📋', `  Stats: ${JSON.stringify(res.body.data || res.body).substring(0, 300)}`);
      } else {
        reportBug('BUG-020', 'Admin stats endpoint fails', 'Backend/Admin', 'MEDIUM',
          ['1. GET /api/admin/stats with admin JWT'],
          'Returns dashboard stats',
          `${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`,
          'TBD');
      }
    });

    await runTest('6.3b — Admin Gets All Bookings', async () => {
      const res = await makeRequest('GET', '/api/bookings', null, adminToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const bookings = Array.isArray(res.body) ? res.body : (res.body.data || []);
        log('📋', `  Total bookings in system: ${bookings.length}`);
      }
    });

    await runTest('6.3c — Admin Gets All Maids', async () => {
      const res = await makeRequest('GET', '/api/maids', null, adminToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const maids = Array.isArray(res.body) ? res.body : (res.body.data || []);
        log('📋', `  Total maids: ${maids.length}`);
        // Check verification codes
        const withCode = maids.filter(m => m.maidProfile?.verificationCode || m.verificationCode);
        log('📋', `  Maids with verification codes: ${withCode.length}`);
      }
    });

    await runTest('6.3d — Admin Customer Assignments', async () => {
      const res = await makeRequest('GET', '/api/admin/customer-assignments', null, adminToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const assignments = Array.isArray(res.body) ? res.body : (res.body.data || []);
        log('📋', `  Customer-maid assignments: ${assignments.length}`);
      }
    });

    await runTest('6.3e — Admin Feedback Stats', async () => {
      const res = await makeRequest('GET', '/api/feedback/stats', null, adminToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        log('📋', `  Feedback stats: ${JSON.stringify(res.body.data || res.body).substring(0, 300)}`);
      }
    });
  }

  // --- 6.4: Maid-side tests ---
  if (maidToken) {
    await runTest('6.4a — Maid Profile Data', async () => {
      const res = await makeRequest('GET', '/api/profile/me', null, maidToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const profile = res.body.data || res.body;
        log('📋', `  Verified: ${profile.maidProfile?.isVerified || 'N/A'}`);
        log('📋', `  Verification Code: ${profile.maidProfile?.verificationCode || 'NULL'}`);
        log('📋', `  Completed Bookings: ${profile.maidProfile?.completedBookings || 0}`);
        log('📋', `  Rating: ${profile.maidProfile?.rating || 0}`);
        if (!profile.maidProfile?.verificationCode) {
          reportBug('BUG-021', 'Maid missing verification code', 'Backend/MaidProfile', 'HIGH',
            ['1. GET /api/profile/me for maid'],
            'verificationCode exists (e.g., ABCDE12345)',
            'verificationCode is null',
            'Code is generated during admin verification or via POST /api/booking-completion/admin/generate-maid-codes');
        }
      }
    });

    await runTest('6.4b — Maid Reviews', async () => {
      const res = await makeRequest('GET', '/api/feedback/maid-reviews', null, maidToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const reviews = Array.isArray(res.body) ? res.body : (res.body.data || []);
        log('📋', `  Total maid reviews: ${reviews.length}`);
      }
    });
  }

  // --- 6.5: Notification endpoints ---
  if (customerToken) {
    await runTest('6.5 — Customer Notifications', async () => {
      const res = await makeRequest('GET', '/api/notifications', null, customerToken);
      log('📋', `  Status: ${res.status}`);
      if (res.status === 200) {
        const notifications = Array.isArray(res.body) ? res.body : (res.body.data || []);
        log('📋', `  Total notifications: ${notifications.length}`);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: Teardown & Cleanup
// ═══════════════════════════════════════════════════════════════════════════
async function phase7() {
  log('🔵', '═══ PHASE 7: Teardown & Cleanup ═══');

  await runTest('7.1 — Cleanup Test Users', async () => {
    const res = await makeRequest('DELETE', '/api/test/cleanup-test-users');
    log('📋', `  Status: ${res.status}, Message: ${res.body.message || 'N/A'}`);
    if (res.status === 200) {
      log('📋', `  Deleted: ${res.body.deletedCount || 0} test users`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN — Run all phases
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  SWEEP PRO — CLIENT HANDOVER E2E TEST SUITE                ║');
  console.log('║  Target: ' + BASE_URL.padEnd(51) + '║');
  console.log('║  Time: ' + new Date().toISOString().padEnd(53) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    await phase0();
    console.log('');
    await phase1();
    await phase1_5_fallback();
    console.log('');
    await phase2();
    console.log('');
    await phase3();
    console.log('');
    await phase4();
    console.log('');
    await phase5();
    console.log('');
    await phase6();
    console.log('');
    await phase7();
  } catch (err) {
    log('💥', `FATAL ERROR: ${err.message}`);
    console.error(err);
  }

  // ─── Final Report ─────────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  E2E TEST RESULTS SUMMARY                                  ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Tests: ${String(testNumber).padEnd(46)}║`);
  console.log(`║  ✅ Passed:   ${String(passed).padEnd(46)}║`);
  console.log(`║  ❌ Failed:   ${String(failed).padEnd(46)}║`);
  console.log(`║  ⏭️  Skipped:  ${String(skipped).padEnd(46)}║`);
  console.log(`║  🐛 Bugs:     ${String(bugs.length).padEnd(46)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (bugs.length > 0) {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  BUG REPORT                                                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    bugs.forEach((bug, i) => {
      console.log(`\n  ┌── ${bug.id}: ${bug.title}`);
      console.log(`  │ Component: ${bug.component}`);
      console.log(`  │ Severity:  ${bug.severity}`);
      console.log(`  │ Steps:     ${bug.steps.join(' → ')}`);
      console.log(`  │ Expected:  ${bug.expected}`);
      console.log(`  │ Observed:  ${bug.observed}`);
      console.log(`  │ Root Cause: ${bug.rootCause}`);
      console.log(`  └──`);
    });
  }

  // Return exit code
  process.exit(failed > 0 ? 1 : 0);
}

main();
