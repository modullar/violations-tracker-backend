const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const app = express();

// Import routes
const userRoutes = require('../../routes/userRoutes');

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  protect: jest.fn((req, res, next) => {
    if (req.headers.authorization === 'Bearer invalid-token') {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }
    req.user = { id: 'test-user-id' };
    next();
  }),
  authorize: (...roles) => (req, res, next) => {
    if (req.headers['x-role'] && roles.includes(req.headers['x-role'])) {
      return next();
    }
    return res.status(403).json({ success: false, error: 'Not authorized to access this route' });
  }
}));

jest.mock('../../middleware/validators', () => ({
  validateRequest: jest.fn((req, res, next) => next()),
  userRegistrationRules: [
    jest.fn((req, res, next) => next())
  ],
  idParamRules: [
    jest.fn((req, res, next) => next())
  ]
}));

// Mock the controllers
jest.mock('../../controllers/userController', () => ({
  getUsers: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getUser: jest.fn((req, res) => res.status(200).json({ success: true, data: {} })),
  createUser: jest.fn((req, res) => res.status(201).json({ success: true, data: req.body })),
  updateUser: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id, ...req.body } })),
  deleteUser: jest.fn((req, res) => res.status(200).json({ success: true, data: {} }))
}));

// Setup app with routes
app.use(express.json());
app.use('/api/users', userRoutes);

describe('User Routes', () => {
  it('should get all users with admin role', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('should reject access to users with non-admin role', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'user');
    
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
  
  it('should get a single user with admin role', async () => {
    const userId = new mongoose.Types.ObjectId();
    
    const res = await request(app)
      .get(`/api/users/${userId}`)
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('should create a new user with admin role', async () => {
    const userData = {
      name: 'New User',
      email: 'newuser@example.com',
      password: 'password123',
      role: 'editor'
    };
    
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin')
      .send(userData);
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
  
  it('should update a user with admin role', async () => {
    const userId = new mongoose.Types.ObjectId();
    const updateData = {
      name: 'Updated Name',
      role: 'editor'
    };
    
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin')
      .send(updateData);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('should delete a user with admin role', async () => {
    const userId = new mongoose.Types.ObjectId();
    
    const res = await request(app)
      .delete(`/api/users/${userId}`)
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
}); 