const { 
  buildFilterQuery, 
  getViolations, 
  getViolationsInRadius, 
  getViolationById 
} = require('../../../commands/violations/query');
const Violation = require('../../../models/Violation');

// Mock Violation model
jest.mock('../../../models/Violation');

describe('Violation Query Command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildFilterQuery', () => {
    it('should build empty query when no params provided', () => {
      const query = buildFilterQuery({});
      expect(query).toEqual({});
    });

    it('should filter by type', () => {
      const query = buildFilterQuery({ type: 'AIRSTRIKE' });
      expect(query).toEqual({ type: 'AIRSTRIKE' });
    });

    it('should filter by date range', () => {
      const params = {
        startDate: '2023-01-01',
        endDate: '2023-12-31'
      };
      const query = buildFilterQuery(params);
      expect(query.date.$gte).toEqual(new Date('2023-01-01'));
      expect(query.date.$lte).toEqual(new Date('2023-12-31'));
    });

    it('should filter by location name in English', () => {
      const query = buildFilterQuery({ location: 'Aleppo', lang: 'en' });
      expect(query['location.name.en']).toBeInstanceOf(RegExp);
      expect(query['location.name.en'].test('Aleppo')).toBe(true);
      expect(query['location.name.en'].test('aleppo')).toBe(true);
    });

    it('should filter by location name in Arabic', () => {
      const query = buildFilterQuery({ location: 'حلب', lang: 'ar' });
      expect(query['location.name.ar']).toBeInstanceOf(RegExp);
      expect(query['location.name.ar'].test('حلب')).toBe(true);
    });

    it('should filter by administrative division', () => {
      const query = buildFilterQuery({ administrative_division: 'Damascus', lang: 'en' });
      expect(query['location.administrative_division.en']).toBeInstanceOf(RegExp);
    });

    it('should filter by certainty level', () => {
      const query = buildFilterQuery({ certainty_level: 'confirmed' });
      expect(query).toEqual({ certainty_level: 'confirmed' });
    });

    it('should filter by verification status', () => {
      const query = buildFilterQuery({ verified: 'true' });
      expect(query).toEqual({ verified: true });
      
      const query2 = buildFilterQuery({ verified: 'false' });
      expect(query2).toEqual({ verified: false });
    });

    it('should filter by perpetrator', () => {
      const query = buildFilterQuery({ perpetrator: 'Assad', lang: 'en' });
      expect(query['perpetrator.en']).toBeInstanceOf(RegExp);
    });

    it('should filter by perpetrator affiliation', () => {
      const query = buildFilterQuery({ perpetrator_affiliation: 'assad_regime' });
      expect(query).toEqual({ perpetrator_affiliation: 'assad_regime' });
    });

    it('should filter by tags', () => {
      const query = buildFilterQuery({ tags: 'chemical,civilian', lang: 'en' });
      expect(query.tags.$elemMatch.en.$in).toHaveLength(2);
      expect(query.tags.$elemMatch.en.$in[0]).toBeInstanceOf(RegExp);
    });

    it('should build geospatial query', () => {
      const params = {
        latitude: '36.2021047',
        longitude: '37.1342603',
        radius: '10'
      };
      const query = buildFilterQuery(params);
      expect(query['location.coordinates'].$geoWithin.$centerSphere).toBeDefined();
      expect(query['location.coordinates'].$geoWithin.$centerSphere[0]).toEqual([37.1342603, 36.2021047]);
    });

    it('should combine multiple filters', () => {
      const params = {
        type: 'SHELLING',
        verified: 'true',
        perpetrator_affiliation: 'russian_forces',
        startDate: '2023-06-01'
      };
      const query = buildFilterQuery(params);
      expect(query.type).toBe('SHELLING');
      expect(query.verified).toBe(true);
      expect(query.perpetrator_affiliation).toBe('russian_forces');
      expect(query.date.$gte).toEqual(new Date('2023-06-01'));
    });
  });

  describe('getViolations', () => {
    it('should get violations with default pagination', async () => {
      const mockResult = {
        docs: [{ _id: '1', type: 'AIRSTRIKE' }],
        totalDocs: 100,
        page: 1,
        limit: 10,
        totalPages: 10,
        hasNextPage: true,
        hasPrevPage: false,
        nextPage: 2,
        prevPage: null
      };

      Violation.paginate = jest.fn().mockResolvedValue(mockResult);

      const result = await getViolations({});

      expect(Violation.paginate).toHaveBeenCalledWith(
        {},
        {
          page: 1,
          limit: 10,
          sort: '-date',
          populate: [
            { path: 'created_by', select: 'name' },
            { path: 'updated_by', select: 'name' }
          ],
          select: '+perpetrator_affiliation'
        }
      );

      expect(result.violations).toEqual(mockResult.docs);
      expect(result.totalDocs).toBe(100);
      expect(result.pagination.page).toBe(1);
    });

    it('should apply custom pagination options', async () => {
      const mockResult = {
        docs: [],
        totalDocs: 0,
        page: 3,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      };

      Violation.paginate = jest.fn().mockResolvedValue(mockResult);

      const paginationOptions = {
        page: 3,
        limit: 20,
        sort: 'date'
      };

      await getViolations({ type: 'SHOOTING' }, paginationOptions);

      expect(Violation.paginate).toHaveBeenCalledWith(
        { type: 'SHOOTING' },
        expect.objectContaining({
          page: 3,
          limit: 20,
          sort: 'date'
        })
      );
    });
  });

  describe('getViolationsInRadius', () => {
    it('should find violations within radius', async () => {
      const mockViolations = [
        { _id: '1', location: { coordinates: [37.1, 36.2] } },
        { _id: '2', location: { coordinates: [37.15, 36.25] } }
      ];

      Violation.find = jest.fn().mockResolvedValue(mockViolations);

      const result = await getViolationsInRadius(36.2, 37.1, 10);

      expect(Violation.find).toHaveBeenCalledWith({
        'location.coordinates': {
          $geoWithin: {
            $centerSphere: expect.any(Array)
          }
        }
      });

      expect(result).toEqual(mockViolations);
    });

    it('should convert radius from km to miles correctly', async () => {
      Violation.find = jest.fn().mockResolvedValue([]);

      await getViolationsInRadius(36.2, 37.1, 16.09); // 10 miles

      const callArg = Violation.find.mock.calls[0][0];
      const centerSphere = callArg['location.coordinates'].$geoWithin.$centerSphere;
      
      // Check that radius is converted correctly (16.09 km = 10 miles)
      // 10 miles / 3963.2 (Earth's radius in miles) ≈ 0.00252
      expect(centerSphere[1]).toBeCloseTo(0.00252, 5);
    });
  });

  describe('getViolationById', () => {
    it('should get violation by ID with population', async () => {
      const mockViolation = {
        _id: '123',
        type: 'AIRSTRIKE',
        created_by: { _id: 'user1', name: 'User 1' },
        updated_by: { _id: 'user2', name: 'User 2' }
      };

      const mockQuery = {
        populate: jest.fn().mockResolvedValue(mockViolation)
      };

      Violation.findById = jest.fn().mockReturnValue(mockQuery);

      const result = await getViolationById('123');

      expect(Violation.findById).toHaveBeenCalledWith('123');
      expect(mockQuery.populate).toHaveBeenCalledWith([
        { path: 'created_by', select: 'name' },
        { path: 'updated_by', select: 'name' }
      ]);
      expect(result).toEqual(mockViolation);
    });

    it('should handle case when populate method not available', async () => {
      const mockViolation = {
        _id: '123',
        type: 'AIRSTRIKE'
      };

      // Mock query without populate method (test environment)
      const mockQuery = mockViolation;

      Violation.findById = jest.fn().mockReturnValue(mockQuery);

      const result = await getViolationById('123');

      expect(result).toEqual(mockViolation);
    });

    it('should return null when violation not found', async () => {
      const mockQuery = {
        populate: jest.fn().mockResolvedValue(null)
      };

      Violation.findById = jest.fn().mockReturnValue(mockQuery);

      const result = await getViolationById('nonexistent');

      expect(result).toBeNull();
    });
  });
});