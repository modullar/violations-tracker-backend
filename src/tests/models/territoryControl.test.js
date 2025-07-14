const mongoose = require('mongoose');
const TerritoryControl = require('../../models/TerritoryControl');
const { connectDB, closeDB } = require('../setup');

// Mock external dependencies
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('TerritoryControl Model', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    // Clear all test data between tests
    if (mongoose.connection.readyState !== 0) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
      }
    }
  });

  describe('Schema and Validation', () => {
    it('should create a territory control with valid data', async () => {
      const validTerritoryControl = {
        type: 'FeatureCollection',
        date: '2025-01-15',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'sdf',
              color: '#ffff00',
              controlledSince: '2020-01-01',
              description: {
                en: 'Test territory description',
                ar: 'وصف الإقليم التجريبي'
              }
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [35.0, 36.0],
                  [36.0, 36.0],
                  [36.0, 37.0],
                  [35.0, 37.0],
                  [35.0, 36.0]
                ]
              ]
            }
          }
        ],
        metadata: {
          source: 'test_source',
          description: {
            en: 'Test metadata description',
            ar: 'وصف البيانات الوصفية التجريبية'
          },
          accuracy: 'high',
          lastVerified: new Date()
        }
      };

      const territoryControl = new TerritoryControl(validTerritoryControl);
      const savedTerritoryControl = await territoryControl.save();

      expect(savedTerritoryControl._id).toBeDefined();
      expect(savedTerritoryControl.type).toBe(validTerritoryControl.type);
      expect(savedTerritoryControl.features).toHaveLength(1);
      expect(savedTerritoryControl.features[0].properties.name).toBe('Test Territory');
      expect(savedTerritoryControl.metadata.source).toBe('test_source');
    });

    it('should fail validation with invalid data', async () => {
      const invalidTerritoryControl = {
        // Missing required date
        features: []
      };

      const territoryControl = new TerritoryControl(invalidTerritoryControl);
      
      await expect(territoryControl.save()).rejects.toThrow();
    });

    it('should validate controller enum values', async () => {
      const territoryControlData = {
        type: 'FeatureCollection',
        date: '2025-01-15',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'invalid_controller',
              color: '#ffff00',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [35.0, 36.0],
                  [36.0, 36.0],
                  [36.0, 37.0],
                  [35.0, 37.0],
                  [35.0, 36.0]
                ]
              ]
            }
          }
        ]
      };

      const territoryControl = new TerritoryControl(territoryControlData);
      
      await expect(territoryControl.save()).rejects.toThrow();
    });

    it('should validate geometry type enum values', async () => {
      const territoryControlData = {
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
              type: 'Point', // Invalid geometry type
              coordinates: [35.0, 36.0]
            }
          }
        ]
      };

      const territoryControl = new TerritoryControl(territoryControlData);
      
      await expect(territoryControl.save()).rejects.toThrow();
    });

    it('should validate color format', async () => {
      // Test valid color formats
      const validColors = ['#ff0000', '#FF0000', 'ff0000', '#fff', 'red', 'blue', 'green'];
      
      for (const color of validColors) {
        const territoryControlData = {
          type: 'FeatureCollection',
          date: '2025-01-15',
          features: [
            {
              type: 'Feature',
              properties: {
                name: 'Test Territory',
                controlledBy: 'sdf',
                color: color,
                controlledSince: '2020-01-01'
              },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [35.0, 36.0],
                    [36.0, 36.0],
                    [36.0, 37.0],
                    [35.0, 37.0],
                    [35.0, 36.0]
                  ]
                ]
              }
            }
          ]
        };

        const territoryControl = new TerritoryControl(territoryControlData);
        await expect(territoryControl.save()).resolves.not.toThrow();
        await territoryControl.deleteOne();
      }

      // Test invalid color format
      const territoryControlData = {
        type: 'FeatureCollection',
        date: '2025-01-15',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'sdf',
              color: 'invalid-color-name', // Invalid color format
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [35.0, 36.0],
                  [36.0, 36.0],
                  [36.0, 37.0],
                  [35.0, 37.0],
                  [35.0, 36.0]
                ]
              ]
            }
          }
        ]
      };

      const territoryControl = new TerritoryControl(territoryControlData);
      await expect(territoryControl.save()).rejects.toThrow('Color must be a valid hex color code');
    });

    it('should allow territory control without color', async () => {
      const territoryControlData = {
        type: 'FeatureCollection',
        date: '2025-01-15',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Territory',
              controlledBy: 'sdf',
              controlledSince: '2020-01-01'
              // No color field - should be valid
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [35.0, 36.0],
                  [36.0, 36.0],
                  [36.0, 37.0],
                  [35.0, 37.0],
                  [35.0, 36.0]
                ]
              ]
            }
          }
        ]
      };

      const territoryControl = new TerritoryControl(territoryControlData);
      await expect(territoryControl.save()).resolves.not.toThrow();
      await territoryControl.deleteOne();
    });

    it('should validate future dates are not allowed', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const territoryControlData = {
        type: 'FeatureCollection',
        date: futureDate,
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
              coordinates: [
                [
                  [35.0, 36.0],
                  [36.0, 36.0],
                  [36.0, 37.0],
                  [35.0, 37.0],
                  [35.0, 36.0]
                ]
              ]
            }
          }
        ]
      };

      const territoryControl = new TerritoryControl(territoryControlData);
      
      await expect(territoryControl.save()).rejects.toThrow();
    });
  });

  describe('Static Methods', () => {
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
          }]
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
          }]
        }
      ]);
    });

    describe('findByDate', () => {
      it('should find territory control for exact date', async () => {
        const result = await TerritoryControl.findByDate('2025-01-15');
        
        expect(result).toBeDefined();
        expect(result.date.toISOString().split('T')[0]).toBe('2025-01-15');
        expect(result.features[0].properties.name).toBe('Territory B');
      });

      it('should find most recent territory control before date', async () => {
        const result = await TerritoryControl.findByDate('2025-01-10');
        
        expect(result).toBeDefined();
        expect(result.date.toISOString().split('T')[0]).toBe('2025-01-01');
        expect(result.features[0].properties.name).toBe('Territory A');
      });

      it('should return null for date before any records', async () => {
        const result = await TerritoryControl.findByDate('2024-12-01');
        
        expect(result).toBeNull();
      });

      it('should filter by controller when provided', async () => {
        const result = await TerritoryControl.findByDate('2025-01-20', { controlledBy: 'sdf' });
        
        expect(result).toBeDefined();
        expect(result.features[0].properties.controlledBy).toBe('sdf');
      });
    });

    describe('findClosestToDate', () => {
      it('should find closest territory control to target date', async () => {
        const result = await TerritoryControl.findClosestToDate('2025-01-10');
        
        expect(result).toBeDefined();
        expect(result.date.toISOString().split('T')[0]).toBe('2025-01-01');
      });

      it('should find future date if no past date exists', async () => {
        const result = await TerritoryControl.findClosestToDate('2024-12-01');
        
        expect(result).toBeDefined();
        expect(result.date.toISOString().split('T')[0]).toBe('2025-01-01');
      });
    });

    describe('getAvailableDates', () => {
      it('should return all available dates sorted descending', async () => {
        const dates = await TerritoryControl.getAvailableDates();
        
        expect(dates).toHaveLength(2);
        expect(dates[0].toISOString().split('T')[0]).toBe('2025-01-15');
        expect(dates[1].toISOString().split('T')[0]).toBe('2025-01-01');
      });
    });

    describe('getTimeline', () => {
      it('should return paginated timeline', async () => {
        const result = await TerritoryControl.getTimeline({ limit: 10 });
        
        expect(result.docs).toHaveLength(2);
        expect(result.totalDocs).toBe(2);
        expect(result.page).toBe(1);
      });

      it('should filter timeline by date range', async () => {
        const result = await TerritoryControl.getTimeline({
          startDate: '2025-01-10',
          endDate: '2025-01-20'
        });
        
        expect(result.docs).toHaveLength(1);
        expect(result.docs[0].date.toISOString().split('T')[0]).toBe('2025-01-15');
      });

      it('should filter timeline by controller', async () => {
        const result = await TerritoryControl.getTimeline({
          controlledBy: 'sdf'
        });
        
        expect(result.docs).toHaveLength(1);
        expect(result.docs[0].features[0].properties.controlledBy).toBe('sdf');
      });
    });
  });

  describe('Business Rule Validation', () => {
    it('should prevent duplicate dates by default', async () => {
      // Create first territory control
      await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-20',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Territory C',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }]
      });

      // Try to create another with same date
      const duplicateData = {
        type: 'FeatureCollection',
        date: '2025-01-20',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Territory D',
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

      await expect(TerritoryControl.validateForCreation(duplicateData)).rejects.toThrow();
    });

    it('should validate feature geometry exists', async () => {
      const invalidData = {
        type: 'FeatureCollection',
        date: '2025-01-21',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Territory E',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          }
          // Missing geometry
        }]
      };

      await expect(TerritoryControl.validateForCreation(invalidData)).rejects.toThrow();
    });

    it('should validate feature has name', async () => {
      const invalidData = {
        type: 'FeatureCollection',
        date: '2025-01-22',
        features: [{
          type: 'Feature',
          properties: {
            // Missing name
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

      await expect(TerritoryControl.validateForCreation(invalidData)).rejects.toThrow();
    });

    it('should allow controlledSince after main date (validation removed)', async () => {
      const validData = {
        type: 'FeatureCollection',
        date: '2025-01-01',
        features: [{
          type: 'Feature',
          properties: {
            name: 'Territory F',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2025-01-02' // After main date - now allowed
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }]
      };

      await expect(TerritoryControl.validateForCreation(validData)).resolves.not.toThrow();
    });
  });

  describe('Instance Methods', () => {
    let territoryControl;

    beforeEach(async () => {
      territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-25',
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
              controlledSince: '2018-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[37.0, 36.0], [38.0, 36.0], [38.0, 37.0], [37.0, 37.0], [37.0, 36.0]]]
            }
          }
        ]
      });
    });

    describe('getTerritoriesByController', () => {
      it('should return territories controlled by specific entity', () => {
        const sdfTerritories = territoryControl.getTerritoriesByController('sdf');
        
        expect(sdfTerritories).toHaveLength(1);
        expect(sdfTerritories[0].properties.name).toBe('SDF Territory');
      });

      it('should return empty array for non-existent controller', () => {
        const nonExistentTerritories = territoryControl.getTerritoriesByController('non_existent');
        
        expect(nonExistentTerritories).toHaveLength(0);
      });
    });

    describe('getControllerStats', () => {
      it('should return statistics for all controllers', () => {
        const stats = territoryControl.getControllerStats();
        
        expect(stats).toHaveProperty('sdf');
        expect(stats).toHaveProperty('assad_regime');
        expect(stats.sdf.territories).toBe(1);
        expect(stats.assad_regime.territories).toBe(1);
        expect(stats.sdf.features[0].name).toBe('SDF Territory');
      });
    });

    describe('isCurrent', () => {
      it('should return true for most recent territory control', async () => {
        const isCurrent = await territoryControl.isCurrent();
        
        expect(isCurrent).toBe(true);
      });

      it('should return false for older territory control', async () => {
        // Create a newer territory control
        await TerritoryControl.create({
          type: 'FeatureCollection',
          date: '2025-01-26',
          features: [{
            type: 'Feature',
            properties: {
              name: 'Newer Territory',
              controlledBy: 'sdf',
              color: '#ffff00',
              controlledSince: '2020-01-01'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
            }
          }]
        });

        const isCurrent = await territoryControl.isCurrent();
        
        expect(isCurrent).toBe(false);
      });
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize and normalize data', () => {
      const rawData = {
        date: '2025-01-27',
        features: [{
          properties: {
            name: 'Test Territory',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01',
            description: 'Plain string description'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }],
        metadata: {
          description: 'Plain string metadata description'
        }
      };

      const sanitized = TerritoryControl.sanitizeData(rawData);

      expect(sanitized.type).toBe('FeatureCollection');
      expect(sanitized.date instanceof Date).toBe(true);
      expect(sanitized.features[0].type).toBe('Feature');
      expect(sanitized.features[0].properties.description).toEqual({ en: 'Plain string description', ar: '' });
      expect(sanitized.metadata.description).toEqual({ en: 'Plain string metadata description', ar: '' });
      expect(sanitized.metadata.source).toBe('manual_entry');
      expect(sanitized.metadata.accuracy).toBe('medium');
    });
  });

  describe('JSON Formatting', () => {
    it('should format dates correctly in JSON output', async () => {
      const territoryControl = await TerritoryControl.create({
        type: 'FeatureCollection',
        date: '2025-01-28',
        features: [{
          type: 'Feature',
          properties: {
            name: 'JSON Test Territory',
            controlledBy: 'sdf',
            color: '#ffff00',
            controlledSince: '2020-01-01'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[35.0, 36.0], [36.0, 36.0], [36.0, 37.0], [35.0, 37.0], [35.0, 36.0]]]
          }
        }]
      });

      const jsonOutput = territoryControl.toJSON();

      expect(jsonOutput.date).toBe('2025-01-28');
      expect(jsonOutput.features[0].properties.controlledSince).toBe('2020-01-01');
      expect(jsonOutput.metadata.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
}); 