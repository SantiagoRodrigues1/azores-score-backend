const Club = require('../models/Club');
const Lineup = require('../models/Lineup');
const Match = require('../models/Match');
const Player = require('../models/Player');
const LiveMatchService = require('./liveMatchService');
const { isClubManagerRole } = require('../utils/accessControl');

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeId(value) {
  return value ? String(value) : null;
}

async function ensureMatchAndTeam(matchId, teamId) {
  const [match, team] = await Promise.all([
    Match.findById(matchId),
    Club.findById(teamId)
  ]);

  if (!match) {
    throw createHttpError('Jogo não encontrado', 404);
  }

  if (!team) {
    throw createHttpError('Equipa não encontrada', 404);
  }
}

function assertTeamAccess(user, teamId) {
  if (isClubManagerRole(user.role) && user.role !== 'admin' && normalizeId(user.assignedTeam) !== normalizeId(teamId)) {
    throw createHttpError('Acesso negado', 403);
  }
}

function mapStarter(starter, captain, viceCaptain) {
  const playerId = normalizeId(starter.playerId || starter.id);
  return {
    playerId,
    playerName: starter.playerName,
    playerNumber: starter.playerNumber,
    position: starter.position,
    formationPosition: starter.formationPosition || starter.label,
    isCaptain: playerId === normalizeId(captain),
    isViceCaptain: playerId === normalizeId(viceCaptain)
  };
}

function mapSubstitute(substitute, index) {
  return {
    playerId: normalizeId(substitute.playerId || substitute.id),
    playerName: substitute.playerName,
    playerNumber: substitute.playerNumber,
    position: substitute.position,
    benchNumber: index + 1
  };
}

async function validateLineupSubmission(teamId, starters, substitutes, captain, viceCaptain) {
  const MIN_SUBS = parseInt(process.env.LINEUP_SUBS_MIN || '0', 10);
  const MAX_SUBS = parseInt(process.env.LINEUP_SUBS_MAX || '7', 10);

  if (!Array.isArray(starters) || starters.length !== 11) {
    throw createHttpError('A escalação deve conter exatamente 11 titulares');
  }

  if (!Array.isArray(substitutes)) {
    throw createHttpError('Lista de suplentes inválida');
  }

  if (substitutes.length < MIN_SUBS || substitutes.length > MAX_SUBS) {
    throw createHttpError(`Número de suplentes inválido (mín: ${MIN_SUBS}, máx: ${MAX_SUBS})`);
  }

  // Collect player IDs and ensure no duplicates
  const starterIds = starters.map(s => normalizeId(s.playerId || s.id));
  const subIds = substitutes.map(s => normalizeId(s.playerId || s.id));

  if (starterIds.some(id => !id)) {
    throw createHttpError('Todos os titulares devem ter um playerId válido');
  }

  if (subIds.some(id => !id)) {
    throw createHttpError('Todos os suplentes devem ter um playerId válido');
  }

  const allIds = starterIds.concat(subIds);
  const uniqueIds = new Set(allIds);
  if (uniqueIds.size !== allIds.length) {
    throw createHttpError('Existem jogadores duplicados entre titulares e suplentes');
  }

  // Must have at least one goalkeeper among starters
  const goalkeepers = starters.filter(s => (s.position || '').toLowerCase() === 'goalkeeper');
  if (goalkeepers.length < 1) {
    throw createHttpError('A escalação deve incluir pelo menos 1 guarda-redes');
  }

  // All players must exist and belong to the team
  const playerDocs = await Player.find({ _id: { $in: Array.from(uniqueIds) }, team: teamId }).select('_id');
  const foundIds = new Set(playerDocs.map(p => String(p._id)));
  const missing = Array.from(uniqueIds).filter(id => !foundIds.has(id));
  if (missing.length > 0) {
    throw createHttpError(`Jogadores não encontrados na equipa: ${missing.join(', ')}`);
  }

  // Captain/vice-captain must be among starters if provided
  if (captain && !starterIds.includes(normalizeId(captain))) {
    throw createHttpError('O capitão deve ser um dos 11 titulares');
  }

  if (viceCaptain && !starterIds.includes(normalizeId(viceCaptain))) {
    throw createHttpError('O vice-capitão deve ser um dos 11 titulares');
  }

  return true;
}

async function saveLineup(user, payload) {
  const { matchId, teamId, formation, starters, substitutes, captain, viceCaptain } = payload;

  if (!matchId || !teamId || !formation || !Array.isArray(starters)) {
    throw createHttpError('Campos obrigatórios: matchId, teamId, formation, starters');
  }

  if (starters.length < 1) {
    throw createHttpError('Escalação deve ter pelo menos 1 jogador');
  }

  await ensureMatchAndTeam(matchId, teamId);
  assertTeamAccess(user, teamId);

  // If payload requests submission, validate strictly BEFORE persisting
  if (payload.submitted) {
    await validateLineupSubmission(teamId, starters, substitutes || [], captain, viceCaptain);
  }

  const updateDoc = {
    $set: {
      formation,
      starters: starters.map((starter) => mapStarter(starter, captain, viceCaptain)),
      substitutes: (substitutes || []).map(mapSubstitute),
      updatedAt: new Date(),
      status: payload.submitted ? 'submitted' : 'draft',
      submitted: Boolean(payload.submitted),
      submittedAt: payload.submitted ? new Date() : null
    },
    $setOnInsert: {
      match: matchId,
      team: teamId,
      createdBy: user.id
    }
  };

  const lineup = await Lineup.findOneAndUpdate(
    { match: matchId, team: teamId },
    updateDoc,
    {
      returnDocument: 'after',
      upsert: true,
      runValidators: true
    }
  )
    .populate('team', 'name logo colors')
    .populate('match', 'homeTeam awayTeam date status')
    .populate('createdBy', 'name email');

  return lineup;
}

async function getMatchLineups(user, matchId) {
  const match = await Match.findById(matchId).lean();
  if (!match) {
    throw createHttpError('Jogo não encontrado', 404);
  }

  if (isClubManagerRole(user.role) && user.role !== 'admin') {
    const teams = [normalizeId(match.homeTeam), normalizeId(match.awayTeam)];
    if (!teams.includes(normalizeId(user.assignedTeam))) {
      throw createHttpError('Acesso negado', 403);
    }
  }

  return Lineup.find({ match: matchId })
    .populate('team', 'name logo colors')
    .populate('match', 'homeTeam awayTeam date status')
    .populate('createdBy', 'name email');
}

async function getTeamLineup(user, matchId, teamId) {
  assertTeamAccess(user, teamId);

  const lineup = await Lineup.findOne({ match: matchId, team: teamId })
    .populate('match', 'date homeTeam awayTeam status')
    .populate('team', 'name logo')
    .populate('createdBy', 'name email');

  if (!lineup) {
    return null;
  }

  return lineup;
}

async function deleteLineup(user, matchId, teamId) {
  assertTeamAccess(user, teamId);

  const lineup = await Lineup.findOneAndDelete({ match: matchId, team: teamId });
  if (!lineup) {
    throw createHttpError('Escalação não encontrada', 404);
  }
}

module.exports = {
  saveLineup,
  getMatchLineups,
  getTeamLineup,
  deleteLineup
};