// routes/lineupViewRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const Lineup = require('../models/Lineup');
const Match = require('../models/Match');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * GET /api/lineups/match/:matchId/all
 * Get all lineups for a specific match (PUBLIC - sem autenticação obrigatória)
 */
router.get('/match/:matchId/all', async (req, res) => {
  try {
    const { matchId } = req.params;

    // Get the match
    const match = await Match.findById(matchId).populate('homeTeam awayTeam');
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    // Get ALL lineups for this match (public view - sem restrições)
    const lineups = await Lineup.find({
      match: matchId
    }).populate('team starters.playerId substitutes.playerId createdBy');

    // Format response - retorna todos os lineups
    const formattedLineups = lineups.map(lineup => ({
      lineupId: lineup._id,
      matchId: lineup.match,
      teamName: lineup.team?.name || 'Unknown',
      teamId: lineup.team?._id,
      formation: lineup.formation,
      starters: lineup.starters || [],
      substitutes: lineup.substitutes || [],
      submittedAt: lineup.updatedAt || lineup.createdAt,
      submittedBy: lineup.createdBy?.email || 'Unknown',
      status: lineup.status
    }));

    res.json({
      success: true,
      data: {
        match: {
          id: match._id,
          homeTeam: match.homeTeam?.name,
          awayTeam: match.awayTeam?.name,
          date: match.date,
          venue: match.venue
        },
        lineups: formattedLineups
      }
    });
  } catch (error) {
    logger.error('Failed to fetch public match lineups', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter planteis',
      error: error.message
    });
  }
});

/**
 * GET /api/lineups/:lineupId
 * Get a specific lineup for viewing (PÚBLICO - qualquer pessoa pode ver)
 */
router.get('/:lineupId', async (req, res) => {
  try {
    const { lineupId } = req.params;

    const lineup = await Lineup.findById(lineupId)
      .populate('team match starters.playerId substitutes.playerId createdBy');

    if (!lineup) {
      return res.status(404).json({
        success: false,
        message: 'Escalação não encontrada'
      });
    }

    // Format response
    res.json({
      success: true,
      data: {
        lineupId: lineup._id,
        matchId: lineup.match?._id,
        teamName: lineup.team?.name,
        teamId: lineup.team?._id,
        formation: lineup.formation,
        starters: lineup.starters || [],
        substitutes: lineup.substitutes || [],
        submittedAt: lineup.updatedAt || lineup.createdAt,
        submittedBy: lineup.createdBy?.email,
        status: lineup.status
      }
    });
  } catch (error) {
    logger.error('Failed to fetch lineup', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter escalação',
      error: error.message
    });
  }
});

/**
 * GET /api/lineups/notifications
 * Get notifications for favorite teams' lineups (PROTEGIDO - requer autenticação)
 */
router.get('/notifications/lineups', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user and favorites
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    const favoriteTeams = user.favoriteTeams || [];
    if (favoriteTeams.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get recent lineups for favorite teams
    const lineups = await Lineup.find({
      team: { $in: favoriteTeams }
    })
      .populate('team match')
      .sort({ updatedAt: -1 })
      .limit(10);

    // Format as notifications
    const notifications = lineups.map(lineup => ({
      id: lineup._id.toString(),
      type: 'lineup',
      title: `Escalação disponível`,
      message: `O plantel do ${lineup.team?.name} está disponível`,
      matchId: lineup.match?._id,
      teamId: lineup.team?._id,
      teamName: lineup.team?.name,
      timestamp: lineup.updatedAt || lineup.createdAt,
      read: false
    }));

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    logger.error('Failed to fetch lineup notifications', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter notificações',
      error: error.message
    });
  }
});

module.exports = router;
