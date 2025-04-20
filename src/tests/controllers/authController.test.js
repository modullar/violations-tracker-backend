const request = require('supertest');

// Change the port for tests to avoid conflicts
process.env.PORT = '5002';

// Mock the external dependencies
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

// Mock mongoose connection
jest.mock('../../config/db', () => jest.fn().mockImplementation(() => {
  return Promise.resolve();
}));

// Mock User model methods
jest.mock('../../models/User', () => {
  const mockUser = {
    _id: '5f7d327c3642214df4d0e0f9',
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    matchPassword: jest.fn().mockImplementation((password) => {
      return Promise.resolve(password === 'password123');
    }),
    getSignedJwtToken: jest.fn().mockReturnValue('test_token')
  };
  
  return {
    create: jest.fn().mockImplementation((data) => {
      if (data.email === 'test@example.com') {
        const error = new Error('Duplicate field value entered');
        error.code = 11000;
        error.keyValue = { email: 'test@example.com' };
        throw error;
      }
      return Promise.resolve({
        ...mockUser,
        ...data,
        getSignedJwtToken: jest.fn().mockReturnValue('test_token')
      });
    }),
    findOne: jest.fn().mockImplementation(({ email }) => ({
      select: jest.fn().mockResolvedValue(
        email === 'test@example.com' ? mockUser : null
      )
    })),
    findById: jest.fn().mockResolvedValue(mockUser)
  };
});

// Mock JWT verification
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mocked_token_for_tests'),
  verify: jest.fn().mockImplementation((token) => {
    if (token === 'mocked_token_for_tests') {
      return { id: 'mocked_id_from_token' };
    }
    throw new Error('Invalid token');
  })
}));

// Import the Express app after mocking dependencies
let app;

describe('Auth API Tests', () => {
  beforeAll(() => {
    // Import the server after all mocks are in place
    app = require('../../server');
  });
  
  afterAll(() => {
    if (app && app.close) {
      app.close();
    }
  });

  describe('User Registration', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'newuser@example.com',
          password: 'password123',
          organization: 'Test Organization'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
    });
    
    it('should validate registration input', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'T', // Too short
          email: 'invalid-email',
          password: '123' // Too short
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
    
    it('should not allow duplicate emails', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Another User',
          email: 'test@example.com', // Same email
          password: 'password123',
          organization: 'Test Org'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Duplicate field value entered');
    });
  });
  
  describe('User Login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
    });
    
    it('should not login with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('User Profile', () => {
    it('should get current user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer mocked_token_for_tests');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'Test User');
      expect(res.body.data).toHaveProperty('email', 'test@example.com');
    });
    
    it('should not allow access without token', async () => {
      const res = await request(app)
        .get('/api/auth/me');
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('User Logout', () => {
    it('should log out user', async () => {
      const res = await request(app)
        .get('/api/auth/logout');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({});
    });
  });
}); 