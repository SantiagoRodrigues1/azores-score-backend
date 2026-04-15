const Club = require('../models/Club');
const Match = require('../models/Match');
const Player = require('../models/Player');
const { isClubManagerRole } = require('../utils/accessControl');
const { parsePagination, buildPagination } = require('../utils/pagination');

const positionOrder = ['Guarda-Redes', 'Defesa', 'Médio', 'Avançado', 'Outro'];

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeTeamId(teamId) {
  return teamId ? String(teamId) : null;
}

function mapMatch(match) {
  return {
    id: String(match._id),
    homeTeam: match.homeTeam
      ? {
          id: String(match.homeTeam._id || match.homeTeam.id),
          name: match.homeTeam.name,
          logo: match.homeTeam.logo,
          colors: match.homeTeam.colors
        }
      : null,
    awayTeam: match.awayTeam
      ? {
          id: String(match.awayTeam._id || match.awayTeam.id),
          name: match.awayTeam.name,
          logo: match.awayTeam.logo,
          colors: match.awayTeam.colors
        }
      : null,
    referee: match.referee
      ? {
          id: String(match.referee._id || match.referee.id),
          name: match.referee.name
        }
      : null,
    competition: match.competition
      ? {
          id: String(match.competition._id || match.competition.id),
          name: match.competition.name
        }
      : null,
    date: match.date,
    time: match.time,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore
  };
}

function mapPlayer(player) {
  return {
    id: String(player._id),
    nome: player.name || player.nome || '',
    name: player.name || player.nome || '',
    posicao: player.position || 'Outro',
    position: player.position || 'Outro',
    numero: player.numero || player.number || null,
    number: Number.parseInt(player.numero || player.number, 10) || 0,
    goals: player.goals || 0,
    assists: player.assists || 0,
    photo: player.photo || player.image || null
  };
}

function groupPlayersByPosition(players) {
  const grouped = {};

  for (const player of players) {
    const position = player.posicao || 'Outro';
    if (!grouped[position]) {
      grouped[position] = [];
    }

    grouped[position].push(player);
  }

  const ordered = {};
  for (const position of positionOrder) {
    if (grouped[position]) {
      ordered[position] = grouped[position];
    }
  }

  for (const key of Object.keys(grouped)) {
    if (!ordered[key]) {
      ordered[key] = grouped[key];
    }
  }

  return ordered;
}

async function assertManagerOwnsMatch(user, match) {
  if (!isClubManagerRole(user.role)) {
    return;
  }

  const assignedTeam = normalizeTeamId(user.assignedTeam);
  const homeTeam = normalizeTeamId(match.homeTeam?._id || match.homeTeam);
  const awayTeam = normalizeTeamId(match.awayTeam?._id || match.awayTeam);

  if (!assignedTeam || (assignedTeam !== homeTeam && assignedTeam !== awayTeam)) {
    throw createHttpError('Acesso negado. Pode apenas aceder aos jogos da sua equipa.', 403);
  }
}

async function getMatchDetails(user, matchId) {
  if (!matchId || matchId === 'undefined') {
    throw createHttpError('ID do jogo inválido');
  }

  const match = await Match.findById(matchId)
    .populate('homeTeam', 'name logo colors')
    .populate('awayTeam', 'name logo colors')
    .populate('referee', 'name')
    .populate('competition', 'name');

  if (!match) {
    throw createHttpError('Jogo não encontrado', 404);
  }

  if (!match.homeTeam || !match.awayTeam) {
    throw createHttpError('Jogo com dados incompletos (equipa não encontrada)');
  }

  await assertManagerOwnsMatch(user, match);
  return mapMatch(match);
}

async function listMatches(user, query) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 10, maxLimit: 50 });
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (isClubManagerRole(user.role) && user.role !== 'admin') {
    const assignedTeam = normalizeTeamId(user.assignedTeam);
    if (!assignedTeam) {
      return {
        data: [],
        pagination: buildPagination(0, page, limit),
        message: 'Nenhuma equipa associada'
      };
    }

    filter.$or = [{ homeTeam: assignedTeam }, { awayTeam: assignedTeam }];
  }

  const [matches, total] = await Promise.all([
    Match.find(filter)
      .populate('homeTeam', 'name logo colors')
      .populate('awayTeam', 'name logo colors')
      .populate('referee', 'name')
      .populate('competition', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Match.countDocuments(filter)
  ]);

  return {
    data: matches.map(mapMatch),
    pagination: buildPagination(total, page, limit)
  };
}

async function listTeamPlayers(user, query) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 25, maxLimit: 100 });
  const teamId = user.role === 'admin' ? normalizeTeamId(query.teamId) : normalizeTeamId(user.assignedTeam);

  if (!teamId) {
    return {
      data: [],
      byPosition: {},
      pagination: buildPagination(0, page, limit),
      message: 'Nenhuma equipa associada'
    };
  }

  const club = await Club.findById(teamId).lean();
  if (!club) {
    throw createHttpError('Equipa não encontrada', 404);
  }

  const filter = { team: teamId };
  const [players, total] = await Promise.all([
    Player.find(filter)
      .sort({ numero: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Player.countDocuments(filter)
  ]);

  const mappedPlayers = players.map(mapPlayer);

  return {
    data: mappedPlayers,
    byPosition: groupPlayersByPosition(mappedPlayers),
    teamName: club.name,
    pagination: buildPagination(total, page, limit)
  };
}

async function getDashboard(user, query) {
  if (!isClubManagerRole(user.role)) {
    throw createHttpError('Acesso restrito a responsáveis de clube', 403);
  }

  const assignedTeam = normalizeTeamId(user.assignedTeam);
  if (!assignedTeam) {
    return {
      matches: [],
      players: [],
      byPosition: {},
      stats: {
        totalPlayers: 0,
        totalMatches: 0
      },
      message: 'Nenhuma equipa associada'
    };
  }

  const club = await Club.findById(assignedTeam).lean();
  if (!club) {
    throw createHttpError('Equipa não encontrada', 404);
  }

  const { limit } = parsePagination(query, { defaultLimit: 5, maxLimit: 20 });

  const [matches, players] = await Promise.all([
    Match.find({ $or: [{ homeTeam: assignedTeam }, { awayTeam: assignedTeam }] })
      .populate('homeTeam', 'name logo colors')
      .populate('awayTeam', 'name logo colors')
      .sort({ date: 1 })
      .limit(limit)
      .lean(),
    Player.find({ team: assignedTeam }).sort({ numero: 1, name: 1 }).lean()
  ]);

  const mappedPlayers = players.map(mapPlayer);

  return {
    teamName: club.name,
    matches: matches.map(mapMatch),
    players: mappedPlayers,
    byPosition: groupPlayersByPosition(mappedPlayers),
    stats: {
      totalPlayers: mappedPlayers.length,
      totalMatches: matches.length
    }
  };
}

module.exports = {
  getMatchDetails,
  listMatches,
  listTeamPlayers,
  getDashboard,
  createHttpError
};