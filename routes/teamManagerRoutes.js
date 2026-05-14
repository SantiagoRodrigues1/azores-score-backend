// routes/teamManagerRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireClubManager } = require('../middleware/auth');
const teamManagerController = require('../controllers/teamManagerController');
const playerController = require('../controllers/playerController');
const logger = require('../utils/logger');

router.use(requireAuth);
router.use(requireClubManager);

router.get('/matches/:id', teamManagerController.getMatchDetails);
router.get('/matches', teamManagerController.listMatches);
router.get('/players', teamManagerController.listPlayers);
router.get('/dashboard', teamManagerController.getDashboard);
router.put('/clubs/:id', teamManagerController.updateOwnClub);

/**
 * GET /api/team-manager/players/team/:teamId
 * Obter todos os jogadores de uma equipa (PÚBLICO - qualquer user consegue)
 */
router.get('/players/team/:teamId', async (req, res) => {
  // Sem autenticação obrigatória - é público
  try {
    return playerController.getTeamPlayers(req, res);
  } catch (error) {
    logger.error('Erro ao obter jogadores da equipa', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/team-manager/players/:playerId
 * Obter detalhes de um jogador (PÚBLICO)
 */
router.get('/players/:playerId', async (req, res) => {
  try {
    return playerController.getPlayerById(req, res);
  } catch (error) {
    logger.error('Erro ao obter detalhe do jogador', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/team-manager/players/team/:teamId/stats
 * Obter estatísticas do plantel (PÚBLICO)
 */
router.get('/players/team/:teamId/stats', async (req, res) => {
  try {
    return playerController.getTeamStats(req, res);
  } catch (error) {
    logger.error('Erro ao obter estatísticas da equipa', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/team-manager/players
 * Criar novo jogador (SÓ TEAM MANAGER ou ADMIN)
 */
router.post('/players', async (req, res) => {
  try {
    return playerController.createPlayer(req, res);
  } catch (error) {
    logger.error('Erro ao criar jogador via team manager', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/team-manager/players/:playerId
 * Atualizar jogador (SÓ TEAM MANAGER DA EQUIPA ou ADMIN)
 */
router.put('/players/:playerId', async (req, res) => {
  try {
    return playerController.updatePlayer(req, res);
  } catch (error) {
    logger.error('Erro ao atualizar jogador via team manager', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/team-manager/players/:playerId
 * Remover jogador (SÓ TEAM MANAGER DA EQUIPA ou ADMIN)
 */
router.delete('/players/:playerId', async (req, res) => {
  try {
    return playerController.deletePlayer(req, res);
  } catch (error) {
    logger.error('Erro ao remover jogador via team manager', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
