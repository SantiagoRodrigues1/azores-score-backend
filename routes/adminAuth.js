const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

router.post('/register', verifyToken, verifyAdmin, adminAuthController.register);
router.post('/login', adminAuthController.login);
router.get('/verify', adminAuthController.verify);

module.exports = router;
