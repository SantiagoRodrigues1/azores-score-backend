const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);
router.get('/', notificationController.listNotifications);
router.post('/read-all', notificationController.markAllAsRead);
router.post('/:id/read', notificationController.markAsRead);
router.post('/:id/unread', notificationController.markAsUnread);

module.exports = router;
