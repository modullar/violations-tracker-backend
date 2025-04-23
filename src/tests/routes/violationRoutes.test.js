const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const app = express();

// Import routes
const violationRoutes = require('../../routes/violationRoutes');

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
  validateRequest: jest.fn((req, res, next) => {
    // Only validate POST and PUT/PATCH requests with a body
    if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') && req.body) {
      // Check for invalid coordinates
      if (req.body.location && req.body.location.coordinates) {
        const [longitude, latitude] = req.body.location.coordinates;
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
          return res.status(400).json({ 
            success: false,
            error: 'Invalid coordinates' 
          });
        }
      }
    }
    return next();
  }),
  violationRules: [],
  batchViolationsRules: [],
  violationFilterRules: [],
  idParamRules: []
}));

// Mock the controllers
jest.mock('../../controllers/violationsController', () => ({
  getViolations: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getViolation: jest.fn((req, res) => res.status(200).json({ success: true, data: {} })),
  createViolation: jest.fn((req, res) => res.status(201).json({ success: true, data: req.body })),
  createViolationsBatch: jest.fn((req, res) => res.status(201).json({ success: true, count: req.body.length, data: req.body })),
  updateViolation: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id, ...req.body } })),
  deleteViolation: jest.fn((req, res) => res.status(200).json({ success: true, data: {} })),
  getViolationsInRadius: jest.fn((req, res) => res.status(200).json({ 
    success: true, 
    count: 0,
    data: [] 
  })),
  getViolationsByType: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getViolationsByLocation: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getViolationsByYear: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getViolationsTotal: jest.fn((req, res) => res.status(200).json({ success: true, data: { total: 0 } })),
  getViolationStats: jest.fn((req, res) => res.status(200).json({ success: true, data: {} }))
}));

// Setup app with routes
app.use(express.json());
app.use('/api/violations', violationRoutes);

describe('Violation Routes', () => {
  it('should get all violations without authentication', async () => {
    const res = await request(app)
      .get('/api/violations');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('should get a single violation without authentication', async () => {
    const violationId = new mongoose.Types.ObjectId();
    
    const res = await request(app)
      .get(`/api/violations/${violationId}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('should create a violation with editor role', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-05-15',
      location: {
        name: 'Test Location',
        administrative_division: 'Test Division'
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
  });

  it('should create a violation with coordinates', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-05-15',
      location: {
        coordinates: [35, 34],
        name: 'Test Location',
        administrative_division: 'Test Division'
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
  });

  it('should reject invalid coordinates', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-05-15',
      location: {
        coordinates: [200, 200], // Invalid coordinates
        name: 'Test Location',
        administrative_division: 'Test Division'
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
    
    expect(res.status).toBe(400);
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
  });

  it('should delete a violation with admin role', async () => {
    const violationId = new mongoose.Types.ObjectId();
    
    const res = await request(app)
      .delete(`/api/violations/${violationId}`)
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should get violations in radius', async () => {
    const res = await request(app)
      .get('/api/violations/radius/35/34/100');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('count');
  });

  it('should get violations by type', async () => {
    const res = await request(app)
      .get('/api/violations/stats/type')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should get violations by location', async () => {
    const res = await request(app)
      .get('/api/violations/stats/location')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should get violations by year', async () => {
    const res = await request(app)
      .get('/api/violations/stats/yearly')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should get violations total', async () => {
    const res = await request(app)
      .get('/api/violations/stats/total')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Role', 'admin');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('total');
  });

  it('should get violation stats', async () => {
    const res = await request(app)
      .get('/api/violations/stats');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
}); 