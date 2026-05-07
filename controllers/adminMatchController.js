// controllers/adminMatchController.js
const Match = require('../models/Match');
const Club = require('../models/Club');
const Competition = require('../models/Competition');
const Referee = require('../models/Referee');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const REQUIRED_REFEREE_TEAM_TYPES = [
  'Árbitro Principal',
  'Assistente 1',
  'Assistente 2',
  '4º Árbitro'
];

const REFEREE_TYPE_ALIASES = new Map([
  ['Árbitro Principal', 'Árbitro Principal'],
  ['Assistente 1', 'Assistente 1'],
  ['Árbitro Assistente 1', 'Assistente 1'],
  ['Assistente 2', 'Assistente 2'],
  ['Árbitro Assistente 2', 'Assistente 2'],
  ['4º Árbitro', '4º Árbitro'],
  ['Quarto Árbitro', '4º Árbitro']
]);

const MATCH_STATUS_VALUES = new Set([
  'scheduled',
  'live',
  'halftime',
  'second_half',
  'finished',
  'postponed',
  'cancelled'
]);

const TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isValidObjectId(value) {
  return Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));
}

function parseObjectId(value, label) {
  if (!isValidObjectId(value)) {
    throw createHttpError(`${label} inválido`);
  }

  return String(value).trim();
}

function normalizeRefereeType(tipo) {
  const normalized = REFEREE_TYPE_ALIASES.get(String(tipo || '').trim());

  if (!normalized) {
    throw createHttpError(`Função de árbitro inválida: ${tipo}`);
  }

  return normalized;
}

function getTeamIdsFromPayload(payload) {
  return {
    homeTeamId: payload.homeTeamId || payload.homeTeam,
    awayTeamId: payload.awayTeamId || payload.awayTeam
  };
}

function normalizeCompetitionId(payload) {
  const rawCompetitionId = payload.competitionId !== undefined
    ? payload.competitionId
    : payload.competition;

  if (rawCompetitionId === undefined) {
    return undefined;
  }

  if (rawCompetitionId === null || rawCompetitionId === '') {
    return null;
  }

  return parseObjectId(rawCompetitionId, 'ID de competição');
}

function normalizeMatchDate(value) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError('Data do jogo inválida');
  }

  return parsedDate;
}

function normalizeMatchTime(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = String(value).trim();
  if (!TIME_PATTERN.test(normalized)) {
    throw createHttpError('Hora do jogo inválida');
  }

  return normalized;
}

async function ensureClubsExist(homeTeamId, awayTeamId) {
  const clubs = await Club.find({
    _id: { $in: [homeTeamId, awayTeamId] }
  }).select('_id').lean();

  if (clubs.length !== 2) {
    throw createHttpError('Uma ou ambas as equipas não existem', 404);
  }
}

async function validateCompetitionOwnership(competitionId, homeTeamId, awayTeamId) {
  if (!competitionId) {
    return null;
  }

  const competition = await Competition.findById(competitionId).select('_id teams name').lean();
  if (!competition) {
    throw createHttpError('Competição não encontrada', 404);
  }

  const competitionTeamIds = new Set((competition.teams || []).map((teamId) => String(teamId)));
  if (!competitionTeamIds.has(String(homeTeamId)) || !competitionTeamIds.has(String(awayTeamId))) {
    throw createHttpError('As equipas selecionadas não pertencem ao campeonato escolhido');
  }

  return competition;
}

async function normalizeRefereeTeamEntries(refereeTeam) {
  if (!Array.isArray(refereeTeam) || refereeTeam.length !== 4) {
    throw createHttpError('É obrigatório selecionar exatamente 4 árbitros para o jogo');
  }

  const normalizedEntries = refereeTeam.map((entry) => ({
    referee: parseObjectId(entry.referee, 'ID de árbitro'),
    tipo: normalizeRefereeType(entry.tipo)
  }));

  const refereeIds = normalizedEntries.map((entry) => entry.referee);
  if (new Set(refereeIds).size !== refereeIds.length) {
    throw createHttpError('Não pode atribuir o mesmo árbitro mais de uma vez ao jogo');
  }

  const refereeTypes = normalizedEntries.map((entry) => entry.tipo);
  const hasRequiredTypes = REQUIRED_REFEREE_TEAM_TYPES.every((requiredType) => refereeTypes.includes(requiredType));
  if (!hasRequiredTypes || new Set(refereeTypes).size !== REQUIRED_REFEREE_TEAM_TYPES.length) {
    throw createHttpError('A equipa de arbitragem deve conter exatamente Árbitro Principal, Assistente 1, Assistente 2 e 4º Árbitro');
  }

  const totalReferees = await Referee.countDocuments({
    _id: { $in: refereeIds }
  });

  if (totalReferees !== refereeIds.length) {
    throw createHttpError('Um ou mais árbitros não existem', 404);
  }

  return normalizedEntries;
}

function buildLegacyReferees(refereeTeam) {
  const refereeByType = new Map(refereeTeam.map((entry) => [entry.tipo, entry.referee]));

  return {
    main: refereeByType.get('Árbitro Principal') || null,
    assistant1: refereeByType.get('Assistente 1') || null,
    assistant2: refereeByType.get('Assistente 2') || null,
    fourthReferee: refereeByType.get('4º Árbitro') || null
  };
}

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
    const { date, time, stadium, referee, refereeTeam, status } = req.body;
    const { homeTeamId: rawHomeTeamId, awayTeamId: rawAwayTeamId } = getTeamIdsFromPayload(req.body);
    const competitionId = normalizeCompetitionId(req.body);

    if (!rawHomeTeamId || !rawAwayTeamId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Equipa de casa, equipa visitante e data são obrigatórias'
      });
    }

    const homeTeamId = parseObjectId(rawHomeTeamId, 'ID da equipa da casa');
    const awayTeamId = parseObjectId(rawAwayTeamId, 'ID da equipa visitante');
    const normalizedDate = normalizeMatchDate(date);
    const normalizedTime = normalizeMatchTime(time);

    if (homeTeamId === awayTeamId) {
      return res.status(400).json({
        success: false,
        message: 'A equipa de casa não pode ser a mesma que a visitante'
      });
    }

    if (status && !MATCH_STATUS_VALUES.has(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status do jogo inválido'
      });
    }

    const normalizedRefereeTeam = await normalizeRefereeTeamEntries(refereeTeam);
    const refereesLegacy = buildLegacyReferees(normalizedRefereeTeam);

    await ensureClubsExist(homeTeamId, awayTeamId);
    await validateCompetitionOwnership(competitionId, homeTeamId, awayTeamId);

    const newMatch = new Match({
      homeTeam: homeTeamId,
      awayTeam: awayTeamId,
      date: normalizedDate,
      time: normalizedTime,
      competition: competitionId,
      stadium,
      referee: refereesLegacy.main || (referee ? parseObjectId(referee, 'ID do árbitro principal') : null),
      referees: refereesLegacy,
      refereeTeam: normalizedRefereeTeam,
      status: status || 'scheduled'
    });

    await newMatch.save();

    // Popular antes de retornar
    await newMatch.populate('homeTeam', 'name equipa');
    await newMatch.populate('awayTeam', 'name equipa');
    await newMatch.populate('refereeTeam.referee', 'name tipo');

    res.status(201).json({
      success: true,
      message: 'Jogo criado com sucesso',
      data: newMatch
    });
  } catch (error) {
    logger.error('Erro ao criar jogo', error);
    res.status(error.statusCode || 500).json({
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
      .populate({ path: 'refereeTeam.referee', select: 'name tipo photo' })
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
    const { date, time, stadium, referee, attendance, notes, refereeTeam, status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de jogo inválido'
      });
    }

    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    const { homeTeamId: rawHomeTeamId, awayTeamId: rawAwayTeamId } = getTeamIdsFromPayload(req.body);
    const nextHomeTeamId = rawHomeTeamId ? parseObjectId(rawHomeTeamId, 'ID da equipa da casa') : String(match.homeTeam);
    const nextAwayTeamId = rawAwayTeamId ? parseObjectId(rawAwayTeamId, 'ID da equipa visitante') : String(match.awayTeam);
    const nextCompetitionId = normalizeCompetitionId(req.body);
    const resolvedCompetitionId = nextCompetitionId === undefined
      ? (match.competition ? String(match.competition) : null)
      : nextCompetitionId;

    if (nextHomeTeamId === nextAwayTeamId) {
      return res.status(400).json({
        success: false,
        message: 'A equipa de casa não pode ser a mesma que a visitante'
      });
    }

    await ensureClubsExist(nextHomeTeamId, nextAwayTeamId);
    await validateCompetitionOwnership(resolvedCompetitionId, nextHomeTeamId, nextAwayTeamId);

    if (date !== undefined) match.date = normalizeMatchDate(date);
    if (time !== undefined) {
      const normalizedTime = normalizeMatchTime(time);
      if (normalizedTime !== undefined) {
        match.time = normalizedTime;
      }
    }
    if (stadium !== undefined) match.stadium = stadium;
    if (attendance !== undefined) match.attendance = attendance;
    if (notes !== undefined) match.notes = notes;
    if (status !== undefined) {
      if (!MATCH_STATUS_VALUES.has(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status do jogo inválido'
        });
      }
      match.status = status;
    }

    match.homeTeam = nextHomeTeamId;
    match.awayTeam = nextAwayTeamId;
    match.competition = resolvedCompetitionId;

    if (referee !== undefined && referee !== null && referee !== '') {
      match.referee = parseObjectId(referee, 'ID do árbitro principal');
    }

    // Atualizar equipa de arbitragem se fornecida
    if (refereeTeam !== undefined) {
      const normalizedRefereeTeam = await normalizeRefereeTeamEntries(refereeTeam);
      const legacyReferees = buildLegacyReferees(normalizedRefereeTeam);

      match.refereeTeam = normalizedRefereeTeam;
      match.referees = legacyReferees;
      if (legacyReferees.main) {
        match.referee = legacyReferees.main;
      }
    }

    match.updatedAt = new Date();

    await match.save();

    res.json({
      success: true,
      message: 'Jogo atualizado com sucesso',
      data: match
    });
  } catch (error) {
    logger.error('Erro ao atualizar jogo', error);
    res.status(error.statusCode || 500).json({
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
 * Atribui árbitros ao jogo (novo formato com refereeTeam + retrocompatibilidade)
 */
exports.assignReferees = async (req, res) => {
  try {
    const { id } = req.params;
    const { main, assistant1, assistant2, fourthReferee, refereeTeam } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'ID de jogo inválido' });
    }

    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Jogo não encontrado' });
    }

    // Novo formato: refereeTeam array com 4 entradas
    if (refereeTeam && Array.isArray(refereeTeam) && refereeTeam.length === 4) {
      const normalizedRefereeTeam = await normalizeRefereeTeamEntries(refereeTeam);
      const legacyReferees = buildLegacyReferees(normalizedRefereeTeam);

      match.refereeTeam = normalizedRefereeTeam;
      match.referees = legacyReferees;
      if (legacyReferees.main) match.referee = legacyReferees.main;
    } else if (main && assistant1 && assistant2 && fourthReferee) {
      // Formato legacy
      const normalizedRefereeTeam = await normalizeRefereeTeamEntries([
        { referee: main, tipo: 'Árbitro Principal' },
        { referee: assistant1, tipo: 'Assistente 1' },
        { referee: assistant2, tipo: 'Assistente 2' },
        { referee: fourthReferee, tipo: '4º Árbitro' },
      ]);

      match.referees = buildLegacyReferees(normalizedRefereeTeam);
      match.referee = match.referees.main;
      match.refereeTeam = [
        ...normalizedRefereeTeam
      ];
    } else {
      return res.status(400).json({
        success: false,
        message: 'Devem ser fornecidos exatamente 4 árbitros'
      });
    }

    match.updatedAt = new Date();
    await match.save();

    // Popular antes de retornar
    await match.populate('homeTeam', 'name equipa');
    await match.populate('awayTeam', 'name equipa');
    await match.populate('refereeTeam.referee', 'name tipo');

    res.json({
      success: true,
      message: 'Árbitros atribuídos com sucesso',
      data: match
    });
  } catch (error) {
    logger.error('Erro ao atribuir árbitros', error);
    res.status(error.statusCode || 500).json({
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
