const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/me
router.get('/me', (req, res, next) => {
	Promise.resolve(
		requireAuth(req, res, () => authController.getCurrentUser(req, res, next))
	).catch(next);
});

module.exports = router;
