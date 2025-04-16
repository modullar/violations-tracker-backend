const request = require('supertest');
const mongoose = require('mongoose');
const server = require('../server');
const User = require('../models/User');

let userToken;
let userId;

afterAll(async () => {
  await mongoose.disconnect();
  server.close();
});

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          organization: 'Test Organization'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
      
      // Save token for later tests
      userToken = res.body.token;
      
      // Verify user was created
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).toBeTruthy();
      expect(user.name).toBe('Test User');
      userId = user._id.toString();
    });
    
    it('should validate registration input', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'T', // Too short
          email: 'invalid-email',
          password: '123' // Too short
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
    
    it('should not allow duplicate emails', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'Another User',
          email: 'test@example.com', // Already used
          password: 'password123'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
    });
    
    it('should not login with invalid credentials', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('GET /api/auth/me', () => {
    it('should get current user profile', async () => {
      const res = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'Test User');
      expect(res.body.data).toHaveProperty('email', 'test@example.com');
    });
    
    it('should not allow access without token', async () => {
      const res = await request(server).get('/api/auth/me');
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('GET /api/auth/logout', () => {
    it('should log out user', async () => {
      const res = await request(server).get('/api/auth/logout');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({});
    });
  });
});