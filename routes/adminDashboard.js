// routes/adminDashboard.js
const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const Club = require('../models/Club');
const Match = require('../models/Match');
const Referee = require('../models/Referee');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// Middlewares
router.use(verifyToken);
router.use(verifyAdmin);

/**
 * GET /api/admin/dashboard/stats
 * Retorna estatísticas principais do sistema
 */
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [
      totalClubs,
      totalMatches,
      totalReferees,
      totalUsers,
      recentLogs,
      monthlyActivity
    ] = await Promise.all([
      Club.countDocuments(),
      Match.countDocuments(),
      Referee.countDocuments(),
      User.countDocuments(),
      AuditLog.find().sort({ createdAt: -1 }).limit(5).lean(),
      getMonthlyActivity()
    ]);

    res.json({
      success: true,
      data: {
        kpis: {
          totalClubs,
          totalMatches,
          totalReferees,
          totalUsers
        },
        recentActivity: recentLogs,
        monthlyActivity,
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar stats', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar estatísticas',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/dashboard/audit-logs
 * Retorna logs de auditoria com paginação
 */
router.get('/dashboard/audit-logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, action, user } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (action) filter.action = action;
    if (user) filter.userId = user;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await AuditLog.countDocuments(filter);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar audit logs', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar logs',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/dashboard/export/:format
 * Exporta dados em JSON, CSV ou PDF
 */
router.get('/dashboard/export/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const { type = 'full' } = req.query; // 'full', 'clubs', 'matches', 'referees'

    let data = {};

    if (type === 'full' || type === 'clubs') {
      data.clubs = await Club.find().select('name island stadium foundedYear').lean();
    }
    if (type === 'full' || type === 'matches') {
      data.matches = await Match.find().select('homeTeam awayTeam date status').lean();
    }
    if (type === 'full' || type === 'referees') {
      data.referees = await Referee.find().select('name email phone island').lean();
    }

    if (format === 'json') {
      res.json({
        success: true,
        data,
        exportedAt: new Date(),
        exportedBy: req.user?.email
      });
    } else if (format === 'csv') {
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
      res.send(csv);
    } else {
      return res.status(400).json({
        success: false,
        message: `Formato ${format} não suportado. Use 'json' ou 'csv'`
      });
    }
  } catch (error) {
    logger.error('Erro ao exportar dashboard', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao exportar dados',
      error: error.message
    });
  }
});

// ========== HELPERS ==========

async function getMonthlyActivity() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const activity = await AuditLog.aggregate([
    {
      $match: {
        createdAt: { $gte: sixMonthsAgo }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  return activity.map(a => ({
    period: `${a._id.month}/${a._id.year}`,
    count: a.count
  }));
}

function convertToCSV(data) {
  let csv = '';

  // Clubs
  if (data.clubs && data.clubs.length > 0) {
    csv += 'CLUBES\n';
    csv += 'Nome,Ilha,Estádio,Fundado\n';
    data.clubs.forEach(club => {
      csv += `"${club.name}","${club.island}","${club.stadium}","${club.foundedYear}"\n`;
    });
    csv += '\n';
  }

  // Matches
  if (data.matches && data.matches.length > 0) {
    csv += 'JOGOS\n';
    csv += 'Equipa Casa,Equipa Fora,Data,Status\n';
    data.matches.forEach(match => {
      csv += `"${match.homeTeam}","${match.awayTeam}","${match.date}","${match.status}"\n`;
    });
    csv += '\n';
  }

  // Referees
  if (data.referees && data.referees.length > 0) {
    csv += 'ÁRBITROS\n';
    csv += 'Nome,Email,Telefone,Ilha\n';
    data.referees.forEach(ref => {
      csv += `"${ref.name}","${ref.email}","${ref.phone}","${ref.island}"\n`;
    });
  }

  return csv;
}

module.exports = router;
