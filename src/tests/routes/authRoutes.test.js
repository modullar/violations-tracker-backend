const request = require('supertest');
const express = require('express');
const app = express();

// Import routes
const authRoutes = require('../../routes/authRoutes');

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  protect: jest.fn((req, res, next) => {
    if (req.headers.authorization === 'Bearer invalid-token') {
      return res.status(401).json({ success: false, error: 'Not authorized' });
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

// Mock the controllers
jest.mock('../../controllers/authController', () => ({
  register: jest.fn((req, res) => res.status(201).json({ success: true, token: 'test-token' })),
  login: jest.fn((req, res) => res.status(200).json({ success: true, token: 'test-token' })),
  getMe: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.user.id } })),
  logout: jest.fn((req, res) => res.status(200).json({ success: true, data: {} }))
}));

// Setup app with routes
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
  
  it('should login a user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('should get current user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('should reject access with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');
    
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
  
  it('should log out a user', async () => {
    const res = await request(app)
      .get('/api/auth/logout');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
}); 