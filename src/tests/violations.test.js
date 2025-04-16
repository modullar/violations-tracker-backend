const request = require('supertest');
const mongoose = require('mongoose');
const server = require('../server');
const Violation = require('../models/Violation');
const User = require('../models/User');

let adminToken;
let editorToken;
let violationId;

beforeAll(async () => {
  // Load test users and get tokens
  const adminResponse = await request(server)
    .post('/api/auth/login')
    .send({
      email: 'admin@example.com',
      password: 'password123'
    });
  
  adminToken = adminResponse.body.token;
  
  const editorResponse = await request(server)
    .post('/api/auth/login')
    .send({
      email: 'editor@example.com',
      password: 'password123'
    });
  
  editorToken = editorResponse.body.token;
  
  // Get a violation ID for testing
  const violations = await Violation.find();
  if (violations.length > 0) {
    violationId = violations[0]._id.toString();
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  server.close();
});

describe('Violations API', () => {
  describe('GET /api/violations', () => {
    it('should return violations with pagination', async () => {
      const res = await request(server).get('/api/violations');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
    
    it('should filter violations by type', async () => {
      const res = await request(server).get('/api/violations?type=AIRSTRIKE');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      if (res.body.count > 0) {
        expect(res.body.data[0].type).toBe('AIRSTRIKE');
      }
    });
  });
  
  describe('GET /api/violations/:id', () => {
    it('should return a single violation', async () => {
      if (!violationId) {
        return; // Skip if no violation ID available
      }
      
      const res = await request(server).get(`/api/violations/${violationId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id', violationId);
    });
    
    it('should return 404 for invalid ID', async () => {
      const res = await request(server).get('/api/violations/invalid-id');
      
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('POST /api/violations', () => {
    it('should require authentication', async () => {
      const res = await request(server)
        .post('/api/violations')
        .send({
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: {
            coordinates: [37.1, 36.2],
            name: 'Aleppo'
          },
          description: 'Test violation',
          verified: true,
          certainty_level: 'confirmed'
        });
      
      expect(res.status).toBe(401);
    });
    
    it('should create a new violation with valid data', async () => {
      const newViolation = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        location: {
          coordinates: [37.1, 36.2],
          name: 'Test Location',
          administrative_division: 'Test Division'
        },
        description: 'Test violation description that is long enough to pass validation',
        verified: true,
        certainty_level: 'confirmed',
        perpetrator: 'Test Perpetrator',
        casualties: 5
      };
      
      const res = await request(server)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(newViolation);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.type).toBe(newViolation.type);
      expect(res.body.data.description).toBe(newViolation.description);
      
      // Save ID for update/delete tests
      violationId = res.body.data._id;
    });
    
    it('should validate input data', async () => {
      const invalidViolation = {
        type: 'INVALID_TYPE', // Invalid type
        date: '2025-01-01', // Future date
        location: {
          coordinates: [200, 100], // Invalid coordinates
          name: 'A' // Too short
        },
        description: 'Short', // Too short
        verified: true,
        certainty_level: 'invalid' // Invalid certainty level
      };
      
      const res = await request(server)
        .post('/api/violations')
        .set('Authorization', `Bearer ${editorToken}`)
        .send(invalidViolation);
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('PUT /api/violations/:id', () => {
    it('should update a violation', async () => {
      if (!violationId) {
        return; // Skip if no violation ID available
      }
      
      const updateData = {
        description: 'Updated description for testing purposes',
        verified: false,
        certainty_level: 'probable'
      };
      
      const res = await request(server)
        .put(`/api/violations/${violationId}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send(updateData);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe(updateData.description);
      expect(res.body.data.verified).toBe(updateData.verified);
      expect(res.body.data.certainty_level).toBe(updateData.certainty_level);
    });
  });
  
  describe('GET /api/violations/stats', () => {
    it('should return statistics', async () => {
      const res = await request(server).get('/api/violations/stats');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalViolations');
      expect(res.body.data).toHaveProperty('totalCasualties');
      expect(res.body.data).toHaveProperty('byType');
      expect(res.body.data).toHaveProperty('byLocation');
    });
  });
  
  describe('DELETE /api/violations/:id', () => {
    it('should delete a violation', async () => {
      if (!violationId) {
        return; // Skip if no violation ID available
      }
      
      const res = await request(server)
        .delete(`/api/violations/${violationId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Verify deletion
      const checkRes = await request(server).get(`/api/violations/${violationId}`);
      expect(checkRes.status).toBe(404);
    });
    
    it('should restrict deletion to admin users', async () => {
      if (!violationId) {
        return; // Skip if no violation ID available
      }
      
      const res = await request(server)
        .delete(`/api/violations/${violationId}`)
        .set('Authorization', `Bearer ${editorToken}`);
      
      expect(res.status).toBe(403);
    });
  });
});