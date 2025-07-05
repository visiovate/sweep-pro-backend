const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const app = require('../index');

const prisma = new PrismaClient();

// Store test data for cleanup
let testData = {
  admin: null,
  customer: null,
  adminToken: null,
  customerToken: null,
  testUserId: null
};

// Increase timeout for all tests
jest.setTimeout(30000);

describe('User Routes', () => {
  beforeAll(async () => {
    try {
      // Clean up any existing test data
      await prisma.adminProfile.deleteMany({
        where: {
          user: {
            email: {
              in: ['testadmin@test.com', 'testcustomer@test.com']
            }
          }
        }
      });
      await prisma.customerProfile.deleteMany({
        where: {
          user: {
            email: {
              in: ['testadmin@test.com', 'testcustomer@test.com']
            }
          }
        }
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: ['testadmin@test.com', 'testcustomer@test.com']
          }
        }
      });

      // Create test admin user
      testData.admin = await prisma.user.create({
        data: {
          email: 'testadmin@test.com',
          password: 'Test123!',
          name: 'Test Admin',
          phone: '1234567890',
          role: 'ADMIN',
          adminProfile: {
            create: {
              permissions: {
                canManageUsers: true,
                canManageServices: true,
                canManageBookings: true,
                canManagePayments: true
              }
            }
          }
        }
      });

      testData.adminToken = jwt.sign({ id: testData.admin.id }, process.env.JWT_SECRET || 'test-secret');

      // Create test customer user
      testData.customer = await prisma.user.create({
        data: {
          email: 'testcustomer@test.com',
          password: 'Test123!',
          name: 'Test Customer',
          phone: '0987654321',
          role: 'CUSTOMER',
          customerProfile: {
            create: {
              preferences: {}
            }
          }
        }
      });

      testData.customerToken = jwt.sign({ id: testData.customer.id }, process.env.JWT_SECRET || 'test-secret');
      testData.testUserId = testData.customer.id;
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      // Clean up test data in correct order
      await prisma.adminProfile.deleteMany({
        where: {
          user: {
            email: {
              in: ['testadmin@test.com', 'testcustomer@test.com']
            }
          }
        }
      });
      await prisma.customerProfile.deleteMany({
        where: {
          user: {
            email: {
              in: ['testadmin@test.com', 'testcustomer@test.com']
            }
          }
        }
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: ['testadmin@test.com', 'testcustomer@test.com']
          }
        }
      });
      await prisma.$disconnect();
    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  });

  describe('POST /api/users/register', () => {
    it('should register a new user with valid data', async () => {
      try {
        const res = await request(app)
          .post('/api/users/register')
          .send({
            email: 'newuser@test.com',
            password: 'Test123!',
            name: 'New User',
            phone: '5555555555',
            role: 'CUSTOMER'
          });

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('user');
        expect(res.body).toHaveProperty('token');

        // Clean up the created user
        await prisma.customerProfile.deleteMany({
          where: {
            user: {
              email: 'newuser@test.com'
            }
          }
        });
        await prisma.user.deleteMany({
          where: {
            email: 'newuser@test.com'
          }
        });
      } catch (error) {
        console.error('Test failed:', error);
        throw error;
      }
    });

    it('should fail with invalid email format', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          email: 'invalid-email',
          password: 'Test123!',
          name: 'New User',
          phone: '5555555555',
          role: 'CUSTOMER'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });

    it('should fail with weak password', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          email: 'newuser@test.com',
          password: 'weak',
          name: 'New User',
          phone: '5555555555',
          role: 'CUSTOMER'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });
  });

  describe('POST /api/users/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'testcustomer@test.com',
          password: 'Test123!'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
    });

    it('should fail with invalid email', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'Test123!'
        });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/users/profile', () => {
    it('should get user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${testData.customerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('user');
    });

    it('should fail without token', async () => {
      const res = await request(app)
        .get('/api/users/profile');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update profile with valid data', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${testData.customerToken}`)
        .send({
          name: 'Updated Name',
          phone: '5555555555'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
    });

    it('should fail with invalid phone number', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${testData.customerToken}`)
        .send({
          phone: 'invalid-phone'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });
  });

  describe('Admin Routes', () => {
    describe('GET /api/users', () => {
      it('should get all users with admin token', async () => {
        const res = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${testData.adminToken}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should fail with customer token', async () => {
        const res = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${testData.customerToken}`);

        expect(res.statusCode).toBe(403);
      });
    });

    describe('PUT /api/users/:id/role', () => {
      it('should update user role with admin token', async () => {
        const res = await request(app)
          .put(`/api/users/${testData.testUserId}/role`)
          .set('Authorization', `Bearer ${testData.adminToken}`)
          .send({
            role: 'MAID'
          });

        expect(res.statusCode).toBe(200);
        expect(res.body.role).toBe('MAID');
      });

      it('should fail with invalid role', async () => {
        const res = await request(app)
          .put(`/api/users/${testData.testUserId}/role`)
          .set('Authorization', `Bearer ${testData.adminToken}`)
          .send({
            role: 'INVALID_ROLE'
          });

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('errors');
      });
    });

    describe('PUT /api/users/:id/status', () => {
      it('should update user status with admin token', async () => {
        const res = await request(app)
          .put(`/api/users/${testData.testUserId}/status`)
          .set('Authorization', `Bearer ${testData.adminToken}`)
          .send({
            status: 'SUSPENDED'
          });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('SUSPENDED');
      });

      it('should fail with invalid status', async () => {
        const res = await request(app)
          .put(`/api/users/${testData.testUserId}/status`)
          .set('Authorization', `Bearer ${testData.adminToken}`)
          .send({
            status: 'INVALID_STATUS'
          });

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('errors');
      });
    });
  });
}); 