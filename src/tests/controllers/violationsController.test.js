const request = require('supertest');
const app = require('../../server');
const Violation = require('../../models/Violation');
const User = require('../../models/User');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

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

describe('Violations Controller', () => {
  let mongoServer;
  let adminToken;
  let editorToken;
  let adminUser;
  let editorUser;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test users
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin'
    });

    editorUser = await User.create({
      name: 'Editor User',
      email: 'editor@test.com',
      password: 'password123',
      role: 'editor'
    });

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: process.env.JWT_EXPIRE || '30d'
    });

    editorToken = jwt.sign({ id: editorUser._id }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: process.env.JWT_EXPIRE || '30d'
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Violation.deleteMany({});
  });

  describe('POST /api/violations', () => {
    const validViolationData = {
      type: 'AIRSTRIKE',
      date: '2023-05-15',
      location: {
        name: { en: 'Damascus', ar: 'دمشق' },
        administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
      },
      description: { en: 'Airstrike on residential area', ar: 'غارة جوية على منطقة سكنية' },
      perpetrator_affiliation: 'assad_regime',
      casualties: 5,
      verified: false,
      certainty_level: 'confirmed'
    };

    it('should create a new violation when no duplicates exist', async () => {
      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(validViolationData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.violation).toBeDefined();
      expect(res.body.data.isDuplicate).toBe(false);
      expect(res.body.data.duplicates).toHaveLength(0);
      expect(res.body.data.violation.type).toBe('AIRSTRIKE');
      expect(res.body.data.violation.created_by).toBe(editorUser._id.toString());
    });

    it('should detect and merge duplicates when creating similar violation', async () => {
      // First, create an existing violation
      const existingViolation = await Violation.create({
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.2765, 33.5138]
        },
        media_links: ['http://example.com/1'],
        created_by: adminUser._id,
        updated_by: adminUser._id
      });

      // Now try to create a similar violation
      const duplicateViolationData = {
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.2768, 33.5139] // Very close coordinates
        },
        description: { en: 'Air attack on civilian buildings', ar: 'هجوم جوي على مباني مدنية' },
        media_links: ['http://example.com/2']
      };

      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(duplicateViolationData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isDuplicate).toBe(true);
      expect(res.body.data.duplicates).toHaveLength(1);
      expect(res.body.data.violation._id).toBe(existingViolation._id.toString());
      
      // Check that media links were merged
      expect(res.body.data.violation.media_links).toContain('http://example.com/1');
      expect(res.body.data.violation.media_links).toContain('http://example.com/2');
      
      // Check duplicate info
      expect(res.body.data.duplicates[0].id).toBe(existingViolation._id.toString());
      expect(res.body.data.duplicates[0].exactMatch).toBe(true);
      expect(res.body.data.duplicates[0].matchDetails.nearbyLocation).toBe(true);
      expect(res.body.data.duplicates[0].matchDetails.sameCasualties).toBe(true);
    });

    it('should detect similarity-based duplicates', async () => {
      // Create an existing violation
      await Violation.create({
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.2765, 33.5138]
        },
        created_by: adminUser._id,
        updated_by: adminUser._id
      });

      // Create a violation with similar description but different location
      const similarViolationData = {
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.3000, 33.5500] // Far coordinates
        },
        description: { en: 'Airstrike on residential area causing multiple casualties', ar: 'غارة جوية على منطقة سكنية' },
        casualties: 8
      };

      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(similarViolationData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isDuplicate).toBe(true);
      expect(res.body.data.duplicates).toHaveLength(1);
      expect(res.body.data.duplicates[0].exactMatch).toBe(false);
      expect(res.body.data.duplicates[0].similarity).toBeGreaterThan(0.7);
    });

    it('should not detect duplicates for different violation types', async () => {
      // Create an existing violation
      await Violation.create({
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.2765, 33.5138]
        },
        created_by: adminUser._id,
        updated_by: adminUser._id
      });

      // Create a violation with different type
      const differentTypeViolation = {
        ...validViolationData,
        type: 'CHEMICAL_ATTACK',
        location: {
          ...validViolationData.location,
          coordinates: [36.2765, 33.5138] // Same coordinates
        }
      };

      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(differentTypeViolation)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isDuplicate).toBe(false);
      expect(res.body.data.duplicates).toHaveLength(0);
    });

    it('should not detect duplicates for different dates', async () => {
      // Create an existing violation
      await Violation.create({
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.2765, 33.5138]
        },
        created_by: adminUser._id,
        updated_by: adminUser._id
      });

      // Create a violation with different date
      const differentDateViolation = {
        ...validViolationData,
        date: '2023-05-16', // Different date
        location: {
          ...validViolationData.location,
          coordinates: [36.2765, 33.5138] // Same coordinates
        }
      };

      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(differentDateViolation)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isDuplicate).toBe(false);
      expect(res.body.data.duplicates).toHaveLength(0);
    });

    it('should upgrade verification status when merging duplicates', async () => {
      // Create an unverified violation
      await Violation.create({
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.2765, 33.5138]
        },
        verified: false,
        created_by: adminUser._id,
        updated_by: adminUser._id
      });

      // Create a verified duplicate
      const verifiedDuplicateData = {
        ...validViolationData,
        location: {
          ...validViolationData.location,
          coordinates: [36.2768, 33.5139] // Close coordinates
        },
        verified: true,
        verification_method: 'video_evidence'
      };

      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(verifiedDuplicateData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isDuplicate).toBe(true);
      expect(res.body.data.violation.verified).toBe(true);
      expect(res.body.data.violation.verification_method).toBe('video_evidence');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/violations')
        .send(validViolationData)
        .expect(401);
    });

    it('should require editor or admin role', async () => {
      // Create a viewer user
      const viewerUser = await User.create({
        name: 'Viewer User',
        email: 'viewer@test.com',
        password: 'password123',
        role: 'viewer'
      });

      const viewerToken = jwt.sign({ id: viewerUser._id }, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: process.env.JWT_EXPIRE || '30d'
      });

      await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(validViolationData)
        .expect(403);
    });

    it('should handle validation errors', async () => {
      const invalidData = {
        // Missing required fields
        type: 'INVALID_TYPE',
        date: 'invalid-date'
      };

      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(invalidData)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/violations', () => {
    beforeEach(async () => {
      // Create test violations
      await Violation.create([
        {
          type: 'AIRSTRIKE',
          date: '2023-05-15',
          location: {
            name: { en: 'Damascus', ar: 'دمشق' },
            coordinates: [36.2765, 33.5138],
            administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
          },
          description: { en: 'Airstrike on residential area', ar: 'غارة جوية على منطقة سكنية' },
          perpetrator_affiliation: 'assad_regime',
          casualties: 5,
          verified: false,
          certainty_level: 'confirmed',
          created_by: adminUser._id,
          updated_by: adminUser._id
        },
        {
          type: 'SHELLING',
          date: '2023-05-16',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            coordinates: [37.1343, 36.2021],
            administrative_division: { en: 'Aleppo Governorate', ar: 'محافظة حلب' }
          },
          description: { en: 'Artillery shelling', ar: 'قصف مدفعي' },
          perpetrator_affiliation: 'assad_regime',
          casualties: 3,
          verified: true,
          certainty_level: 'confirmed',
          created_by: editorUser._id,
          updated_by: editorUser._id
        }
      ]);
    });

    it('should get all violations with pagination', async () => {
      const res = await request(app)
        .get('/api/violations')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
    });

    it('should filter violations by type', async () => {
      const res = await request(app)
        .get('/api/violations?type=AIRSTRIKE')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].type).toBe('AIRSTRIKE');
    });

    it('should filter violations by date range', async () => {
      const res = await request(app)
        .get('/api/violations?startDate=2023-05-15&endDate=2023-05-15')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].date).toBe('2023-05-15');
    });
  });

  describe('GET /api/violations/:id', () => {
    let testViolation;

    beforeEach(async () => {
      testViolation = await Violation.create({
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2765, 33.5138],
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Airstrike on residential area', ar: 'غارة جوية على منطقة سكنية' },
        perpetrator_affiliation: 'assad_regime',
        casualties: 5,
        verified: false,
        certainty_level: 'confirmed',
        created_by: adminUser._id,
        updated_by: adminUser._id
      });
    });

    it('should get violation by ID', async () => {
      const res = await request(app)
        .get(`/api/violations/${testViolation._id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testViolation._id.toString());
      expect(res.body.data.type).toBe('AIRSTRIKE');
    });

    it('should return 404 for non-existent violation', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/violations/${nonExistentId}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });
}); 