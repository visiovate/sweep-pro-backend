const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('security hardening invariants', () => {
  test('password and Firebase auth responses do not expose app JWTs in JSON bodies', () => {
    const authRoutes = read('routes/authRoutes.js');
    const firebaseAuthRoutes = read('routes/firebaseAuthRoutes.js');

    expect(authRoutes).not.toMatch(/token:\s*token/);
    expect(firebaseAuthRoutes).not.toMatch(/token:\s*appJwt/);
  });

  test('subscription admin routes require admin authorization', () => {
    const subscriptionRoutes = read('routes/subscriptionRoutes.js');
    const adminRouteLines = subscriptionRoutes
      .split(/\r?\n/)
      .filter((line) => line.includes("'/admin") || line.includes('"/admin'));

    expect(adminRouteLines.length).toBeGreaterThan(0);
    for (const line of adminRouteLines) {
      expect(line).toContain('authenticateToken');
      expect(line).toContain('authorizeAdmin');
    }
  });

  test('CORS diagnostic route is non-production only and does not echo request headers', () => {
    const index = read('index.js');
    expect(index).toContain("process.env.NODE_ENV !== 'production'");
    expect(index).not.toMatch(/headers:\s*req\.headers/);
  });

  test('uploaded files are not served anonymously', () => {
    const index = read('index.js');
    expect(index).toMatch(/app\.use\('\/uploads',\s*authenticateToken,\s*express\.static/);
  });

  test('email verification endpoints bypass CSRF like other token-based auth flows', () => {
    const csrf = read('middleware/csrf.js');
    expect(csrf).toContain("'/api/auth/verify-email'");
    expect(csrf).toContain("'/api/auth/resend-verification'");
  });
});