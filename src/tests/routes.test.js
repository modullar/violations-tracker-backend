const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const app = express();

// Import routes
const authRoutes = require('../routes/authRoutes');
const userRoutes = require('../routes/userRoutes');
const violationRoutes = require('../routes/violationRoutes');

// Mock middleware
jest.mock('../middleware/auth', () => ({
  protect: jest.fn((req, res, next) => {
    if (req.headers.authorization === 'Bearer invalid-token') {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }
    req.user = {
      id: 'test-user-id',
      role: req.headers['x-role'] || 'user'
    };
    next();
  }),
  authorize: (...roles) => (req, res, next) => {
    if (roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ success: false, error: 'Not authorized for this role' });
    }
  }
}));

// Mock controllers
const authControllerMock = {
  register: jest.fn((req, res) => res.status(201).json({ success: true, token: 'test-token' })),
  login: jest.fn((req, res) => res.status(200).json({ success: true, token: 'test-token' })),
  getMe: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.user.id } })),
  logout: jest.fn((req, res) => res.status(200).json({ success: true, data: {} }))
};

const userControllerMock = {
  getUsers: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getUser: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id } })),
  createUser: jest.fn((req, res) => res.status(201).json({ success: true, data: req.body })),
  updateUser: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id, ...req.body } })),
  deleteUser: jest.fn((req, res) => res.status(200).json({ success: true, data: {} }))
};

const violationControllerMock = {
  getViolations: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getViolation: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id } })),
  createViolation: jest.fn((req, res) => res.status(201).json({ success: true, data: req.body })),
  updateViolation: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id, ...req.body } })),
  deleteViolation: jest.fn((req, res) => res.status(200).json({ success: true, data: {} })),
  getViolationsInRadius: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getViolationStats: jest.fn((req, res) => res.status(200).json({ success: true, data: {} }))
};

// Mock the controllers in the routes
jest.mock('../controllers/authController', () => authControllerMock);
jest.mock('../controllers/userController', () => userControllerMock);
jest.mock('../controllers/violationsController', () => violationControllerMock);

// Setup app with routes
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/violations', violationRoutes);

describe('API Routes', () => {
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
      expect(authControllerMock.register).toHaveBeenCalled();
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
      expect(authControllerMock.login).toHaveBeenCalled();
    });
    
    it('should get current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(authControllerMock.getMe).toHaveBeenCalled();
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
      expect(authControllerMock.logout).toHaveBeenCalled();
    });
  });
  
  describe('User Routes', () => {
    it('should get all users with admin role', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'admin');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(userControllerMock.getUsers).toHaveBeenCalled();
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
      expect(userControllerMock.getUser).toHaveBeenCalled();
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
      expect(userControllerMock.createUser).toHaveBeenCalled();
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
      expect(userControllerMock.updateUser).toHaveBeenCalled();
    });
    
    it('should delete a user with admin role', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/users/${userId}`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'admin');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(userControllerMock.deleteUser).toHaveBeenCalled();
    });
  });
  
  describe('Violation Routes', () => {
    it('should get all violations without authentication', async () => {
      const res = await request(app)
        .get('/api/violations');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(violationControllerMock.getViolations).toHaveBeenCalled();
    });
    
    it('should get a single violation without authentication', async () => {
      const violationId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .get(`/api/violations/${violationId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(violationControllerMock.getViolation).toHaveBeenCalled();
    });
    
    it('should create a violation with editor role', async () => {
      const violationData = {
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          coordinates: [35, 34],
          name: 'Test Location'
        },
        description: 'Test violation',
        verified: true,
        certainty_level: 'confirmed'
      };
      
      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor')
        .send(violationData);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(violationControllerMock.createViolation).toHaveBeenCalled();
    });
    
    it('should reject creation with user role', async () => {
      const violationData = {
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          coordinates: [35, 34],
          name: 'Test Location'
        },
        description: 'Test violation',
        verified: true,
        certainty_level: 'confirmed'
      };
      
      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'user')
        .send(violationData);
      
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
    
    it('should update a violation with editor role', async () => {
      const violationId = new mongoose.Types.ObjectId();
      const updateData = {
        description: 'Updated description',
        verified: false
      };
      
      const res = await request(app)
        .put(`/api/violations/${violationId}`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor')
        .send(updateData);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(violationControllerMock.updateViolation).toHaveBeenCalled();
    });
    
    it('should delete a violation with admin role', async () => {
      const violationId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/violations/${violationId}`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'admin');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(violationControllerMock.deleteViolation).toHaveBeenCalled();
    });
    
    it('should reject deletion with editor role', async () => {
      const violationId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/violations/${violationId}`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor');
      
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
    
    it('should get violations within radius', async () => {
      const res = await request(app)
        .get('/api/violations/radius/34.5/35.5/10');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(violationControllerMock.getViolationsInRadius).toHaveBeenCalled();
    });
    
    it('should get violation statistics', async () => {
      const res = await request(app)
        .get('/api/violations/stats');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(violationControllerMock.getViolationStats).toHaveBeenCalled();
    });
  });
});