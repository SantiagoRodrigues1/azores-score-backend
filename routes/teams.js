const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const teamController = require('../controllers/teamController');
const adminPlayerController = require('../controllers/adminPlayerController');

router.get('/teams', teamController.listTeams);
router.get('/teams/:teamId', verifyToken, teamController.getProtectedTeamRoster);
router.get('/teams/:campeonato/:teamName/players', teamController.listPlayersByTeamName);
router.get('/players/:playerId', teamController.getPlayerDetails);

router.post('/teams/:campeonato/:teamName/players', verifyToken, verifyAdmin, adminPlayerController.createPlayer);
router.put('/teams/:campeonato/:teamName/players/:id', verifyToken, verifyAdmin, adminPlayerController.updatePlayer);
router.delete('/teams/:campeonato/:teamName/players/:id', verifyToken, verifyAdmin, adminPlayerController.deletePlayer);

module.exports = router;