// routes/favoritesRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');
const Club = require('../models/Club');
const FavoriteTeam = require('../models/FavoriteTeam');
const logger = require('../utils/logger');

/**
 * POST /api/user/favorites/toggle/:clubId
 * Toggle favorite status for a club
 */
router.post('/toggle/:clubId', verifyToken, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user.id;

    // Verify club exists
    const club = await Club.findById(clubId);
    if (!club) {
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

    // Initialize favorites array if doesn't exist
    if (!user.favoriteTeams) {
      user.favoriteTeams = [];
    }

    // Toggle favorite
    const existingFavorite = await FavoriteTeam.findOne({ userId, teamId: clubId });
    const index = user.favoriteTeams.map(String).indexOf(clubId);
    if (index > -1) {
      // Remove from favorites
      user.favoriteTeams.splice(index, 1);
      if (existingFavorite) {
        await FavoriteTeam.deleteOne({ _id: existingFavorite._id });
      }
    } else {
      // Add to favorites
      user.favoriteTeams.push(clubId);
      if (!existingFavorite) {
        await FavoriteTeam.create({ userId, teamId: clubId });
      }
    }

    await user.save();

    res.json({
      success: true,
      message: index > -1 ? 'Removido de favoritos' : 'Adicionado aos favoritos',
      data: {
        isFavorite: index < 0,
        favoriteTeams: user.favoriteTeams
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
    const favorites = await FavoriteTeam.find({ userId }).populate('teamId');

    if (!favorites) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    res.json({
      success: true,
      data: favorites.map((favorite) => ({
        id: favorite._id,
        team: favorite.teamId,
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

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    const favorite = await FavoriteTeam.findOne({ userId, teamId: clubId });
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
    const favorite = await FavoriteTeam.findOneAndUpdate(
      { userId: req.user.id, teamId: req.params.clubId },
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
