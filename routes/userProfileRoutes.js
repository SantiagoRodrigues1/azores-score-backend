// routes/userProfileRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  updateProfile,
  changePassword,
  changeEmail,
} = require('../controllers/userProfileController');

// All routes require authentication
router.use(requireAuth);

router.put('/profile', updateProfile);
router.put('/change-password', changePassword);
router.put('/change-email', changeEmail);

module.exports = router;
