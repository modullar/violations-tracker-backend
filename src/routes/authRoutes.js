const express = require('express');
const {
  register,
  login,
  getMe,
  logout
} = require('../controllers/authController');

const {
  validateRequest,
  userRegistrationRules,
  userLoginRules
} = require('../middleware/validators');

const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', userRegistrationRules, validateRequest, register);
router.post('/login', userLoginRules, validateRequest, login);
router.get('/me', protect, getMe);
router.get('/logout', logout);

module.exports = router;