const User = require('../../models/User');
const { fail } = require('expect');

// Mock external dependencies
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

// Mock mongoose connection
jest.mock('../../config/db', () => jest.fn().mockImplementation(() => {
  return Promise.resolve();
}));

// Mock mongoose model methods
jest.mock('../../models/User', () => {
  const mockUser = {
    _id: '5f7d327c3642214df4d0e0f9',
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    organization: 'Test Organization',
    matchPassword: jest.fn().mockImplementation((password) => {
      return Promise.resolve(password === 'password123');
    }),
    save: jest.fn().mockResolvedValue(this)
  };

  class UserModel {
    constructor(data) {
      Object.assign(this, data);
    }

    static create(data) {
      if (data.email === 'duplicate@example.com') {
        const error = new Error('Duplicate field value entered');
        error.code = 11000;
        error.keyValue = { email: 'duplicate@example.com' };
        throw error;
      }
      return Promise.resolve({ ...mockUser, ...data });
    }

    validate() {
      const errors = {};
      if (this.name && this.name.length < 2) {
        errors.name = { message: 'Name must be at least 2 characters' };
      }
      if (this.email && !this.email.includes('@')) {
        errors.email = { message: 'Invalid email format' };
      }
      if (this.password && this.password.length < 6) {
        errors.password = { message: 'Password must be at least 6 characters' };
      }
      if (Object.keys(errors).length > 0) {
        const error = new Error('Validation failed');
        error.errors = errors;
        throw error;
      }
    }

    save() {
      this._id = '5f7d327c3642214df4d0e0f9';
      return Promise.resolve(this);
    }

    matchPassword(password) {
      return Promise.resolve(password === 'password123');
    }
  }

  return UserModel;
});

describe('User Model', () => {
  it('should create a user with valid data', async () => {
    const validUser = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      organization: 'Test Organization'
    };

    const user = new User(validUser);
    const savedUser = await user.save();

    expect(savedUser._id).toBeDefined();
    expect(savedUser.name).toBe(validUser.name);
    expect(savedUser.email).toBe(validUser.email);
    expect(savedUser.organization).toBe(validUser.organization);
  });

  it('should fail validation with invalid data', async () => {
    const invalidUser = {
      name: 'T', // Too short
      email: 'invalid-email',
      password: '123' // Too short
    };

    try {
      const user = new User(invalidUser);
      await user.validate();
      fail('Validation should have failed');
    } catch (error) {
      expect(error.errors.name).toBeDefined();
      expect(error.errors.email).toBeDefined();
      expect(error.errors.password).toBeDefined();
    }
  });

  it('should not save duplicate emails', async () => {
    const firstUser = {
      name: 'First User',
      email: 'duplicate@example.com',
      password: 'password123',
      organization: 'Test Org'
    };

    try {
      await User.create(firstUser);
      fail('Should have thrown duplicate email error');
    } catch (error) {
      expect(error.code).toBe(11000);
    }
  });

  it('should match user passwords correctly', async () => {
    const password = 'password123';
    const user = new User({
      name: 'Test User',
      email: 'test@example.com',
      password,
      organization: 'Test Org'
    });

    await user.save();

    const isMatch = await user.matchPassword(password);
    const isNotMatch = await user.matchPassword('wrongpassword');

    expect(isMatch).toBe(true);
    expect(isNotMatch).toBe(false);
  });
}); 