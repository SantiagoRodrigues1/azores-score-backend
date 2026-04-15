// routes/playerRoutes.js
/**
 * Player Routes - PÚBLICAS
 * Qualquer user consegue visualizar plantel
 * Autenticação obrigatória apenas para POST/PUT/DELETE
 */

const express = require('express');
const router = express.Router();

// Middlewares
const { requireAuth, requireClubManager } = require('../middleware/auth');
const playerController = require('../controllers/playerController');
const logger = require('../utils/logger');

// ==================== PUBLIC GET ENDPOINTS ====================

/**
 * GET /api/players/team/:teamId
 * Obter todos os jogadores de uma equipa
 */
router.get('/team/:teamId', async (req, res) => {
  try {
    return playerController.getTeamPlayers(req, res);
  } catch (error) {
    logger.error('Erro ao obter jogadores', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar jogadores',
      error: error.message
    });
  }
});

/**
 * GET /api/players/:playerId
 * Obter detalhes de um jogador específico
 */
router.get('/:playerId', async (req, res) => {
  try {
    return playerController.getPlayerById(req, res);
  } catch (error) {
    logger.error('Erro ao obter jogador', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar jogador',
      error: error.message
    });
  }
});

/**
 * GET /api/players/team/:teamId/stats
 * Obter estatísticas do plantel
 */
router.get('/team/:teamId/stats', async (req, res) => {
  try {
    return playerController.getTeamStats(req, res);
  } catch (error) {
    logger.error('Erro ao obter estatísticas do plantel', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      error: error.message
    });
  }
});

// ==================== PROTECTED ENDPOINTS (Autenticação Obrigatória) ====================

/**
 * POST /api/players
 * Criar novo jogador (SÓ TEAM MANAGER ou ADMIN)
 */
router.post('/', requireAuth, requireClubManager, async (req, res) => {
  try {
    return playerController.createPlayer(req, res);
  } catch (error) {
    logger.error('Erro ao criar jogador', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar jogador',
      error: error.message
    });
  }
});

/**
 * PUT /api/players/:playerId
 * Atualizar jogador (SÓ TEAM MANAGER DA EQUIPA ou ADMIN)
 */
router.put('/:playerId', requireAuth, requireClubManager, async (req, res) => {
  try {
    return playerController.updatePlayer(req, res);
  } catch (error) {
    logger.error('Erro ao atualizar jogador', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar jogador',
      error: error.message
    });
  }
});

/**
 * DELETE /api/players/:playerId
 * Remover jogador (SÓ TEAM MANAGER DA EQUIPA ou ADMIN)
 */
router.delete('/:playerId', requireAuth, requireClubManager, async (req, res) => {
  try {
    return playerController.deletePlayer(req, res);
  } catch (error) {
    logger.error('Erro ao remover jogador', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover jogador',
      error: error.message
    });
  }
});

module.exports = router;
