const request = require('supertest');

// Change the port for tests to avoid conflicts
process.env.PORT = '5003';

// Mock the external dependencies
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  silly: jest.fn(),
  http: jest.fn()
}));

// Mock mongoose connection
jest.mock('../../config/db', () => jest.fn().mockImplementation(() => {
  return Promise.resolve();
}));

// Define test data
const violationId = '5f7d327c3642214df4d0e0f8';

// Create a mock violation for testing
const mockViolation = {
  _id: violationId,
  type: 'AIRSTRIKE',
  date: '2023-06-15',
  location: {
    type: 'Point',
    coordinates: [36.2, 37.1],
    name: 'Test Location',
    administrative_division: 'Test Division'
  },
  description: 'Test violation description',
  verified: true,
  certainty_level: 'confirmed',
  perpetrator: 'Test Perpetrator',
  casualties: 5,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Mock Violation model
jest.mock('../../models/Violation', () => {
  const mockViolations = [
    { ...mockViolation },
    {
      _id: '5f7d327c3642214df4d0e0f9',
      title: 'Another Test Violation',
      description: 'Another test description',
      severity: 'medium',
      status: 'open',
      location: {
        type: 'Point',
        coordinates: [35.5, -118.2]
      },
      createdAt: new Date('2023-01-02'),
      updatedAt: new Date('2023-01-02')
    }
  ];

  return {
    find: jest.fn().mockImplementation((query) => {
      // If it's a geospatial query (radius search)
      if (query && query['location.coordinates'] && query['location.coordinates'].$geoWithin) {
        return Promise.resolve([mockViolation]);
      }
      return {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockViolations)
      };
    }),
    findById: jest.fn().mockImplementation((id) => {
      if (id === violationId) {
        return Promise.resolve(mockViolation);
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((data) => Promise.resolve({ ...mockViolation, ...data })),
    findByIdAndUpdate: jest.fn().mockImplementation((id, data) => {
      if (id === violationId) {
        const updatedViolation = { ...mockViolation, ...data };
        return Promise.resolve(updatedViolation);
      }
      return Promise.resolve(null);
    }),
    findByIdAndDelete: jest.fn().mockImplementation((id) => {
      if (id === violationId) {
        return Promise.resolve(mockViolation);
      }
      return Promise.resolve(null);
    }),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(mockViolations),
    paginate: jest.fn().mockResolvedValue({
      docs: mockViolations,
      totalDocs: mockViolations.length,
      limit: 10,
      totalPages: 1,
      page: 1,
      pagingCounter: 1,
      hasPrevPage: false,
      hasNextPage: false,
      prevPage: null,
      nextPage: null
    }),
    aggregate: jest.fn().mockImplementation((pipeline) => {
      if (pipeline[0].$group && pipeline[0].$group._id === '$type') {
        return Promise.resolve([
          { _id: 'AIRSTRIKE', count: 2 },
          { _id: 'ARTILLERY', count: 1 }
        ]);
      } else if (pipeline[0].$group && pipeline[0].$group._id === '$location.administrative_division') {
        return Promise.resolve([
          { _id: 'Test Division', count: 3 }
        ]);
      } else if (pipeline[0].$project && pipeline[0].$project.year) {
        return Promise.resolve([
          { _id: 2023, count: 3 }
        ]);
      } else if (pipeline[0].$group && pipeline[0].$group._id === null) {
        return Promise.resolve([
          { _id: null, total: 5 }
        ]);
      }
      return Promise.resolve([]);
    }),
    countDocuments: jest.fn().mockResolvedValue(3)
  };
});

// Mock User model
jest.mock('../../models/User', () => {
  const adminUser = {
    _id: '5f7d327c3642214df4d0e0f7',
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin'
  };
  return {
    findById: jest.fn().mockResolvedValue(adminUser)
  };
});

// Mock Geocoder utility
jest.mock('../../utils/geocoder', () => ({
  geocodeLocation: jest.fn().mockResolvedValue([
    {
      latitude: 37.1,
      longitude: -122.1,
      formattedAddress: 'Test Location'
    }
  ])
}));

// Mock JWT verification
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockImplementation((payload) => {
    if (payload.role === 'admin') return 'admin_token';
    if (payload.role === 'editor') return 'editor_token';
    return 'user_token';
  }),
  verify: jest.fn().mockImplementation((token) => {
    if (token === 'admin_token') {
      return { id: '5f7d327c3642214df4d0e0f7', role: 'admin' };
    } else if (token === 'editor_token') {
      return { id: '5f7d327c3642214df4d0e0f6', role: 'editor' };
    }
    throw new Error('Invalid token');
  })
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  protect: jest.fn().mockImplementation((req, res, next) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      const token = req.headers.authorization.split(' ')[1];
      if (token === 'valid-token' || token === 'admin_token' || token === 'editor_token') {
        req.user = {
          _id: '5f7d327c3642214df4d0e0f7',
          role: token === 'admin_token' ? 'admin' : 'editor'
        };
        return next();
      }
    }
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }),
  authorize: jest.fn().mockImplementation((...roles) => (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    
    next();
  })
}));

// Set up app and test data
let app;
const adminToken = 'admin_token';
const editorToken = 'editor_token';

describe('Violations API', () => {
  beforeAll(() => {
    app = require('../../server');
  });

  afterAll(async () => {
    if (app && app.close) {
      app.close();
    }
  });

  describe('GET /api/violations', () => {
    it('should return violations with pagination', async () => {
      const res = await request(app).get('/api/violations');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
    
    it('should filter violations by type', async () => {
      const res = await request(app)
        .get('/api/violations?type=AIRSTRIKE')
        .set('Authorization', `Bearer ${editorToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      if (res.body.count > 0) {
        expect(res.body.data[0].type).toBe('AIRSTRIKE');
      }
    });
  });
  
  describe('GET /api/violations/:id', () => {
    it('should return a single violation', async () => {
      const res = await request(app).get(`/api/violations/${violationId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
    });
    
    it('should return 404 for invalid ID', async () => {
      const res = await request(app).get('/api/violations/invalid-id');
      
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('POST /api/violations', () => {
    it('should create a new violation', async () => {
      const newViolation = {
        type: 'AIRSTRIKE',
        date: '2023-06-20',
        location: {
          type: 'Point',
          coordinates: [36.2, 37.1],
          name: 'New Location',
          administrative_division: 'New Division'
        },
        description: 'This is a detailed description of the new violation that meets the minimum length requirement.',
        verified: true,
        certainty_level: 'confirmed',
        perpetrator: 'New Perpetrator',
        casualties: 3
      };
      
      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newViolation);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.type).toBe(newViolation.type);
    });
    
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/violations')
        .send({});
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('PUT /api/violations/:id', () => {
    it('should update an existing violation', async () => {
      const updateData = {
        type: 'AIRSTRIKE',
        date: '2023-06-20',
        location: {
          type: 'Point',
          coordinates: [36.2, 37.1],
          name: 'Updated Location',
          administrative_division: 'Updated Division'
        },
        description: 'This is a detailed description of the updated violation that meets the minimum length requirement.',
        verified: false,
        certainty_level: 'confirmed',
        perpetrator: 'Updated Perpetrator',
        casualties: 5
      };
      
      const res = await request(app)
        .put(`/api/violations/${violationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe(updateData.description);
      expect(res.body.data.verified).toBe(updateData.verified);
    });
    
    it('should return 404 for non-existent violation', async () => {
      const updateData = {
        type: 'AIRSTRIKE',
        date: '2023-06-20',
        location: {
          type: 'Point',
          coordinates: [36.2, 37.1],
          name: 'Updated Location',
          administrative_division: 'Updated Division'
        },
        description: 'This is a detailed description of the updated violation that meets the minimum length requirement.',
        verified: false,
        certainty_level: 'confirmed',
        perpetrator: 'Updated Perpetrator',
        casualties: 5
      };

      const res = await request(app)
        .put('/api/violations/nonexistent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);
      
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('DELETE /api/violations/:id', () => {
    it('should delete an existing violation', async () => {
      const res = await request(app)
        .delete(`/api/violations/${violationId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    
    it('should return 404 for non-existent violation', async () => {
      const res = await request(app)
        .delete('/api/violations/nonexistent-id')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('GET /api/violations/radius/:latitude/:longitude/:radius', () => {
    it('should get violations within radius', async () => {
      const res = await request(app)
        .get('/api/violations/radius/37.1/36.2/10');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
  
  describe('GET /api/violations/stats/type', () => {
    it('should get violations by type', async () => {
      const res = await request(app)
        .get('/api/violations/stats/type')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('_id');
      expect(res.body.data[0]).toHaveProperty('count');
    });
  });
  
  describe('GET /api/violations/stats/location', () => {
    it('should get violations by location', async () => {
      const res = await request(app)
        .get('/api/violations/stats/location')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('_id');
      expect(res.body.data[0]).toHaveProperty('count');
    });
  });
  
  describe('GET /api/violations/stats/yearly', () => {
    it('should get yearly violation counts', async () => {
      const res = await request(app)
        .get('/api/violations/stats/yearly')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('_id');
      expect(res.body.data[0]).toHaveProperty('count');
    });
  });
  
  describe('GET /api/violations/stats/total', () => {
    it('should get total violation count', async () => {
      const res = await request(app)
        .get('/api/violations/stats/total')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(typeof res.body.data.total).toBe('number');
    });
  });
}); 