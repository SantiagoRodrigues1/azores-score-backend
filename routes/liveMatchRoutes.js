// routes/liveMatchRoutes.js
const express = require('express');
const router = express.Router();

// Middleware de autenticação
const { requireAuth, requireClubManager } = require('../middleware/auth');

// Controller
const liveMatchController = require('../controllers/liveMatchController');

/**
 * ===== PROTEÇÃO DE ROTAS =====
 * Todas as rotas de live match requerem:
 * - Token JWT válido
 * - Role = "team_manager" ou "admin"
 */
router.use(requireAuth);

/**
 * ===== ENDPOINTS =====
 */

/**
 * POST /live-match/:matchId/start
 * Inicia um jogo
 */
router.post('/:matchId/start', requireClubManager, liveMatchController.startMatch);

/**
 * POST /live-match/:matchId/event
 * Adiciona um evento ao jogo (golo, cartão, substituição, etc.)
 */
router.post('/:matchId/event', requireClubManager, liveMatchController.addMatchEvent);

/**
 * POST /live-match/:matchId/status
 * Atualiza o status do jogo (live, halftime, second_half, finished)
 */
router.post('/:matchId/status', requireClubManager, liveMatchController.updateMatchStatus);

/**
 * POST /live-match/:matchId/finish
 * Termina o jogo e atualiza classificações
 */
router.post('/:matchId/finish', requireClubManager, liveMatchController.finishMatch);

/**
 * POST /live-match/:matchId/added-time
 * Adiciona tempo adicional ao jogo
 */
router.post('/:matchId/added-time', requireClubManager, liveMatchController.addAddedTime);

/**
 * GET /live-match/:matchId
 * Obtém detalhes do jogo com todos os eventos
 */
router.get('/:matchId', liveMatchController.getMatchDetails);

/**
 * GET /live-match/:matchId/lineups
 * Obtém as escalações de ambas as equipas
 */
router.get('/:matchId/lineups', liveMatchController.getMatchLineups);

/**
 * GET /live-match/:matchId/lineup/:teamId
 * Obtém a escalação de uma equipa específica
 */
router.get('/:matchId/lineup/:teamId', liveMatchController.getLineup);

module.exports = router;
