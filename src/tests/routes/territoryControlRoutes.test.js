const request = require('supertest');
const express = require('express');

// Create test app
const app = express();
app.use(express.json());

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

// Mock validators
jest.mock('../../middleware/validators', () => ({
  validateRequest: jest.fn((req, res, next) => next()),
  territoryControlRules: [],
  territoryControlUpdateRules: [],
  territoryControlMetadataRules: [],
  territoryControlFeatureRules: [],
  idParamRules: [],
  dateParamRules: [],
  territoryControlFilterRules: []
}));

// Mock commands
jest.mock('../../commands/territoryControl', () => ({
  getTerritoryControls: jest.fn().mockResolvedValue({
    territoryControls: [
      {
        _id: 'territory1',
        type: 'FeatureCollection',
        date: '2025-01-15',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'sdf',
              color: '#ffff00',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }
        ]
      }
    ],
    totalDocs: 1,
    pagination: {
      page: 1,
      limit: 10,
      totalPages: 1,
      totalResults: 1,
      hasNextPage: false,
      hasPrevPage: false
    }
  }),
  
  getTerritoryControlById: jest.fn().mockImplementation((id) => {
    if (id === 'existing-id') {
      return Promise.resolve({
        _id: 'existing-id',
        type: 'FeatureCollection',
        date: '2025-01-15',
        features: []
      });
    }
    return Promise.resolve(null);
  }),
  
  getTerritoryControlByDate: jest.fn().mockResolvedValue({
    _id: 'territory-by-date',
    type: 'FeatureCollection',
    date: '2025-01-15',
    features: []
  }),
  
  getClosestTerritoryControlToDate: jest.fn().mockResolvedValue({
    _id: 'closest-territory',
    type: 'FeatureCollection',
    date: '2025-01-10',
    features: []
  }),
  
  getAvailableDates: jest.fn().mockResolvedValue([
    new Date('2025-01-15'),
    new Date('2025-01-10'),
    new Date('2025-01-01')
  ]),
  
  createTerritoryControl: jest.fn().mockResolvedValue({
    _id: 'new-territory',
    type: 'FeatureCollection',
    date: '2025-01-20',
    features: []
  }),
  
  createTerritoryControlFromData: jest.fn().mockResolvedValue({
    _id: 'imported-territory',
    type: 'FeatureCollection',
    date: '2025-01-21',
    features: []
  }),
  
  updateTerritoryControl: jest.fn().mockResolvedValue({
    _id: 'updated-territory',
    type: 'FeatureCollection',
    date: '2025-01-22',
    features: []
  }),
  
  updateTerritoryControlMetadata: jest.fn().mockResolvedValue({
    _id: 'metadata-updated',
    type: 'FeatureCollection',
    date: '2025-01-23',
    features: []
  }),
  
  addFeatureToTerritoryControl: jest.fn().mockResolvedValue({
    _id: 'feature-added',
    type: 'FeatureCollection',
    date: '2025-01-24',
    features: []
  }),
  
  removeFeatureFromTerritoryControl: jest.fn().mockResolvedValue({
    _id: 'feature-removed',
    type: 'FeatureCollection',
    date: '2025-01-25',
    features: []
  }),
  
  deleteTerritoryControl: jest.fn().mockResolvedValue({
    _id: 'deleted-territory',
    type: 'FeatureCollection',
    date: '2025-01-26',
    features: []
  }),
  
  getTerritoryControlStats: jest.fn().mockResolvedValue({
    summary: {
      totalRecords: 5,
      totalFeatures: 15
    },
    controllers: [
      { controller: 'sdf', featureCount: 8 },
      { controller: 'assad_regime', featureCount: 7 }
    ]
  }),
  
  getControllerStats: jest.fn().mockResolvedValue({
    query: {},
    controllers: [
      {
        controller: 'sdf',
        totalTerritories: 3
      }
    ],
    summary: {
      totalControllers: 1,
      totalTerritories: 3
    }
  }),
  
  getTerritoryTimeline: jest.fn().mockResolvedValue({
    timeline: [
      {
        date: new Date('2025-01-15'),
        featuresCount: 2,
        controllers: ['sdf', 'assad_regime']
      }
    ],
    summary: {
      recordsCount: 1
    }
  }),
  
  getControlChangesSummary: jest.fn().mockResolvedValue({
    hasData: true,
    period: {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-01-15'),
      daysDifference: 14
    },
    summary: {
      totalFeaturesStart: 10,
      totalFeaturesEnd: 12,
      totalChange: 2
    },
    changes: []
  }),
  
  getTerritorialDistribution: jest.fn().mockResolvedValue({
    hasData: true,
    date: new Date('2025-01-15'),
    summary: {
      totalFeatures: 5,
      controllersCount: 2
    },
    distribution: [
      {
        controller: 'sdf',
        count: 3,
        percentage: '60.00'
      },
      {
        controller: 'assad_regime',
        count: 2,
        percentage: '40.00'
      }
    ]
  })
}));

// Import routes after mocking
const territoryControlRoutes = require('../../routes/territoryControlRoutes');
app.use('/api/territory-control', territoryControlRoutes);

// Add error handling middleware
const errorHandler = require('../../middleware/error');
app.use(errorHandler);

describe('Territory Control Routes', () => {
  describe('GET /api/territory-control', () => {
    it('should get all territory controls', async () => {
      const res = await request(app)
        .get('/api/territory-control');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body).toHaveProperty('pagination');
    });

    it('should filter territory controls by controller', async () => {
      const res = await request(app)
        .get('/api/territory-control?controlledBy=sdf');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter territory controls by date range', async () => {
      const res = await request(app)
        .get('/api/territory-control?startDate=2025-01-01&endDate=2025-01-31');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/territory-control/:id', () => {
    it('should get territory control by ID', async () => {
      const res = await request(app)
        .get('/api/territory-control/existing-id');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe('existing-id');
    });

    it('should return 404 for non-existent territory control', async () => {
      const res = await request(app)
        .get('/api/territory-control/non-existent-id');
      
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/territory-control/date/:date', () => {
    it('should get territory control by date', async () => {
      const res = await request(app)
        .get('/api/territory-control/date/2025-01-15');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe('territory-by-date');
    });
  });

  describe('GET /api/territory-control/closest/:date', () => {
    it('should get closest territory control to date', async () => {
      const res = await request(app)
        .get('/api/territory-control/closest/2025-01-12');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe('closest-territory');
    });
  });

  describe('GET /api/territory-control/dates', () => {
    it('should get all available dates', async () => {
      const res = await request(app)
        .get('/api/territory-control/dates');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.data).toHaveLength(3);
    });
  });

  describe('GET /api/territory-control/current', () => {
    it('should get current territory control', async () => {
      const res = await request(app)
        .get('/api/territory-control/current');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/territory-control/stats', () => {
    it('should get territory control statistics', async () => {
      const res = await request(app)
        .get('/api/territory-control/stats');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('controllers');
    });
  });

  describe('GET /api/territory-control/stats/controllers', () => {
    it('should get controller statistics', async () => {
      const res = await request(app)
        .get('/api/territory-control/stats/controllers');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('controllers');
      expect(res.body.data).toHaveProperty('summary');
    });

    it('should get controller statistics for specific date', async () => {
      const res = await request(app)
        .get('/api/territory-control/stats/controllers?date=2025-01-15');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/territory-control/timeline', () => {
    it('should get territory control timeline', async () => {
      const res = await request(app)
        .get('/api/territory-control/timeline');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('timeline');
      expect(res.body.data).toHaveProperty('summary');
    });

    it('should get timeline with filters', async () => {
      const res = await request(app)
        .get('/api/territory-control/timeline?controlledBy=sdf&limit=50');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/territory-control/changes', () => {
    it('should get control changes between dates', async () => {
      const res = await request(app)
        .get('/api/territory-control/changes?startDate=2025-01-01&endDate=2025-01-15');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('hasData');
      expect(res.body.data).toHaveProperty('period');
    });

    it('should return 400 when missing required dates', async () => {
      const res = await request(app)
        .get('/api/territory-control/changes?startDate=2025-01-01');
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/territory-control/distribution/:date', () => {
    it('should get territorial distribution for date', async () => {
      const res = await request(app)
        .get('/api/territory-control/distribution/2025-01-15');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('hasData');
      expect(res.body.data).toHaveProperty('distribution');
    });
  });

  describe('POST /api/territory-control', () => {
    it('should create new territory control with valid auth', async () => {
      const territoryData = {
        type: 'FeatureCollection',
        date: '2025-01-20',
        features: [{
          type: 'Feature',
          properties: {
            name: 'New Territory',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }]
      };

      const res = await request(app)
        .post('/api/territory-control')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor')
        .send(territoryData);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe('new-territory');
    });

    it('should reject unauthorized requests', async () => {
      const res = await request(app)
        .post('/api/territory-control')
        .set('Authorization', 'Bearer invalid-token')
        .send({});
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject requests from unauthorized roles', async () => {
      const res = await request(app)
        .post('/api/territory-control')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'user')
        .send({});
      
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/territory-control/import', () => {
    it('should import territory control data', async () => {
      const importData = {
        type: 'FeatureCollection',
        date: '2025-01-21',
        features: []
      };

      const res = await request(app)
        .post('/api/territory-control/import')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'admin')
        .send(importData);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.imported).toBe(true);
    });
  });

  describe('PUT /api/territory-control/:id', () => {
    it('should update territory control', async () => {
      const updateData = {
        features: [{
          type: 'Feature',
          properties: {
            name: 'Updated Territory',
            controlledBy: 'assad_regime',
            color: '#ff0000',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }]
      };

      const res = await request(app)
        .put('/api/territory-control/existing-id')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor')
        .send(updateData);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/territory-control/:id/metadata', () => {
    it('should update territory control metadata', async () => {
      const metadataUpdate = {
        source: 'updated_source',
        accuracy: 'high',
        description: {
          en: 'Updated description',
          ar: 'وصف محدث'
        }
      };

      const res = await request(app)
        .put('/api/territory-control/existing-id/metadata')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor')
        .send(metadataUpdate);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/territory-control/:id/features', () => {
    it('should add feature to territory control', async () => {
      const newFeature = {
        type: 'Feature',
        properties: {
          name: 'New Feature',
          controlledBy: 'turkey',
          color: '#00ff00'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[[39.0, 36.0], [40.0, 36.0], [40.0, 37.0], [39.0, 37.0], [39.0, 36.0]]]
        }
      };

      const res = await request(app)
        .post('/api/territory-control/existing-id/features')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor')
        .send(newFeature);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/territory-control/:id/features/:featureIndex', () => {
    it('should remove feature from territory control', async () => {
      const res = await request(app)
        .delete('/api/territory-control/existing-id/features/0')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/territory-control/:id', () => {
    it('should delete territory control with admin role', async () => {
      const res = await request(app)
        .delete('/api/territory-control/existing-id')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'admin');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject deletion with non-admin role', async () => {
      const res = await request(app)
        .delete('/api/territory-control/existing-id')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Role', 'editor');
      
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
}); 