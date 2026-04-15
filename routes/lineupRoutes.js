// routes/lineupRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireClubManager } = require('../middleware/auth');
const lineupController = require('../controllers/lineupController');

router.use(requireAuth);
router.use(requireClubManager);

router.post('/', lineupController.saveLineup);
router.get('/match/:matchId', lineupController.getMatchLineups);
router.get('/:matchId/:teamId', lineupController.getTeamLineup);
router.delete('/:matchId/:teamId', lineupController.deleteLineup);

module.exports = router;
