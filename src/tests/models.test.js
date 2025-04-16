const mongoose = require('mongoose');
const User = require('../models/User');
const Violation = require('../models/Violation');

describe('Model Tests', () => {
  describe('User Model', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'user',
        organization: 'Test Org'
      };
      
      const user = new User(userData);
      const savedUser = await user.save();
      
      expect(savedUser._id).toBeDefined();
      expect(savedUser.name).toBe(userData.name);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.role).toBe(userData.role);
      expect(savedUser.organization).toBe(userData.organization);
      
      // Password should be hashed
      expect(savedUser.password).not.toBe(userData.password);
    });
    
    it('should fail validation with invalid data', async () => {
      const invalidData = [
        // Missing required fields
        {},
        // Invalid email
        { name: 'Test', email: 'not-an-email', password: 'password123' },
        // Password too short
        { name: 'Test', email: 'test@example.com', password: '123' },
        // Invalid role
        { name: 'Test', email: 'test@example.com', password: 'password123', role: 'superuser' }
      ];
      
      for (const data of invalidData) {
        const user = new User(data);
        
        try {
          await user.validate();
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeDefined();
          expect(error.name).toBe('ValidationError');
        }
      }
    });
    
    it('should not save duplicate emails', async () => {
      // Create first user
      const userData = {
        name: 'Test User',
        email: 'duplicate@example.com',
        password: 'password123',
        role: 'user'
      };
      
      await new User(userData).save();
      
      // Try to create second user with same email
      const duplicateUser = new User({
        name: 'Another User',
        email: 'duplicate@example.com',
        password: 'different123',
        role: 'user'
      });
      
      try {
        await duplicateUser.save();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.code).toBe(11000); // Duplicate key error
      }
    });
    
    it('should match user passwords correctly', async () => {
      const password = 'testpassword123';
      
      const user = new User({
        name: 'Password Test',
        email: 'password@test.com',
        password,
        role: 'user'
      });
      
      await user.save();
      
      // Test matching password
      const isMatch = await user.matchPassword(password);
      expect(isMatch).toBe(true);
      
      // Test non-matching password
      const isNotMatch = await user.matchPassword('wrongpassword');
      expect(isNotMatch).toBe(false);
    });
  });
  
  describe('Violation Model', () => {
    it('should create a violation with valid data', async () => {
      const violationData = {
        type: 'AIRSTRIKE',
        date: new Date('2023-01-15'),
        location: {
          coordinates: [35.5, 33.5],
          name: 'Test Location',
          administrative_division: 'Test Division'
        },
        description: 'This is a test violation description that is long enough to pass validation',
        verified: true,
        certainty_level: 'confirmed',
        casualties: 5,
        perpetrator: 'Test Perpetrator',
        perpetrator_affiliation: 'Test Affiliation',
        tags: ['test', 'airstrike']
      };
      
      const violation = new Violation(violationData);
      const savedViolation = await violation.save();
      
      expect(savedViolation._id).toBeDefined();
      expect(savedViolation.type).toBe(violationData.type);
      expect(savedViolation.description).toBe(violationData.description);
      expect(savedViolation.location.name).toBe(violationData.location.name);
      expect(savedViolation.tags).toEqual(expect.arrayContaining(violationData.tags));
    });
    
    it('should fail validation with invalid data', async () => {
      const invalidDataCases = [
        // Invalid type
        {
          type: 'INVALID_TYPE',
          date: new Date(),
          location: { coordinates: [35, 33], name: 'Test' },
          description: 'Test description that is long enough',
          verified: true,
          certainty_level: 'confirmed'
        },
        // Future date
        {
          type: 'AIRSTRIKE',
          date: new Date('2050-01-01'),
          location: { coordinates: [35, 33], name: 'Test' },
          description: 'Test description that is long enough',
          verified: true,
          certainty_level: 'confirmed'
        },
        // Invalid coordinates
        {
          type: 'AIRSTRIKE',
          date: new Date(),
          location: { coordinates: [200, 200], name: 'Test' },
          description: 'Test description that is long enough',
          verified: true,
          certainty_level: 'confirmed'
        },
        // Description too short
        {
          type: 'AIRSTRIKE',
          date: new Date(),
          location: { coordinates: [35, 33], name: 'Test' },
          description: 'Short',
          verified: true,
          certainty_level: 'confirmed'
        }
      ];
      
      for (const data of invalidDataCases) {
        const violation = new Violation(data);
        
        try {
          await violation.validate();
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeDefined();
          expect(error.name).toBe('ValidationError');
        }
      }
    });
    
    it('should format dates correctly in toJSON method', () => {
      const testDate = new Date('2023-05-15');
      const violation = new Violation({
        type: 'AIRSTRIKE',
        date: testDate,
        reported_date: testDate,
        location: { coordinates: [35, 33], name: 'Test Location' },
        description: 'Test description that is long enough',
        verified: true,
        certainty_level: 'confirmed',
        victims: [
          {
            gender: 'male',
            status: 'civilian',
            death_date: testDate
          }
        ]
      });
      
      const json = violation.toJSON();
      
      // Check main dates are formatted as YYYY-MM-DD
      expect(json.date).toBe('2023-05-15');
      expect(json.reported_date).toBe('2023-05-15');
      
      // Check victim death date is formatted
      expect(json.victims[0].death_date).toBe('2023-05-15');
    });
  });
});