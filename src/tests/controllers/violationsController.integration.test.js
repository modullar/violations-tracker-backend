const request = require('supertest');
const app = require('../../server');
const Violation = require('../../models/Violation');
const User = require('../../models/User');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

describe('Violations Controller - Duplicate Detection Integration', () => {
  let mongoServer;
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

  describe('POST /api/violations - Duplicate Detection', () => {
    const validViolationData = {
      type: 'AIRSTRIKE',
      date: '2023-05-15',
      location: {
        name: { en: 'Damascus', ar: 'دمشق' },
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
        description: { en: 'Airstrike on residential area with casualties', ar: 'غارة جوية على منطقة سكنية مع ضحايا' },
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
        description: { en: 'Chemical attack on residential area', ar: 'هجوم كيميائي على منطقة سكنية' },
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
        verification_method: { en: 'video_evidence', ar: 'دليل فيديو' }
      };

      const res = await request(app)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(verifiedDuplicateData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isDuplicate).toBe(true);
      expect(res.body.data.violation.verified).toBe(true);
      expect(res.body.data.violation.verification_method.en).toBe('video_evidence');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/violations')
        .send(validViolationData)
        .expect(401);
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
});