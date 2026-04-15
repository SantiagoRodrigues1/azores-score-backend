const Club = require('../models/Club');
const Lineup = require('../models/Lineup');
const Match = require('../models/Match');
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

  const lineup = await Lineup.findOneAndUpdate(
    { match: matchId, team: teamId },
    {
      $set: {
        formation,
        starters: starters.map((starter) => mapStarter(starter, captain, viceCaptain)),
        substitutes: (substitutes || []).map(mapSubstitute),
        updatedAt: new Date()
      },
      $setOnInsert: {
        match: matchId,
        team: teamId,
        createdBy: user.id
      }
    },
    {
      new: true,
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