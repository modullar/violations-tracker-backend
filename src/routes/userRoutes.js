const express = require('express');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/userController');

const {
  validateRequest,
  userRegistrationRules,
  idParamRules
} = require('../middleware/validators');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes are protected and for admin only
router.use(protect);
router.use(authorize('admin'));

router
  .route('/')
  .get(getUsers)
  .post(userRegistrationRules, validateRequest, createUser);

router
  .route('/:id')
  .get(idParamRules, validateRequest, getUser)
  .put(idParamRules, validateRequest, updateUser)
  .delete(idParamRules, validateRequest, deleteUser);

module.exports = router;