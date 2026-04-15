/**
 * refereeDashboardController.js
 * Controlador para dashboard do árbitro
 */
const RefereeProfile = require('../models/RefereeProfile');
const Match = require('../models/Match');
const User = require('../models/User');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * GET REFEREE DASHBOARD - Obter dados do dashboard
 * GET /api/referee/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Obter perfil do árbitro
    const refereeProfile = await RefereeProfile.findOne({ userId })
      .populate('jogosHistorico', 'data hora local equipas competicao status');

    if (!refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    // Próximos jogos (assumindo que Match tem campo com árbitros)
    const proximosJogos = await Match.find({
      arbitros: refereeProfile._id,
      status: 'scheduled',
      data: { $gte: new Date() }
    })
    .sort({ data: 1 })
    .limit(5)
    .lean();

    // Histórico de jogos
    const historicoJogos = await Match.find({
      arbitros: refereeProfile._id,
      status: 'finished'
    })
    .sort({ data: -1 })
    .limit(10)
    .lean();

    // Estatísticas
    const stats = {
      jogosTotais: refereeProfile.jogosTotais || 0,
      jogosEsteMes: refereeProfile.jogosEsteMes || 0,
      relatóriosEnviados: refereeProfile.relatóriosEnviados || 0,
      avaliacaoMedia: refereeProfile.avaliacaoMedia || 0
    };

    // Notificações não lidas
    const notificacoes = await Notification.find({
      userId,
      lida: false
    })
    .sort({ criadoEm: -1 })
    .limit(10)
    .lean();

    res.json({
      refereeProfile,
      proximosJogos,
      historicoJogos,
      stats,
      notificacoes
    });

  } catch (error) {
    logger.error('Erro ao obter dashboard do árbitro', error);
    res.status(500).json({ error: 'Erro ao obter dashboard' });
  }
};

/**
 * GET UPCOMMING MATCHES - Próximos jogos
 * GET /api/referee/matches/upcoming
 */
exports.getUpcomingMatches = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const refereeProfile = await RefereeProfile.findOne({ userId });
    
    if (!refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    const matches = await Match.find({
      arbitros: refereeProfile._id,
      status: 'scheduled',
      data: { $gte: new Date() }
    })
    .sort({ data: 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

    const total = await Match.countDocuments({
      arbitros: refereeProfile._id,
      status: 'scheduled',
      data: { $gte: new Date() }
    });

    res.json({
      matches,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Erro ao obter próximos jogos', error);
    res.status(500).json({ error: 'Erro ao obter próximos jogos' });
  }
};

/**
 * GET MATCH DETAILS - Detalhes de um jogo específico
 * GET /api/referee/matches/:matchId
 */
exports.getMatchDetails = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId)
      .populate('arbitros', 'nomeCompleto numeroCartaoArbitro categoria')
      .lean();

    if (!match) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }

    res.json(match);

  } catch (error) {
    logger.error('Erro ao obter detalhes do jogo', error);
    res.status(500).json({ error: 'Erro ao obter detalhes do jogo' });
  }
};

/**
 * CONFIRM PRESENCE - Confirmar presença no jogo
 * POST /api/referee/matches/:matchId/confirm
 */
exports.confirmPresence = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { status } = req.body; // 'confirmed' ou 'unavailable'

    if (!['confirmed', 'unavailable'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const match = await Match.findById(matchId);
    
    if (!match) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }

    // Guardar confirmação (pode ser armazenada num array de confirmações)
    if (!match.confirmacoes) {
      match.confirmacoes = [];
    }

    const userId = req.user.id;
    
    // Remover confirmação anterior se existir
    match.confirmacoes = match.confirmacoes.filter(c => c.userId.toString() !== userId);
    
    // Adicionar nova confirmação
    match.confirmacoes.push({
      userId,
      status,
      data: new Date()
    });

    await match.save();

    // Notificar admins
    const admins = await User.find({ role: 'admin' });
    const mensagem = status === 'confirmed' 
      ? `Árbitro confirmou presença no jogo ${match._id}`
      : `Árbitro indicou indisponibilidade para o jogo ${match._id}`;

    for (const admin of admins) {
      const notification = new Notification({
        userId: admin._id,
        tipo: 'jogo_alterado',
        titulo: 'Confirmação de Presença',
        mensagem,
        matchId: match._id,
        icone: status === 'confirmed' ? 'check' : 'alert'
      });
      
      await notification.save();
    }

    res.json({
      message: `Presença ${status === 'confirmed' ? 'confirmada' : 'marcada como indisponível'}`,
      match
    });

  } catch (error) {
    logger.error('Erro ao confirmar presença', error);
    res.status(500).json({ error: 'Erro ao confirmar presença' });
  }
};

/**
 * GET REFEREE STATISTICS - Estatísticas do árbitro
 * GET /api/referee/statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    const userId = req.user.id;

    const refereeProfile = await RefereeProfile.findOne({ userId });
    
    if (!refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    // Total de jogos
    const jogosTotais = await Match.countDocuments({
      arbitros: refereeProfile._id,
      status: 'finished'
    });

    // Jogos este mês
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    
    const jogosEsteMes = await Match.countDocuments({
      arbitros: refereeProfile._id,
      status: 'finished',
      data: { $gte: inicioMes }
    });

    // Próximos 7 dias
    const inicio7Dias = new Date();
    const fim7Dias = new Date();
    fim7Dias.setDate(fim7Dias.getDate() + 7);

    const jogos7Dias = await Match.countDocuments({
      arbitros: refereeProfile._id,
      status: 'scheduled',
      data: { 
        $gte: inicio7Dias, 
        $lt: fim7Dias 
      }
    });

    res.json({
      refereeProfile: {
        nomeCompleto: refereeProfile.nomeCompleto,
        categoria: refereeProfile.categoria,
        avaliacaoMedia: refereeProfile.avaliacaoMedia
      },
      stats: {
        jogosTotais,
        jogosEsteMes,
        jogos7Dias,
        relatóriosEnviados: refereeProfile.relatóriosEnviados || 0,
        avaliacaoMedia: refereeProfile.avaliacaoMedia || 0
      }
    });

  } catch (error) {
    logger.error('Erro ao obter estatísticas do árbitro', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
};

/**
 * GET REFEREE AVAILABILITY - Disponibilidade semanal
 * GET /api/referee/availability
 */
exports.getAvailability = async (req, res) => {
  try {
    const userId = req.user.id;

    const refereeProfile = await RefereeProfile.findOne({ userId })
      .select('disponibilidadeSemanal');

    if (!refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    res.json({
      disponibilidadeSemanal: refereeProfile.disponibilidadeSemanal
    });

  } catch (error) {
    logger.error('Erro ao obter disponibilidade', error);
    res.status(500).json({ error: 'Erro ao obter disponibilidade' });
  }
};

/**
 * UPDATE AVAILABILITY - Atualizar disponibilidade semanal
 * PUT /api/referee/availability
 */
exports.updateAvailability = async (req, res) => {
  try {
    const userId = req.user.id;
    const disponibilidadeSemanal = req.body;

    const refereeProfile = await RefereeProfile.findOneAndUpdate(
      { userId },
      { disponibilidadeSemanal },
      { new: true }
    ).select('disponibilidadeSemanal');

    if (!refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    res.json({
      message: 'Disponibilidade atualizada',
      disponibilidadeSemanal: refereeProfile.disponibilidadeSemanal
    });

  } catch (error) {
    logger.error('Erro ao atualizar disponibilidade', error);
    res.status(500).json({ error: 'Erro ao atualizar disponibilidade' });
  }
};
