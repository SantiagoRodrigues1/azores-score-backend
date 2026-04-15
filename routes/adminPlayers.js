const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const adminPlayerController = require('../controllers/adminPlayerController');

router.use(verifyToken);
router.use(verifyAdmin);

router.get('/', adminPlayerController.listPlayers);
router.post('/', adminPlayerController.createPlayer);
router.put('/:id', adminPlayerController.updatePlayer);
router.delete('/:id', adminPlayerController.deletePlayer);

module.exports = router;
