/**
 * refereeDashboardController.js
 * Controlador para dashboard do árbitro
 */
const RefereeProfile = require('../models/RefereeProfile');
const Referee = require('../models/Referee');
const Match = require('../models/Match');
const User = require('../models/User');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * Utilitário: encontrar Referee (entity) ligado ao userId
 */
async function findRefereeByUserId(userId) {
  // Primeiro tentar pelo campo userId no modelo Referee
  let referee = await Referee.findOne({ userId });
  if (referee) return referee;
  // Fallback: procurar RefereeProfile e ver se existe Referee com mesmo email/nome
  const profile = await RefereeProfile.findOne({ userId });
  if (profile) {
    referee = await Referee.findOne({ email: profile.email });
    if (referee) {
      // Ligar automaticamente para futuras queries
      referee.userId = userId;
      await referee.save();
      return referee;
    }
  }
  return null;
}

/**
 * GET /api/referee/my-matches
 * Retorna TODOS os jogos onde este árbitro está na refereeTeam
 */
exports.getMyMatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const referee = await findRefereeByUserId(userId);
    if (!referee) {
      return res.status(404).json({ success: false, message: 'Perfil de árbitro não encontrado' });
    }

    const matches = await Match.find({ 'refereeTeam.referee': referee._id })
      .populate('homeTeam', 'name equipa logo')
      .populate('awayTeam', 'name equipa logo')
      .populate('refereeTeam.referee', 'name tipo photo')
      .populate('competition', 'name')
      .sort({ date: -1 })
      .lean();

    // Adicionar o tipo/função deste árbitro em cada jogo
    const result = matches.map(m => {
      const myEntry = m.refereeTeam?.find(r => r.referee?._id?.toString() === referee._id.toString());
      return {
        ...m,
        myRole: myEntry?.tipo || null
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Erro ao obter jogos do árbitro', error);
    res.status(500).json({ success: false, message: 'Erro ao obter jogos' });
  }
};

/**
 * GET REFEREE DASHBOARD - Obter dados do dashboard
 * GET /api/referee/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Tentar encontrar Referee entity ligado ao user
    const referee = await findRefereeByUserId(userId);

    // Obter perfil do árbitro (antigo modelo)
    const refereeProfile = await RefereeProfile.findOne({ userId });

    if (!referee && !refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    let proximosJogos = [];
    let historicoJogos = [];
    let jogosTotais = 0;

    if (referee) {
      // Usar refereeTeam para encontrar jogos
      proximosJogos = await Match.find({
        'refereeTeam.referee': referee._id,
        status: 'scheduled'
      })
      .populate('homeTeam', 'name equipa logo')
      .populate('awayTeam', 'name equipa logo')
      .populate('refereeTeam.referee', 'name tipo photo')
      .sort({ date: 1 })
      .limit(5)
      .lean();

      historicoJogos = await Match.find({
        'refereeTeam.referee': referee._id,
        status: 'finished'
      })
      .populate('homeTeam', 'name equipa logo')
      .populate('awayTeam', 'name equipa logo')
      .sort({ date: -1 })
      .limit(10)
      .lean();

      jogosTotais = await Match.countDocuments({ 'refereeTeam.referee': referee._id });
    }

    // Estatísticas
    const stats = {
      jogosTotais,
      jogosEsteMes: refereeProfile?.jogosEsteMes || 0,
      relatóriosEnviados: refereeProfile?.relatóriosEnviados || 0,
      avaliacaoMedia: refereeProfile?.avaliacaoMedia || 0
    };

    res.json({
      refereeProfile: refereeProfile || referee,
      proximosJogos,
      historicoJogos,
      stats
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

    const referee = await findRefereeByUserId(userId);
    
    if (!referee) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    const matches = await Match.find({
      'refereeTeam.referee': referee._id,
      status: 'scheduled'
    })
    .populate('homeTeam', 'name equipa logo')
    .populate('awayTeam', 'name equipa logo')
    .populate('refereeTeam.referee', 'name tipo photo')
    .populate('competition', 'name')
    .sort({ date: 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

    const total = await Match.countDocuments({
      'refereeTeam.referee': referee._id,
      status: 'scheduled'
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
      .populate('homeTeam', 'name equipa logo')
      .populate('awayTeam', 'name equipa logo')
      .populate('refereeTeam.referee', 'name tipo photo')
      .populate('competition', 'name')
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

    const userId = req.user.id;

    // Remover confirmação anterior (operação atómica, sem full-document validation)
    await Match.findByIdAndUpdate(
      matchId,
      { $pull: { confirmacoes: { userId } } },
      { runValidators: false }
    );

    // Adicionar nova confirmação
    const updatedMatch = await Match.findByIdAndUpdate(
      matchId,
      { $push: { confirmacoes: { userId, status, data: new Date() } } },
      { new: true, runValidators: false }
    );

    // Notificar admins (sem bloquear a resposta em caso de falha)
    try {
      const admins = await User.find({ role: 'admin' });
      const mensagem = status === 'confirmed' 
        ? `Árbitro confirmou presença no jogo ${match._id}`
        : `Árbitro indicou indisponibilidade para o jogo ${match._id}`;
      const now = Date.now();

      const notifDocs = admins.map(admin => ({
        userId: admin._id,
        tipo: 'jogo_alterado',
        titulo: 'Confirmação de Presença',
        mensagem,
        matchId: match._id,
        icone: status === 'confirmed' ? 'check' : 'alert',
        // dedupeKey único por admin + jogo + evento para evitar E11000
        dedupeKey: `confirm-${match._id}-${admin._id}-${now}`
      }));

      await Notification.insertMany(notifDocs, { ordered: false });
    } catch (notifError) {
      logger.warn('Erro ao criar notificações de confirmação', notifError?.message || notifError);
    }

    res.json({
      message: `Presença ${status === 'confirmed' ? 'confirmada' : 'marcada como indisponível'}`,
      match: updatedMatch
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

    const referee = await findRefereeByUserId(userId);
    const refereeProfile = await RefereeProfile.findOne({ userId });
    
    if (!referee && !refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    let jogosTotais = 0;
    let jogosEsteMes = 0;
    let jogos7Dias = 0;

    if (referee) {
      jogosTotais = await Match.countDocuments({
        'refereeTeam.referee': referee._id,
        status: 'finished'
      });

      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      jogosEsteMes = await Match.countDocuments({
        'refereeTeam.referee': referee._id,
        status: 'finished',
        date: { $gte: inicioMes }
      });

      const inicio7Dias = new Date();
      const fim7Dias = new Date();
      fim7Dias.setDate(fim7Dias.getDate() + 7);

      jogos7Dias = await Match.countDocuments({
        'refereeTeam.referee': referee._id,
        status: 'scheduled',
        date: { $gte: inicio7Dias, $lt: fim7Dias }
      });
    }

    res.json({
      refereeProfile: {
        nomeCompleto: refereeProfile?.nomeCompleto || referee?.name,
        categoria: refereeProfile?.categoria || referee?.tipo,
        avaliacaoMedia: refereeProfile?.avaliacaoMedia || 0
      },
      stats: {
        jogosTotais,
        jogosEsteMes,
        jogos7Dias,
        relatóriosEnviados: refereeProfile?.relatóriosEnviados || 0,
        avaliacaoMedia: refereeProfile?.avaliacaoMedia || 0
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
