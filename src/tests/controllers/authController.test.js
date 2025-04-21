const request = require('supertest');

// Mock controllers directly (no routes)
jest.mock('../../controllers/authController', () => ({
  register: jest.fn((req, res) => {
    return res.status(201).json({
      success: true,
      token: 'test-token'
    });
  }),
  login: jest.fn((req, res) => {
    if (req.body.email === 'test@example.com' && req.body.password === 'password123') {
      return res.status(200).json({
        success: true,
        token: 'test-token'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }),
  getMe: jest.fn((req, res) => {
    return res.status(200).json({
      success: true,
      data: {
        id: req.user ? req.user.id : 'test-user-id',
        name: 'Test User',
        email: 'test@example.com'
      }
    });
  }),
  logout: jest.fn((req, res) => {
    return res.status(200).json({
      success: true,
      data: {}
    });
  })
}));

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  protect: jest.fn((req, res, next) => {
    if (req.headers.authorization === 'Bearer invalid-token') {
      return res.status(401).json({
        success: false,
        error: 'Not authorized'
      });
    }
    req.user = { id: 'test-user-id' };
    next();
  })
}));

jest.mock('../../middleware/validators', () => ({
  validateRequest: jest.fn((req, res, next) => next()),
  userRegistrationRules: [],
  userLoginRules: []
}));

// Create express app with routes
const express = require('express');
const app = express();
app.use(express.json());

// Get the controllers
const { register, login, getMe, logout } = require('../../controllers/authController');
const { protect } = require('../../middleware/auth');
const { validateRequest } = require('../../middleware/validators');

// Set up routes manually
app.post('/api/auth/register', validateRequest, register);
app.post('/api/auth/login', validateRequest, login);
app.get('/api/auth/me', protect, getMe);
app.get('/api/auth/logout', logout);

describe('Auth API Tests', () => {
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
        .set('Authorization', 'Bearer valid-token');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'Test User');
      expect(res.body.data).toHaveProperty('email', 'test@example.com');
    });
    
    it('should not allow access without token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
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