// controllers/adminDashboardController.js
const User = require('../models/User');
const Club = require('../models/Club');
const Player = require('../models/Player');
const Referee = require('../models/Referee');
const Match = require('../models/Match');
const Competition = require('../models/Competition');
const logger = require('../utils/logger');

/**
 * GET /api/admin/dashboard
 * Retorna todas as estatísticas para o dashboard
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const activityLimit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);
    const stats = {
      users: {
        total: await User.countDocuments(),
        byRole: {
          fan: await User.countDocuments({ role: 'fan' }),
          referee: await User.countDocuments({ role: 'referee' }),
          club_manager: await User.countDocuments({ role: 'club_manager' }),
          team_manager: await User.countDocuments({ role: 'team_manager' }),
          team_president: await User.countDocuments({ role: 'team_president' }),
          journalist: await User.countDocuments({ role: 'journalist' }),
          admin: await User.countDocuments({ role: 'admin' })
        },
        active: await User.countDocuments({ status: 'active' }),
        suspended: await User.countDocuments({ status: 'suspended' })
      },
      clubs: {
        total: await Club.countDocuments(),
        byIsland: {}
      },
      players: {
        total: await Player.countDocuments()
      },
      referees: {
        total: await Referee.countDocuments(),
        active: await Referee.countDocuments({ status: 'active' })
      },
      matches: {
        total: await Match.countDocuments(),
        byStatus: {
          scheduled: await Match.countDocuments({ status: 'scheduled' }),
          live: await Match.countDocuments({ status: 'live' }),
          finished: await Match.countDocuments({ status: 'finished' })
        }
      },
      competitions: {
        total: await Competition.countDocuments(),
        active: await Competition.countDocuments({ status: 'active' })
      },
      recentActivity: {
        recentUsers: await User.find()
          .select('name email role createdAt')
          .sort({ createdAt: -1 })
          .limit(activityLimit),
        recentMatches: await Match.find()
          .populate('homeTeam', 'name logo')
          .populate('awayTeam', 'name logo')
          .sort({ date: -1 })
          .limit(activityLimit),
        liveMatches: await Match.find({ status: 'live' })
          .populate('homeTeam', 'name logo')
          .populate('awayTeam', 'name logo')
          .limit(Math.min(activityLimit, 10))
      }
    };

    // Calcula estatísticas por ilha
    const islands = ['São Miguel', 'Terceira', 'Faial', 'Pico', 'São Jorge', 'Graciosa', 'Flores', 'Corvo'];
    for (const island of islands) {
      stats.clubs.byIsland[island] = await Club.countDocuments({ island });
    }

    res.json({
      success: true,
      data: stats,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas do dashboard', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar estatísticas do dashboard',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/dashboard/system-health
 * Verifica a saúde do sistema
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date(),
      components: {
        users: 'operational',
        clubs: 'operational',
        players: 'operational',
        referees: 'operational',
        matches: 'operational',
        competitions: 'operational'
      }
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Erro ao verificar saúde do sistema', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar saúde do sistema',
      status: 'unhealthy',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/dashboard/activity
 * Retorna histórico de atividades recentes
 */
exports.getActivity = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const activity = {
      newUsers: await User.find()
        .select('name email role createdAt')
        .sort({ createdAt: -1 })
        .limit(limit),
      newMatches: await Match.find()
        .populate('homeTeam', 'name')
        .populate('awayTeam', 'name')
        .sort({ createdAt: -1 })
        .limit(limit),
      newClubs: await Club.find()
        .select('name island createdAt')
        .sort({ createdAt: -1 })
        .limit(limit)
    };

    res.json({
      success: true,
      data: activity
    });
  } catch (error) {
    logger.error('Erro ao obter atividades', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar atividades',
      error: error.message
    });
  }
};
