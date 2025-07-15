const mongoose = require('mongoose');
const TerritoryControl = require('../../models/TerritoryControl');
const User = require('../../models/User');
const territoryControlController = require('../../controllers/territoryControlController');
const ErrorResponse = require('../../utils/errorResponse');
const { connectDB, closeDB } = require('../setup');

// Mock external dependencies
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('Territory Control Controller', () => {
  let req, res, next;
  let testUserId, adminUserId;

  beforeAll(async () => {
    await connectDB();
    
    // Create test users
    const testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'editor'
    });
    testUserId = testUser._id;

    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin'
    });
    adminUserId = adminUser._id;
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {},
      user: { id: testUserId }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  afterEach(async () => {
    // Clear test data between tests
    if (mongoose.connection.readyState !== 0) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        const collection = collections[key];
        if (collection.collectionName !== 'users') {
          await collection.deleteMany();
        }
      }
    }
  });

  describe('getTerritoryControls', () => {
    beforeEach(async () => {
      // Create test data
      await TerritoryControl.create([
        {
          type: 'FeatureCollection',
          date: '2025-01-01',
          features: [{
            type: 'Feature',
            properties: {
              name: 'Territory A',
              controlledBy: 'sdf',
              color: '#ffff00',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }],
          created_by: testUserId
        },
        {
          type: 'FeatureCollection',
          date: '2025-01-15',
          features: [{
            type: 'Feature',
            properties: {
              name: 'Territory B',
              controlledBy: 'assad_regime',
              color: '#ff0000',
              controlledSince: '2020-06-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[37.0, 36.0], [38.0, 36.0], [38.0, 37.0], [37.0, 37.0], [37.0, 36.0]]]
            }
          }],
          created_by: testUserId
        }
      ]);
    });

    it('should get all territory controls with pagination', async () => {
      req.query = { page: 1, limit: 10 };

      await territoryControlController.getTerritoryControls(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        pagination: expect.objectContaining({
          page: 1,
          limit: 10,
          totalResults: 2
        }),
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'FeatureCollection'
          })
        ])
      });
    });

    it('should filter territory controls by date range', async () => {
      req.query = { startDate: '2025-01-10', endDate: '2025-01-20' };

      await territoryControlController.getTerritoryControls(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.count).toBe(1);
      expect(responseCall.data).toHaveLength(1);
      expect(responseCall.data[0].date.toISOString().split('T')[0]).toBe('2025-01-15');
    });

    it('should filter territory controls by controller', async () => {
      req.query = { controlledBy: 'sdf' };

      await territoryControlController.getTerritoryControls(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              features: expect.arrayContaining([
                expect.objectContaining({
                  properties: expect.objectContaining({
                    controlledBy: 'sdf'
                  })
                })
              ])
            })
          ])
        })
      );
    });
  });

  describe('getTerritoryControl', () => {
    let territoryControlId;

    beforeEach(async () => {
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-20',
        features: [{
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
        }],
        created_by: testUserId
      });
      territoryControlId = territoryControl._id;
    });

    it('should get territory control by ID', async () => {
      req.params.id = territoryControlId;

      await territoryControlController.getTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          _id: territoryControlId,
          type: 'FeatureCollection'
        })
      });
    });

    it('should return 404 for non-existent territory control', async () => {
      req.params.id = new mongoose.Types.ObjectId();

      await territoryControlController.getTerritoryControl(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404
        })
      );
    });
  });

  describe('getTerritoryControlByDate', () => {
    beforeEach(async () => {
      await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-15',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Date Test Territory',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });
    });

    it('should get territory control for exact date', async () => {
      req.params.date = '2025-01-15';

      await territoryControlController.getTerritoryControlByDate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.data.date.toISOString().split('T')[0]).toBe('2025-01-15');
    });

    it('should return closest date when exact date not found', async () => {
      req.params.date = '2025-01-20';

      await territoryControlController.getTerritoryControlByDate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.data.date.toISOString().split('T')[0]).toBe('2025-01-15');
      if (responseCall.note) {
        expect(responseCall.note).toContain('No data found for 2025-01-20');
      }
    });

    it('should return 404 when no data exists at all', async () => {
      // Clear all data
      await TerritoryControl.deleteMany({});
      req.params.date = '2025-01-20';

      await territoryControlController.getTerritoryControlByDate(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404
        })
      );
    });
  });

  describe('createTerritoryControl', () => {
    it('should create new territory control', async () => {
      req.body = {
        type: 'FeatureCollection',
        date: '2025-01-25',
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

      await territoryControlController.createTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.data.type).toBe('FeatureCollection');
      expect(responseCall.data.date.toISOString().split('T')[0]).toBe('2025-01-25');
    });

    it('should handle validation errors', async () => {
      req.body = {
        // Missing required fields
        type: 'FeatureCollection'
      };

      await territoryControlController.createTerritoryControl(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400
        })
      );
    });
  });

  describe('updateTerritoryControl', () => {
    let territoryControlId;

    beforeEach(async () => {
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-26',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Update Test Territory',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });
      territoryControlId = territoryControl._id;
    });

    it('should update territory control', async () => {
      req.params.id = territoryControlId;
      req.body = {
        features: [{
          type: 'Feature',
          properties: {
            name: 'Updated Territory Name',
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

      await territoryControlController.updateTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'Updated Territory Name',
                controlledBy: 'assad_regime'
              })
            })
          ])
        })
      });
    });

    it('should return 404 for non-existent territory control', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.body = { features: [] };

      await territoryControlController.updateTerritoryControl(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404
        })
      );
    });
  });

  describe('deleteTerritoryControl', () => {
    let territoryControlId;

    beforeEach(async () => {
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-27',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Delete Test Territory',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });
      territoryControlId = territoryControl._id;
    });

    it('should delete territory control', async () => {
      req.params.id = territoryControlId;
      req.query.preventLastDeletion = 'false'; // Allow deletion of last record

      await territoryControlController.deleteTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {}
      });

      // Verify it was actually deleted
      const deleted = await TerritoryControl.findById(territoryControlId);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent territory control', async () => {
      req.params.id = new mongoose.Types.ObjectId();

      await territoryControlController.deleteTerritoryControl(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404
        })
      );
    });
  });

  describe('addFeature', () => {
    let territoryControlId;

    beforeEach(async () => {
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-28',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Original Feature',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });
      territoryControlId = territoryControl._id;
    });

    it('should add new feature to territory control', async () => {
      req.params.id = territoryControlId;
      req.body = {
        type: 'Feature',
        properties: {
          name: 'New Feature',
          controlledBy: 'assad_regime',
          color: '#ff0000',
          controlledSince: '2021-01-01'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[[37.0, 36.0], [38.0, 36.0], [38.0, 37.0], [37.0, 37.0], [37.0, 36.0]]]
        }
      };

      await territoryControlController.addFeature(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'Original Feature'
              })
            }),
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'New Feature'
              })
            })
          ])
        })
      });
    });

    it('should handle validation errors for invalid feature', async () => {
      req.params.id = territoryControlId;
      req.body = {
        // Missing required properties
        type: 'Feature'
      };

      await territoryControlController.addFeature(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400
        })
      );
    });
  });

  describe('removeFeature', () => {
    let territoryControlId;

    beforeEach(async () => {
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-29',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Feature 1',
              controlledBy: 'sdf',
              color: '#ffff00',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          },
          {
            type: 'Feature',
            properties: {
              name: 'Feature 2',
              controlledBy: 'assad_regime',
              color: '#ff0000',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[37.0, 36.0], [38.0, 36.0], [38.0, 37.0], [37.0, 37.0], [37.0, 36.0]]]
            }
          }
        ],
        created_by: testUserId
      });
      territoryControlId = territoryControl._id;
    });

    it('should remove feature from territory control', async () => {
      req.params.id = territoryControlId;
      req.params.featureIndex = '0';

      await territoryControlController.removeFeature(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'Feature 2'
              })
            })
          ])
        })
      });
    });

    it('should handle invalid feature index', async () => {
      req.params.id = territoryControlId;
      req.params.featureIndex = 'invalid';

      await territoryControlController.removeFeature(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Invalid feature index'
        })
      );
    });
  });

  describe('getAvailableDates', () => {
    beforeEach(async () => {
      await TerritoryControl.create([
        {
          type: 'FeatureCollection',
          date: '2025-01-01',
          features: [{
            type: 'Feature',
            properties: {
              name: 'Territory A',
              controlledBy: 'sdf',
              color: '#ffff00',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }],
          created_by: testUserId
        },
        {
          type: 'FeatureCollection',
          date: '2025-01-15',
          features: [{
            type: 'Feature',
            properties: {
              name: 'Territory B',
              controlledBy: 'assad_regime',
              color: '#ff0000',
              controlledSince: '2020-06-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[37.0, 36.0], [38.0, 36.0], [38.0, 37.0], [37.0, 37.0], [37.0, 36.0]]]
            }
          }],
          created_by: testUserId
        }
      ]);
    });

    it('should return all available dates', async () => {
      await territoryControlController.getAvailableDates(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: expect.arrayContaining([
          expect.any(Date),
          expect.any(Date)
        ])
      });
    });
  });

  describe('getCurrentTerritoryControl', () => {
    beforeEach(async () => {
      await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-30',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Current Territory',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });
    });

    it('should return most recent territory control', async () => {
      await territoryControlController.getCurrentTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.data.date.toISOString().split('T')[0]).toBe('2025-01-30');
      expect(responseCall.isCurrent).toBe(true);
    });

    it('should return 404 when no data exists', async () => {
      await TerritoryControl.deleteMany({});

      await territoryControlController.getCurrentTerritoryControl(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          message: 'No territory control data available'
        })
      );
    });
  });

  describe('getTerritoryControlStats', () => {
    beforeEach(async () => {
      await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-31',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'SDF Territory',
              controlledBy: 'sdf',
              color: '#ffff00',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          },
          {
            type: 'Feature',
            properties: {
              name: 'Assad Territory',
              controlledBy: 'assad_regime',
              color: '#ff0000',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[37.0, 36.0], [38.0, 36.0], [38.0, 37.0], [37.0, 37.0], [37.0, 36.0]]]
            }
          }
        ],
        created_by: testUserId
      });
    });

    it('should return territory control statistics', async () => {
      await territoryControlController.getTerritoryControlStats(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          summary: expect.objectContaining({
            totalRecords: 1
          }),
          controllers: expect.any(Array)
        })
      });
    });
  });

  describe('Color Mapping Integration', () => {
    it('should add colors to territory control features in getTerritoryControl', async () => {
      // Create test territory control without colors
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-01',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Test Territory',
            controlledBy: 'assad_regime',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });

      req.params.id = territoryControl._id.toString();
      await territoryControlController.getTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'Test Territory',
                controlledBy: 'assad_regime',
                color: '#ff0000' // assad_regime color
              })
            })
          ])
        })
      });
    });

    it('should add colors to territory control features in getTerritoryControlByDate', async () => {
      // Create test territory control without colors
      await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-01',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'SDF Territory',
              controlledBy: 'sdf',
              controlledSince: '2019-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          },
          {
            type: 'Feature',
            properties: {
              name: 'Turkey Territory',
              controlledBy: 'turkey',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[36.0, 36.0], [37.0, 36.0], [37.0, 37.0], [36.0, 37.0], [36.0, 36.0]]]
            }
          }
        ],
        created_by: testUserId
      });

      req.params.date = '2025-01-01';
      await territoryControlController.getTerritoryControlByDate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'SDF Territory',
                controlledBy: 'sdf',
                color: '#FFFF00' // sdf color
              })
            }),
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'Turkey Territory',
                controlledBy: 'turkey',
                color: '#00FF00' // turkey color
              })
            })
          ])
        })
      });
    });

    it('should add colors to territory control features in getCurrentTerritoryControl', async () => {
      // Create test territory control without colors
      await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-01',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Israel Territory',
            controlledBy: 'israel',
            controlledSince: '2018-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });

      await territoryControlController.getCurrentTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'Israel Territory',
                controlledBy: 'israel',
                color: '#0000FF' // israel color
              })
            })
          ])
        }),
        isCurrent: true
      });
    });

    it('should add colors to territory control features in getTerritoryControls', async () => {
      // Create test territory control without colors
      await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-01',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Russia Territory',
            controlledBy: 'russia',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });

      await territoryControlController.getTerritoryControls(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        pagination: expect.any(Object),
        data: expect.arrayContaining([
          expect.objectContaining({
            features: expect.arrayContaining([
              expect.objectContaining({
                properties: expect.objectContaining({
                  name: 'Russia Territory',
                  controlledBy: 'russia',
                  color: '#FF4500' // russia color
                })
              })
            ])
          })
        ])
      });
    });

    it('should handle unknown controllers with default color', async () => {
      // Create test territory control with unknown controller
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-01',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Unknown Territory',
            controlledBy: 'unknown',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        created_by: testUserId
      });

      req.params.id = territoryControl._id.toString();
      await territoryControlController.getTerritoryControl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                name: 'Unknown Territory',
                controlledBy: 'unknown',
                color: '#800080' // unknown color
              })
            })
          ])
        })
      });
    });
  });
}); 