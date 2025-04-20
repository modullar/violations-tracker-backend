const mongoose = require('mongoose');
const User = require('../../models/User');
const userController = require('../../controllers/userController');

describe('User Controller', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      user: { id: new mongoose.Types.ObjectId() }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  describe('getUsers', () => {
    it('should get all users without passwords', async () => {
      const mockUsers = [
        { _id: new mongoose.Types.ObjectId(), name: 'User 1' },
        { _id: new mongoose.Types.ObjectId(), name: 'User 2' }
      ];

      User.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      await userController.getUsers(req, res, next);

      expect(User.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: mockUsers.length,
        data: mockUsers
      });
    });
  });

  describe('getUser', () => {
    it('should get a single user by ID', async () => {
      const userId = new mongoose.Types.ObjectId();
      req.params.id = userId;

      const mockUser = {
        _id: userId,
        name: 'Test User'
      };

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await userController.getUser(req, res, next);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockUser
      });
    });

    it('should return 404 when user is not found', async () => {
      req.params.id = new mongoose.Types.ObjectId();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await userController.getUser(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const userData = {
        name: 'New User',
        email: 'test@example.com',
        password: 'password123'
      };
      req.body = userData;

      const mockCreatedUser = {
        _id: new mongoose.Types.ObjectId(),
        ...userData
      };

      User.create = jest.fn().mockResolvedValue(mockCreatedUser);

      await userController.createUser(req, res, next);

      expect(User.create).toHaveBeenCalledWith(userData);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockCreatedUser
      });
    });
  });

  describe('updateUser', () => {
    it('should update an existing user', async () => {
      const userId = new mongoose.Types.ObjectId();
      req.params.id = userId;
      req.body = { name: 'Updated Name' };

      const mockUpdatedUser = {
        _id: userId,
        name: 'Updated Name'
      };

      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUpdatedUser)
      });

      await userController.updateUser(req, res, next);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        req.body,
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockUpdatedUser
      });
    });

    it('should return 404 when updating non-existent user', async () => {
      req.params.id = new mongoose.Types.ObjectId();

      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await userController.updateUser(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });

  describe('deleteUser', () => {
    it('should delete an existing user', async () => {
      const userId = new mongoose.Types.ObjectId();
      req.params.id = userId;

      const mockDeletedUser = { _id: userId };

      User.findByIdAndDelete = jest.fn().mockResolvedValue(mockDeletedUser);

      await userController.deleteUser(req, res, next);

      expect(User.findByIdAndDelete).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {}
      });
    });

    it('should return 404 when deleting non-existent user', async () => {
      req.params.id = new mongoose.Types.ObjectId();

      User.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      await userController.deleteUser(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });
}); 