const DuplicateDetectionService = require('../../services/duplicateDetection');
const Violation = require('../../models/Violation');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('DuplicateDetectionService', () => {
  let mongoServer;
  let testUserId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    
    // Create a test user ID
    testUserId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Violation.deleteMany({});
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two points correctly', () => {
      // Distance between Damascus and Aleppo (approximately 300km)
      const damascusLat = 33.5138;
      const damascusLon = 36.2765;
      const aleppoLat = 36.2021;
      const aleppoLon = 37.1343;

      const distance = DuplicateDetectionService.calculateDistance(
        damascusLat, damascusLon, aleppoLat, aleppoLon
      );

      // Should be approximately 300,000 meters (300km)
      expect(distance).toBeGreaterThan(250000);
      expect(distance).toBeLessThan(350000);
    });

    it('should return 0 for same coordinates', () => {
      const distance = DuplicateDetectionService.calculateDistance(
        33.5138, 36.2765, 33.5138, 36.2765
      );
      expect(distance).toBe(0);
    });

    it('should calculate small distances accurately', () => {
      // Two points very close to each other (about 50 meters apart)
      const lat1 = 33.5138;
      const lon1 = 36.2765;
      const lat2 = 33.5142; // Slightly north
      const lon2 = 36.2765;

      const distance = DuplicateDetectionService.calculateDistance(lat1, lon1, lat2, lon2);
      expect(distance).toBeLessThan(100);
      expect(distance).toBeGreaterThan(30);
    });
  });

  describe('compareDates', () => {
    it('should return true for same dates', () => {
      const date1 = '2023-05-15';
      const date2 = new Date('2023-05-15');
      expect(DuplicateDetectionService.compareDates(date1, date2)).toBe(true);
    });

    it('should return false for different dates', () => {
      const date1 = '2023-05-15';
      const date2 = '2023-05-16';
      expect(DuplicateDetectionService.compareDates(date1, date2)).toBe(false);
    });

    it('should ignore time components', () => {
      const date1 = '2023-05-15T10:30:00Z';
      const date2 = '2023-05-15T15:45:00Z';
      expect(DuplicateDetectionService.compareDates(date1, date2)).toBe(true);
    });
  });

  describe('findDuplicates', () => {
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
          perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
          perpetrator_affiliation: 'assad_regime',
          source: { en: 'Local witness', ar: 'شاهد محلي' },
          source_url: { en: 'http://example.com/source1', ar: 'http://example.com/source1-ar' },
          casualties: 5,
          verified: false,
          certainty_level: 'confirmed'
        },
        {
          type: 'AIRSTRIKE',
          date: '2023-05-15',
          location: {
            name: { en: 'Damascus', ar: 'دمشق' },
            coordinates: [36.2770, 33.5140], // Very close coordinates
            administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
          },
          description: { en: 'Air attack on civilian buildings', ar: 'هجوم جوي على مباني مدنية' },
          perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
          perpetrator_affiliation: 'assad_regime',
          source: { en: 'News report', ar: 'تقرير إخباري' },
          source_url: { en: 'http://example.com/source2', ar: 'http://example.com/source2-ar' },
          casualties: 5,
          verified: true,
          certainty_level: 'confirmed'
        },
        {
          type: 'SHELLING',
          date: '2023-05-15',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            coordinates: [37.1343, 36.2021],
            administrative_division: { en: 'Aleppo Governorate', ar: 'محافظة حلب' }
          },
          description: { en: 'Artillery shelling on market area', ar: 'قصف مدفعي على منطقة السوق' },
          perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
          perpetrator_affiliation: 'assad_regime',
          source: { en: 'Video evidence', ar: 'دليل فيديو' },
          source_url: { en: 'http://example.com/source3', ar: 'http://example.com/source3-ar' },
          casualties: 3,
          verified: false,
          certainty_level: 'probable'
        }
      ]);
    });

    it('should find exact match duplicates', async () => {
      const newViolation = {
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2768, 33.5139], // Within 100m of existing
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Different description but same incident', ar: 'وصف مختلف لكن نفس الحادثة' },
        perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
        perpetrator_affiliation: 'assad_regime',
        source: { en: 'Another witness', ar: 'شاهد آخر' },
        source_url: { en: 'http://example.com/source4', ar: 'http://example.com/source4-ar' },
        casualties: 5
      };

      const duplicates = await DuplicateDetectionService.findDuplicates(newViolation);
      expect(duplicates).toHaveLength(2); // Should find both existing airstrikes
      expect(duplicates[0].exactMatch).toBe(true);
      expect(duplicates[0].matchDetails.nearbyLocation).toBe(true);
      expect(duplicates[0].matchDetails.sameCasualties).toBe(true);
    });

    it('should find similarity-based duplicates', async () => {
      const newViolation = {
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.3000, 33.5500], // Far coordinates
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Airstrike on residential area with casualties', ar: 'غارة جوية على منطقة سكنية مع ضحايا' },
        perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
        perpetrator_affiliation: 'assad_regime',
        source: { en: 'Social media', ar: 'وسائل التواصل الاجتماعي' },
        source_url: { en: 'http://example.com/source5', ar: 'http://example.com/source5-ar' },
        casualties: 8 // Different casualties
      };

      const duplicates = await DuplicateDetectionService.findDuplicates(newViolation);
      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0].similarity).toBeGreaterThan(0.7);
      expect(duplicates[0].exactMatch).toBe(false);
    });

    it('should not find duplicates for different types', async () => {
      const newViolation = {
        type: 'CHEMICAL_ATTACK', // Different type
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2765, 33.5138],
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Chemical attack on residential area', ar: 'هجوم كيميائي على منطقة سكنية' },
        perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
        perpetrator_affiliation: 'assad_regime',
        source: { en: 'Medical report', ar: 'تقرير طبي' },
        source_url: { en: 'http://example.com/source6', ar: 'http://example.com/source6-ar' },
        casualties: 5
      };

      const duplicates = await DuplicateDetectionService.findDuplicates(newViolation);
      expect(duplicates).toHaveLength(0);
    });

    it('should not find duplicates for different dates', async () => {
      const newViolation = {
        type: 'AIRSTRIKE',
        date: '2023-05-16', // Different date
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2765, 33.5138],
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Airstrike on residential area', ar: 'غارة جوية على منطقة سكنية' },
        perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
        perpetrator_affiliation: 'assad_regime',
        source: { en: 'Local witness', ar: 'شاهد محلي' },
        source_url: { en: 'http://example.com/source7', ar: 'http://example.com/source7-ar' },
        casualties: 5
      };

      const duplicates = await DuplicateDetectionService.findDuplicates(newViolation);
      expect(duplicates).toHaveLength(0);
    });

    it('should not find duplicates for different perpetrator affiliations', async () => {
      const newViolation = {
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2765, 33.5138],
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Airstrike on residential area', ar: 'غارة جوية على منطقة سكنية' },
        perpetrator: { en: 'Russian Forces', ar: 'القوات الروسية' },
        perpetrator_affiliation: 'russia', // Different perpetrator
        source: { en: 'Local witness', ar: 'شاهد محلي' },
        source_url: { en: 'http://example.com/source8', ar: 'http://example.com/source8-ar' },
        casualties: 5
      };

      const duplicates = await DuplicateDetectionService.findDuplicates(newViolation);
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('mergeViolationData', () => {
    it('should merge media links correctly', () => {
      const existing = {
        media_links: ['http://example.com/1', 'http://example.com/2'],
        casualties: 5
      };

      const newViolation = {
        media_links: ['http://example.com/2', 'http://example.com/3'], // One duplicate, one new
        casualties: 7,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.media_links).toHaveLength(3);
      expect(merged.media_links).toContain('http://example.com/1');
      expect(merged.media_links).toContain('http://example.com/2');
      expect(merged.media_links).toContain('http://example.com/3');
    });

    it('should merge victims correctly', () => {
      const existing = {
        victims: [
          { _id: 'victim1', name: { en: 'John Doe', ar: 'جون دو' } },
          { _id: 'victim2', name: { en: 'Jane Smith', ar: 'جين سميث' } }
        ],
        casualties: 2
      };

      const newViolation = {
        victims: [
          { _id: 'victim2', name: { en: 'Jane Smith', ar: 'جين سميث' } }, // Duplicate
          { _id: 'victim3', name: { en: 'Bob Johnson', ar: 'بوب جونسون' } } // New
        ],
        casualties: 3,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.victims).toHaveLength(3);
      expect(merged.victims.find(v => v._id === 'victim1')).toBeDefined();
      expect(merged.victims.find(v => v._id === 'victim2')).toBeDefined();
      expect(merged.victims.find(v => v._id === 'victim3')).toBeDefined();
    });

    it('should merge tags correctly', () => {
      const existing = {
        tags: [
          { en: 'civilian', ar: 'مدني' },
          { en: 'residential', ar: 'سكني' }
        ],
        casualties: 5
      };

      const newViolation = {
        tags: [
          { en: 'residential', ar: 'سكني' }, // Duplicate
          { en: 'hospital', ar: 'مستشفى' } // New
        ],
        casualties: 7,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.tags).toHaveLength(3);
      expect(merged.tags.find(t => t.en === 'civilian')).toBeDefined();
      expect(merged.tags.find(t => t.en === 'residential')).toBeDefined();
      expect(merged.tags.find(t => t.en === 'hospital')).toBeDefined();
    });

    it('should merge source information correctly', () => {
      const existing = {
        source: { en: 'Source A', ar: 'مصدر أ' },
        source_urls: ['http://source-a.com'],
        casualties: 5
      };

      const newViolation = {
        source: { en: 'Source B', ar: 'مصدر ب' },
        source_urls: ['http://source-b.com', 'http://source-c.com'],
        casualties: 7,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.source.en).toBe('Source A, Source B');
      expect(merged.source.ar).toBe('مصدر أ, مصدر ب');
      expect(merged.source_urls).toHaveLength(3);
      expect(merged.source_urls).toContain('http://source-a.com');
      expect(merged.source_urls).toContain('http://source-b.com');
      expect(merged.source_urls).toContain('http://source-c.com');
    });

    it('should upgrade verification status', () => {
      const existing = {
        verified: false,
        casualties: 5
      };

      const newViolation = {
        verified: true,
        verification_method: 'video_evidence',
        casualties: 7,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.verified).toBe(true);
      expect(merged.verification_method).toBe('video_evidence');
    });

    it('should not downgrade verification status', () => {
      const existing = {
        verified: true,
        verification_method: 'witness_testimony',
        casualties: 5
      };

      const newViolation = {
        verified: false,
        casualties: 7,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.verified).toBe(true);
      expect(merged.verification_method).toBe('witness_testimony');
    });

    it('should take higher casualty counts', () => {
      const existing = {
        casualties: 5,
        kidnapped_count: 2,
        detained_count: 3,
        injured_count: 10
      };

      const newViolation = {
        casualties: 7,
        kidnapped_count: 1, // Lower
        detained_count: 5, // Higher
        injured_count: 8, // Lower
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.casualties).toBe(7);
      expect(merged.kidnapped_count).toBe(2);
      expect(merged.detained_count).toBe(5);
      expect(merged.injured_count).toBe(10);
    });

    it('should keep longer description', () => {
      const existing = {
        description: { en: 'Short description', ar: 'وصف قصير' },
        casualties: 5
      };

      const newViolation = {
        description: { 
          en: 'Much longer and more detailed description of the incident', 
          ar: 'وصف أطول وأكثر تفصيلاً للحادثة' 
        },
        casualties: 7,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.description.en).toBe('Much longer and more detailed description of the incident');
      expect(merged.description.ar).toBe('وصف أطول وأكثر تفصيلاً للحادثة');
    });

    it('should update metadata', () => {
      const existing = {
        casualties: 5,
        updated_at: new Date('2023-01-01'),
        updated_by: 'olduser'
      };

      const newViolation = {
        casualties: 7,
        created_by: testUserId
      };

      const merged = DuplicateDetectionService.mergeViolationData(existing, newViolation);
      expect(merged.updated_by).toBe(testUserId);
      expect(merged.updated_at).toBeInstanceOf(Date);
      expect(merged.updated_at.getTime()).toBeGreaterThan(new Date('2023-01-01').getTime());
    });
  });

  describe('processViolationWithDuplicateCheck', () => {
    beforeEach(async () => {
      // Create a test violation
      await Violation.create({
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2765, 33.5138],
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Airstrike on residential area', ar: 'غارة جوية على منطقة سكنية' },
        perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
        perpetrator_affiliation: 'assad_regime',
        source: { en: 'Local witness', ar: 'شاهد محلي' },
        source_url: { en: 'http://example.com/source1', ar: 'http://example.com/source1-ar' },
        casualties: 5,
        verified: false,
        certainty_level: 'confirmed',
        media_links: ['http://example.com/1']
      });
    });

    it('should return duplicate info when duplicate found', async () => {
      const newViolation = {
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2768, 33.5139], // Close coordinates
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Air attack on civilian area', ar: 'هجوم جوي على منطقة مدنية' },
        perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
        perpetrator_affiliation: 'assad_regime',
        source: { en: 'News report', ar: 'تقرير إخباري' },
        source_url: { en: 'http://example.com/source2', ar: 'http://example.com/source2-ar' },
        casualties: 5,
        media_links: ['http://example.com/2'],
        created_by: testUserId
      };

      const result = await DuplicateDetectionService.processViolationWithDuplicateCheck(newViolation);
      
      expect(result.isDuplicate).toBe(true);
      expect(result.violation).toBeDefined();
      expect(result.duplicates).toHaveLength(1);
      expect(result.violation.media_links).toContain('http://example.com/1');
      expect(result.violation.media_links).toContain('http://example.com/2');
    });

    it('should return no duplicate info when no duplicate found', async () => {
      const newViolation = {
        type: 'CHEMICAL_ATTACK', // Different type
        date: '2023-05-15',
        location: {
          name: { en: 'Damascus', ar: 'دمشق' },
          coordinates: [36.2765, 33.5138],
          administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
        },
        description: { en: 'Chemical attack on civilians', ar: 'هجوم كيميائي على المدنيين' },
        perpetrator: { en: 'Assad Forces', ar: 'قوات الأسد' },
        perpetrator_affiliation: 'assad_regime',
        source: { en: 'Medical report', ar: 'تقرير طبي' },
        source_url: { en: 'http://example.com/source3', ar: 'http://example.com/source3-ar' },
        casualties: 3,
        created_by: testUserId
      };

      const result = await DuplicateDetectionService.processViolationWithDuplicateCheck(newViolation);
      
      expect(result.isDuplicate).toBe(false);
      expect(result.violation).toBeNull();
      expect(result.duplicates).toHaveLength(0);
    });
  });
});