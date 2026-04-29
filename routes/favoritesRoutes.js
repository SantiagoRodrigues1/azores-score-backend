// routes/favoritesRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');
const Club = require('../models/Club');
const FavoriteTeam = require('../models/FavoriteTeam');
const teamService = require('../services/teamService');
const logger = require('../utils/logger');

async function resolveTeamMetadata(teamId) {
  const normalizedTeamId = String(teamId || '').trim();
  if (!normalizedTeamId) return null;

  if (mongoose.Types.ObjectId.isValid(normalizedTeamId)) {
    const club = await Club.findById(normalizedTeamId).lean();
    if (club) {
      return {
        _id: normalizedTeamId,
        name: club.name,
        equipa: club.name,
        ilha: club.island || 'Açores',
        logo: club.logo || '🏆'
      };
    }
  }

  const teams = await teamService.listTeams();
  const synthetic = teams.find((entry) => String(entry._id) === normalizedTeamId);
  if (!synthetic) return null;

  return {
    _id: String(synthetic._id),
    name: synthetic.name || synthetic.equipa,
    equipa: synthetic.equipa || synthetic.name,
    ilha: synthetic.ilha || 'Açores',
    logo: synthetic.logo || '🏆'
  };
}

/**
 * POST /api/user/favorites/toggle/:clubId
 * Toggle favorite status for a club
 */
router.post('/toggle/:clubId', verifyToken, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user.id;
    const normalizedTeamId = String(clubId || '').trim();

    if (!normalizedTeamId) {
      return res.status(400).json({
        success: false,
        message: 'ID de equipa inválido'
      });
    }

    // Verify team exists (supports Club ObjectId and synthetic team ids)
    const teamMeta = await resolveTeamMetadata(normalizedTeamId);
    if (!teamMeta) {
      return res.status(404).json({
        success: false,
        message: 'Clube não encontrado'
      });
    }

    // Get user
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    // Toggle favorite
    const existingFavorite = await FavoriteTeam.findOne({ userId, teamId: normalizedTeamId });

    if (existingFavorite) {
      await FavoriteTeam.deleteOne({ _id: existingFavorite._id });
    } else {
      await FavoriteTeam.create({ userId, teamId: normalizedTeamId });
    }

    res.json({
      success: true,
      message: existingFavorite ? 'Removido de favoritos' : 'Adicionado aos favoritos',
      data: {
        isFavorite: !existingFavorite,
        team: {
          _id: teamMeta._id,
          name: teamMeta.name,
          island: teamMeta.ilha,
          logo: teamMeta.logo
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao atualizar favorito', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar favorito',
      error: error.message
    });
  }
});

/**
 * GET /api/user/favorites
 * Get user's favorite teams
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const favorites = await FavoriteTeam.find({ userId }).lean();

    const teams = await teamService.listTeams();
    const teamMap = new Map(teams.map((team) => [String(team._id), team]));

    res.json({
      success: true,
      data: favorites.map((favorite) => ({
        id: favorite._id,
        team: {
          _id: String(favorite.teamId),
          name: teamMap.get(String(favorite.teamId))?.equipa || teamMap.get(String(favorite.teamId))?.name || 'Equipa',
          island: teamMap.get(String(favorite.teamId))?.ilha || 'Açores',
          logo: teamMap.get(String(favorite.teamId))?.logo || '🏆'
        },
        notifications: favorite.notifications
      }))
    });
  } catch (error) {
    logger.error('Erro ao obter favoritos', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter favoritos',
      error: error.message
    });
  }
});

/**
 * GET /api/user/favorites/check/:clubId
 * Check if user has club as favorite
 */
router.get('/check/:clubId', verifyToken, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user.id;
    const normalizedTeamId = String(clubId || '').trim();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    const favorite = await FavoriteTeam.findOne({ userId, teamId: normalizedTeamId });
    const isFavorite = Boolean(favorite);

    res.json({
      success: true,
      data: { isFavorite, notifications: favorite?.notifications || null }
    });
  } catch (error) {
    logger.error('Erro ao verificar favorito', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar favorito',
      error: error.message
    });
  }
});

router.put('/settings/:clubId', verifyToken, async (req, res) => {
  try {
    const normalizedTeamId = String(req.params.clubId || '').trim();

    const favorite = await FavoriteTeam.findOneAndUpdate(
      { userId: req.user.id, teamId: normalizedTeamId },
      { notifications: req.body.notifications },
      { new: true }
    );

    if (!favorite) {
      return res.status(404).json({ success: false, message: 'Favorito não encontrado' });
    }

    res.json({ success: true, data: favorite });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar notificações', error: error.message });
  }
});

module.exports = router;
