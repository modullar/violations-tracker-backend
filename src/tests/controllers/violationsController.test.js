const request = require('supertest');

// Change the port for tests to avoid conflicts
process.env.PORT = 3001;

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
  source_url: {
    en: 'https://example.com/en',
    ar: 'https://example.com/ar'
  },
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
      source_url: {
        en: 'https://example.com/en2',
        ar: 'https://example.com/ar2'
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
    create: jest.fn().mockImplementation((data) => {
      // If data is an array (batch creation), return an array of created violations
      if (Array.isArray(data)) {
        return Promise.resolve(data.map((item, index) => ({
          ...mockViolation,
          ...item,
          _id: `batch-violation-id-${index}`
        })));
      }
      // Single creation
      return Promise.resolve({ ...mockViolation, ...data });
    }),
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
    countDocuments: jest.fn().mockResolvedValue(3),
    validateForCreation: jest.fn().mockImplementation(async (violationData) => {
      // Simple mock validation that just returns sanitized data
      const sanitized = JSON.parse(JSON.stringify(violationData));
      
      // Add basic sanitization similar to our real method
      if (sanitized.date && typeof sanitized.date === 'string') {
        sanitized.date = new Date(sanitized.date);
      }
      
      // Add required defaults
      if (!sanitized.perpetrator_affiliation) {
        sanitized.perpetrator_affiliation = 'unknown';
      }
      
      // Add empty localized strings for missing fields
      ['source', 'source_url', 'verification_method', 'perpetrator'].forEach(field => {
        if (!sanitized[field]) {
          sanitized[field] = { en: '', ar: '' };
        }
      });
      
      return Promise.resolve(sanitized);
    }),
    validateBatch: jest.fn().mockImplementation(async (violationsData) => {
      // Mock batch validation
      const results = { valid: [], invalid: [] };
      
      for (let i = 0; i < violationsData.length; i++) {
        try {
          // Simple validation - just check if type exists
          if (!violationsData[i].type) {
            results.invalid.push({
              index: i,
              violation: violationsData[i],
              errors: ['Violation type is required']
            });
          } else {
            results.valid.push({ ...violationsData[i], _batchIndex: i });
          }
        } catch (error) {
          results.invalid.push({
            index: i,
            violation: violationsData[i],
            errors: [error.message]
          });
        }
      }
      
      return Promise.resolve(results);
    }),
    sanitizeData: jest.fn().mockImplementation((data) => {
      return JSON.parse(JSON.stringify(data));
    })
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

// Mock duplicate checking utilities
jest.mock('../../utils/duplicateChecker', () => ({
  checkForDuplicates: jest.fn().mockResolvedValue({
    hasDuplicates: false,
    duplicates: [],
    bestMatch: null
  })
}));

// Mock merge functionality
jest.mock('../../commands/violations/merge', () => ({
  mergeWithExistingViolation: jest.fn().mockImplementation((newData, existing, userId) => {
    return Promise.resolve({ ...existing, ...newData, updated_by: userId });
  })
}));

// Mock create commands with new structure
jest.mock('../../commands/violations', () => ({
  createSingleViolation: jest.fn().mockImplementation(async (data, userId) => {
    const violation = { ...mockViolation, ...data, created_by: userId };
    return {
      violation,
      wasMerged: false
    };
  }),
  createBatchViolations: jest.fn().mockImplementation(async (dataArray, userId) => {
    const ErrorResponse = require('../../utils/errorResponse');
    
    if (!Array.isArray(dataArray)) {
      throw new ErrorResponse('Request body must be an array of violations', 400);
    }
    
    if (dataArray.length === 0) {
      throw new ErrorResponse('At least one violation must be provided', 400);
    }
    
    const violations = dataArray.map((data, index) => ({
      ...mockViolation,
      ...data,
      _id: `batch-violation-id-${index}`,
      created_by: userId
    }));
    return {
      violations,
      created: violations,
      merged: [],
      errors: undefined
    };
  }),
  // Query operations
  getViolations: jest.fn().mockResolvedValue({
    violations: [mockViolation],
    totalDocs: 1,
    pagination: {
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false
    }
  }),
  getViolationsInRadius: jest.fn().mockResolvedValue([mockViolation]),
  getViolationById: jest.fn().mockImplementation((id) => {
    if (id === violationId) {
      return Promise.resolve(mockViolation);
    }
    return Promise.resolve(null);
  }),
  // Update operations
  updateViolation: jest.fn().mockImplementation((id, data, userId) => {
    if (id === violationId) {
      return Promise.resolve({ ...mockViolation, ...data, updated_by: userId });
    }
    const ErrorResponse = require('../../utils/errorResponse');
    throw new ErrorResponse(`Violation not found with id of ${id}`, 404);
  }),
  // Delete operations
  deleteViolation: jest.fn().mockImplementation((id) => {
    if (id === violationId) {
      return Promise.resolve();
    }
    const ErrorResponse = require('../../utils/errorResponse');
    throw new ErrorResponse(`Violation not found with id of ${id}`, 404);
  }),
  // Stats operations
  getViolationStats: jest.fn().mockResolvedValue({}),
  getViolationsByType: jest.fn().mockResolvedValue([
    { _id: 'AIRSTRIKE', count: 2 },
    { _id: 'ARTILLERY', count: 1 }
  ]),
  getViolationsByLocation: jest.fn().mockResolvedValue([
    { _id: 'Test Division', count: 3 }
  ]),
  getViolationsByYear: jest.fn().mockResolvedValue([
    { _id: 2023, count: 3 }
  ]),
  getViolationsTotal: jest.fn().mockResolvedValue(5)
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
    const express = require('express');
    app = express();
    app.use(express.json());
    
    // Import and use routes
    const violationRoutes = require('../../routes/violationRoutes');
    app.use('/api/violations', violationRoutes);

    // Add error handling middleware
    const errorHandler = require('../../middleware/error');
    app.use(errorHandler);
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
          name: { en: 'New Location', ar: 'موقع جديد' },
          administrative_division: { en: 'New Division', ar: 'قسم جديد' }
        },
        description: {
          en: 'This is a detailed description of the new violation that meets the minimum length requirement.',
          ar: 'هذا وصف مفصل للانتهاك الجديد'
        },
        source: {
          en: 'Test Source',
          ar: 'مصدر الاختبار'
        },
        verified: true,
        certainty_level: 'confirmed',
        verification_method: {
          en: 'Video evidence and witness testimony',
          ar: 'أدلة فيديو وشهادة شهود'
        },
        perpetrator: {
          en: 'New Perpetrator',
          ar: 'مرتكب جديد'
        },
        perpetrator_affiliation: 'assad_regime',
        casualties: 3,
        detained_count: 2,
        injured_count: 5
      };
      
      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newViolation);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.type).toBe(newViolation.type);
      expect(res.body).toHaveProperty('merged');
      expect(typeof res.body.merged).toBe('boolean');
      
      // If merged is true, should have duplicateInfo
      if (res.body.merged) {
        expect(res.body).toHaveProperty('duplicateInfo');
        expect(res.body.duplicateInfo).toHaveProperty('similarity');
        expect(res.body.duplicateInfo).toHaveProperty('exactMatch');
      }
    });

    it('should handle duplicate violation merge', async () => {
      // Mock the commands to return a merged result
      const { createSingleViolation } = require('../../commands/violations');
      createSingleViolation.mockResolvedValueOnce({
        violation: { 
          ...mockViolation, 
          casualties: 8, // Merged value
          updated_by: '5f7d327c3642214df4d0e0f7'
        },
        wasMerged: true,
        duplicateInfo: {
          similarity: 0.95,
          exactMatch: false,
          originalId: mockViolation._id
        }
      });

      const duplicateViolation = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        location: {
          name: { en: 'Test Location', ar: 'موقع اختبار' },
          administrative_division: { en: 'Test Division', ar: 'قسم اختبار' }
        },
        description: {
          en: 'Similar violation description that meets the minimum length requirement.',
          ar: 'وصف انتهاك مماثل'
        },
        source: {
          en: 'Similar Source',
          ar: 'مصدر مماثل'
        },
        verified: true,
        certainty_level: 'confirmed',
        verification_method: {
          en: 'Video evidence',
          ar: 'أدلة فيديو'
        },
        perpetrator: {
          en: 'Similar Perpetrator',
          ar: 'مرتكب مماثل'
        },
        perpetrator_affiliation: 'assad_regime',
        casualties: 3
      };
      
      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(duplicateViolation);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.merged).toBe(true);
      expect(res.body).toHaveProperty('duplicateInfo');
      expect(res.body.duplicateInfo).toHaveProperty('similarity');
      expect(res.body.duplicateInfo).toHaveProperty('exactMatch');
      expect(res.body.duplicateInfo.similarity).toBe(0.95);
      expect(res.body.duplicateInfo.exactMatch).toBe(false);
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
          name: { en: 'Updated Location', ar: 'موقع محدث' },
          administrative_division: { en: 'Updated Division', ar: 'قسم محدث' }
        },
        description: {
          en: 'This is a detailed description of the updated violation that meets the minimum length requirement.',
          ar: 'هذا وصف مفصل للانتهاك المحدث'
        },
        source: {
          en: 'Updated Source',
          ar: 'مصدر محدث'
        },
        verified: false,
        certainty_level: 'confirmed',
        perpetrator: {
          en: 'Updated Perpetrator',
          ar: 'مرتكب محدث'
        },
        perpetrator_affiliation: 'unknown',
        casualties: 5
      };
      
      const res = await request(app)
        .put(`/api/violations/${violationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toStrictEqual(updateData.description);
      expect(res.body.data.verified).toBe(updateData.verified);
    });
    
    it('should return 404 for non-existent violation', async () => {
      const updateData = {
        type: 'AIRSTRIKE',
        date: '2023-06-20',
        location: {
          type: 'Point',
          coordinates: [36.2, 37.1],
          name: { en: 'Updated Location', ar: 'موقع محدث' },
          administrative_division: { en: 'Updated Division', ar: 'قسم محدث' }
        },
        description: {
          en: 'This is a detailed description of the updated violation that meets the minimum length requirement.',
          ar: 'هذا وصف مفصل للانتهاك المحدث'
        },
        source: {
          en: 'Updated Source',
          ar: 'مصدر محدث'
        },
        verified: false,
        certainty_level: 'confirmed',
        perpetrator: {
          en: 'Updated Perpetrator',
          ar: 'مرتكب محدث'
        },
        perpetrator_affiliation: 'unknown',
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

  describe('POST /api/violations/batch', () => {
    it('should create multiple violations in batch', async () => {
      const violationsBatch = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-20',
          location: {
            type: 'Point',
            coordinates: [36.2, 37.1],
            name: { en: 'Batch Location 1', ar: 'موقع دفعة 1' },
            administrative_division: { en: 'Batch Division 1', ar: 'قسم دفعة 1' }
          },
          description: {
            en: 'This is a detailed description of the first violation in the batch.',
            ar: 'هذا وصف مفصل للانتهاك الأول في الدفعة'
          },
          source: {
            en: 'Batch Source 1',
            ar: 'مصدر دفعة 1'
          },
          verified: true,
          certainty_level: 'confirmed',
          verification_method: {
            en: 'Video evidence and witness testimony',
            ar: 'أدلة فيديو وشهادة شهود'
          },
          perpetrator: {
            en: 'Batch Perpetrator 1',
            ar: 'مرتكب دفعة 1'
          },
          perpetrator_affiliation: 'assad_regime',
          casualties: 3,
          detained_count: 1,
          injured_count: 4,
          source_url: {
            en: 'https://example.com/batch1/en',
            ar: 'https://example.com/batch1/ar'
          }
        },
        {
          type: 'SHELLING',
          date: '2023-06-21',
          location: {
            type: 'Point',
            coordinates: [35.9, 36.8],
            name: { en: 'Batch Location 2', ar: 'موقع دفعة 2' },
            administrative_division: { en: 'Batch Division 2', ar: 'قسم دفعة 2' }
          },
          description: {
            en: 'This is a detailed description of the second violation in the batch.',
            ar: 'هذا وصف مفصل للانتهاك الثاني في الدفعة'
          },
          source: {
            en: 'Batch Source 2',
            ar: 'مصدر دفعة 2'
          },
          verified: true,
          certainty_level: 'probable',
          verification_method: {
            en: 'Satellite imagery and local reports',
            ar: 'صور الأقمار الصناعية والتقارير المحلية'
          },
          perpetrator: {
            en: 'Batch Perpetrator 2',
            ar: 'مرتكب دفعة 2'
          },
          perpetrator_affiliation: 'russia',
          casualties: 5,
          detained_count: 3,
          injured_count: 7,
          source_url: {
            en: 'https://example.com/batch2/en',
            ar: 'https://example.com/batch2/ar'
          }
        }
      ];
      
      const res = await request(app)
        .post('/api/violations/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(violationsBatch);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('count');
      expect(res.body.count).toBe(violationsBatch.length);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(violationsBatch.length);
      expect(res.body.data[0]).toHaveProperty('_id');
      expect(res.body.data[1]).toHaveProperty('_id');
      
      // Check for new summary information
      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary).toHaveProperty('total');
      expect(res.body.summary).toHaveProperty('created');
      expect(res.body.summary).toHaveProperty('merged');
      expect(res.body.summary).toHaveProperty('errors');
      expect(res.body.summary.total).toBe(violationsBatch.length);
      
      // Check for merged info array
      expect(res.body).toHaveProperty('mergedInfo');
      expect(Array.isArray(res.body.mergedInfo)).toBe(true);
    });
    
    it('should require the request body to be an array', async () => {
      const res = await request(app)
        .post('/api/violations/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'AIRSTRIKE' }); // Not an array
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
    
    it('should require at least one violation', async () => {
      const res = await request(app)
        .post('/api/violations/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send([]); // Empty array
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
    
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/violations/batch')
        .send([{}]);
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
}); 