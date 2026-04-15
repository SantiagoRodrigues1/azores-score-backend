// controllers/adminMatchController.js
const Match = require('../models/Match');
const Club = require('../models/Club');
const Competition = require('../models/Competition');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * GET /api/admin/matches
 * Lista todos os jogos com filtros
 */
exports.getAllMatches = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, competition, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.status = status;
    if (competition) filter.competition = competition;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const matches = await Match.find(filter)
      .populate('homeTeam', 'name logo')
      .populate('awayTeam', 'name logo')
      .populate({ path: 'referees.main', select: 'name' })
      .populate({ path: 'referees.assistant1', select: 'name' })
      .populate({ path: 'referees.assistant2', select: 'name' })
      .populate({ path: 'referees.fourthReferee', select: 'name' })
      .populate('competition', 'name')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const total = await Match.countDocuments(filter);

    res.json({
      success: true,
      data: matches,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Erro ao listar jogos', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar jogos',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/matches
 * Cria um novo jogo
 */
exports.createMatch = async (req, res) => {
  try {
    const { homeTeam, awayTeam, date, time, competition, stadium, referee } = req.body;

    if (!homeTeam || !awayTeam || !date) {
      return res.status(400).json({
        success: false,
        message: 'Equipa de casa, equipa visitante e data são obrigatórias'
      });
    }

    if (homeTeam === awayTeam) {
      return res.status(400).json({
        success: false,
        message: 'A equipa de casa não pode ser a mesma que a visitante'
      });
    }

    const homeTeamExists = await Club.findById(homeTeam);
    const awayTeamExists = await Club.findById(awayTeam);

    if (!homeTeamExists || !awayTeamExists) {
      return res.status(404).json({
        success: false,
        message: 'Uma ou ambas as equipas não existem'
      });
    }

    // Validar ObjectIds
    let competitionId = null;
    if (competition) {
      try {
        if (mongoose.Types.ObjectId.isValid(competition)) {
          competitionId = new mongoose.Types.ObjectId(competition);
        } else {
          return res.status(400).json({
            success: false,
            message: 'ID de competição inválido'
          });
        }
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Competição inválida'
        });
      }
    }

    const newMatch = new Match({
      homeTeam,
      awayTeam,
      date,
      time,
      competition: competitionId,
      stadium,
      referee,
      referees: referee ? { main: referee } : undefined,
      status: 'scheduled'
    });

    await newMatch.save();

    // Popular antes de retornar
    await newMatch.populate('homeTeam', 'name equipa');
    await newMatch.populate('awayTeam', 'name equipa');

    res.status(201).json({
      success: true,
      message: 'Jogo criado com sucesso',
      data: newMatch
    });
  } catch (error) {
    logger.error('Erro ao criar jogo', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar jogo',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/matches/:id
 * Obtém detalhes de um jogo
 */
exports.getMatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id)
      .populate('homeTeam')
      .populate('awayTeam')
      .populate({ path: 'referees.main', select: 'name' })
      .populate({ path: 'referees.assistant1', select: 'name' })
      .populate({ path: 'referees.assistant2', select: 'name' })
      .populate({ path: 'referees.fourthReferee', select: 'name' })
      .populate('referee')
      .populate('competition')
      .populate('events.player');

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    // Converter para objeto e mapear IDs
    const matchData = match.toObject();
    matchData.id = matchData._id?.toString();
    
    if (matchData.homeTeam) {
      matchData.homeTeam.id = matchData.homeTeam._id?.toString() || matchData.homeTeam.id;
    }
    if (matchData.awayTeam) {
      matchData.awayTeam.id = matchData.awayTeam._id?.toString() || matchData.awayTeam.id;
    }
    if (matchData.referee) {
      matchData.referee.id = matchData.referee._id?.toString() || matchData.referee.id;
    }

    // Normalizar campo `referees` se existir
    if (matchData.referees) {
      ['main', 'assistant1', 'assistant2', 'fourthReferee'].forEach(pos => {
        if (matchData.referees[pos]) {
          const ref = matchData.referees[pos];
          matchData.referees[pos] = {
            id: ref._id?.toString() || ref.id,
            name: ref.name || ref.nome || null
          };
        }
      });
    }

    if (matchData.competition) {
      matchData.competition.id = matchData.competition._id?.toString() || matchData.competition.id;
    }

    res.json({
      success: true,
      data: matchData
    });
  } catch (error) {
    logger.error('Erro ao obter jogo', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar jogo',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/matches/:id
 * Edita um jogo
 */
exports.updateMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, stadium, referee, attendance, notes } = req.body;

    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    if (date) match.date = date;
    if (time) match.time = time;
    if (stadium) match.stadium = stadium;
    if (referee) match.referee = referee;
    if (attendance) match.attendance = attendance;
    if (notes) match.notes = notes;
    match.updatedAt = new Date();

    await match.save();

    res.json({
      success: true,
      message: 'Jogo atualizado com sucesso',
      data: match
    });
  } catch (error) {
    logger.error('Erro ao atualizar jogo', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar jogo',
      error: error.message
    });
  }
};

/**
 * PATCH /api/admin/matches/:id/score
 * Atualiza o resultado em tempo real
 */
exports.updateMatchScore = async (req, res) => {
  try {
    const { id } = req.params;
    const { homeScore, awayScore, status } = req.body;

    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    if (homeScore !== undefined) match.homeScore = homeScore;
    if (awayScore !== undefined) match.awayScore = awayScore;
    if (status) match.status = status;
    match.updatedAt = new Date();

    await match.save();

    // TODO: Emitir via Socket.io para atualizar em tempo real
    // io.emit('match:updated', match);

    res.json({
      success: true,
      message: 'Resultado atualizado com sucesso',
      data: match
    });
  } catch (error) {
    logger.error('Erro ao atualizar resultado', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar resultado',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/matches/:id/events
 * Adiciona um evento ao jogo (golo, cartão, etc)
 */
exports.addMatchEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, player, minute, team, assistedBy } = req.body;

    const validTypes = ['goal', 'yellow_card', 'red_card', 'substitution', 'own_goal'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Tipo de evento inválido. Valores aceitos: ${validTypes.join(', ')}`
      });
    }

    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    const event = {
      type,
      player,
      minute: parseInt(minute) || 0,
      team,
      assistedBy,
      timestamp: new Date()
    };

    match.events.push(event);

    // Atualiza automaticamente o resultado se for golo
    if (type === 'goal' || type === 'own_goal') {
      if (match.homeTeam.toString() === team) {
        match.homeScore += 1;
      } else if (match.awayTeam.toString() === team) {
        match.awayScore += 1;
      }
    }

    match.updatedAt = new Date();
    await match.save();

    // TODO: Emitir via Socket.io
    // io.emit('match:event', { matchId: id, event });

    res.json({
      success: true,
      message: 'Evento adicionado com sucesso',
      data: match
    });
  } catch (error) {
    logger.error('Erro ao adicionar evento', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar evento',
      error: error.message
    });
  }
};

/**
 * DELETE /api/admin/matches/:id
 * Apaga um jogo
 */
exports.deleteMatch = async (req, res) => {
  try {
    const { id } = req.params;

    const match = await Match.findByIdAndDelete(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Jogo apagado com sucesso',
      data: match
    });
  } catch (error) {
    logger.error('Erro ao apagar jogo', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao apagar jogo',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/matches/:id/referees
 * Atribui árbitros (main, assistant1, assistant2, fourthReferee) ao jogo
 */
exports.assignReferees = async (req, res) => {
  try {
    const { id } = req.params;
    const { main, assistant1, assistant2, fourthReferee } = req.body;

    if (!main || !assistant1 || !assistant2 || !fourthReferee) {
      return res.status(400).json({
        success: false,
        message: 'Devem ser fornecidos os 4 árbitros: main, assistant1, assistant2, fourthReferee'
      });
    }

    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Jogo não encontrado' });
    }

    match.referees = {
      main,
      assistant1,
      assistant2,
      fourthReferee
    };

    // manter campo legacy `referee` apontando para o árbitro principal
    match.referee = main;
    match.updatedAt = new Date();

    await match.save();

    // Popular antes de retornar
    await match.populate('homeTeam', 'name');
    await match.populate('awayTeam', 'name');
    await match.populate({ path: 'referees.main', select: 'name' });
    await match.populate({ path: 'referees.assistant1', select: 'name' });
    await match.populate({ path: 'referees.assistant2', select: 'name' });
    await match.populate({ path: 'referees.fourthReferee', select: 'name' });

    res.json({
      success: true,
      message: 'Árbitros atribuídos com sucesso',
      data: match
    });
  } catch (error) {
    logger.error('Erro ao atribuir árbitros', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atribuir árbitros',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/matches/stats
 * Estatísticas dos jogos
 */
exports.getMatchesStats = async (req, res) => {
  try {
    const stats = {
      total: await Match.countDocuments(),
      byStatus: {
        scheduled: await Match.countDocuments({ status: 'scheduled' }),
        live: await Match.countDocuments({ status: 'live' }),
        finished: await Match.countDocuments({ status: 'finished' }),
        postponed: await Match.countDocuments({ status: 'postponed' }),
        cancelled: await Match.countDocuments({ status: 'cancelled' })
      },
      liveMatches: await Match.find({ status: 'live' })
        .populate('homeTeam', 'name')
        .populate('awayTeam', 'name')
        .limit(5)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas de jogos', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message
    });
  }
};
