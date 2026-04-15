const Club = require('../models/Club');
const Player = require('../models/Player');
const { parsePagination, buildPagination } = require('../utils/pagination');

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function resolveTeam({ teamId, teamName, team }) {
  const targetTeamId = teamId || team;
  if (targetTeamId) {
    const club = await Club.findById(targetTeamId).lean();
    if (!club) {
      throw createHttpError('Equipa não encontrada.', 404);
    }
    return club;
  }

  if (teamName) {
    const club = await Club.findOne({ name: teamName.trim() }).lean();
    if (!club) {
      throw createHttpError('Equipa não encontrada.', 404);
    }
    return club;
  }

  throw createHttpError('Team não especificado.');
}

async function listPlayers(query) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};

  if (query.teamId) {
    filter.team = String(query.teamId);
  }

  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { nome: { $regex: query.search, $options: 'i' } },
      { email: { $regex: query.search, $options: 'i' } }
    ];
  }

  const [players, total] = await Promise.all([
    Player.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Player.countDocuments(filter)
  ]);

  return {
    data: players,
    pagination: buildPagination(total, page, limit)
  };
}

async function createPlayer(payload) {
  const { nome, name, numero, number, position, email } = payload;
  const playerName = (nome || name || '').trim();
  const shirtNumber = String(numero || number || '').trim();

  if (!playerName) {
    throw createHttpError('Nome do jogador é obrigatório.');
  }

  if (!shirtNumber) {
    throw createHttpError('Número de camisola é obrigatório.');
  }

  const club = await resolveTeam(payload);
  const duplicate = await Player.findOne({ team: String(club._id), numero: shirtNumber }).lean();
  if (duplicate) {
    throw createHttpError('Já existe um jogador com este número nesta equipa.', 409);
  }

  const player = await Player.create({
    name: playerName,
    nome: playerName,
    numero: shirtNumber,
    position: position || 'Outro',
    email: email || '',
    team: String(club._id)
  });

  return player;
}

async function updatePlayer(playerId, payload) {
  const player = await Player.findById(playerId);
  if (!player) {
    throw createHttpError('Jogador não encontrado.', 404);
  }

  if (payload.name || payload.nome) {
    const playerName = String(payload.name || payload.nome).trim();
    player.name = playerName;
    player.nome = playerName;
  }

  if (payload.numero || payload.number) {
    const nextNumber = String(payload.numero || payload.number).trim();
    const duplicate = await Player.findOne({
      _id: { $ne: playerId },
      team: player.team,
      numero: nextNumber
    }).lean();

    if (duplicate) {
      throw createHttpError('Já existe um jogador com este número nesta equipa.', 409);
    }

    player.numero = nextNumber;
  }

  if (payload.position) {
    player.position = payload.position;
  }

  if (payload.email !== undefined) {
    player.email = payload.email || '';
  }

  await player.save();
  return player;
}

async function deletePlayer(playerId) {
  const player = await Player.findByIdAndDelete(playerId);
  if (!player) {
    throw createHttpError('Jogador não encontrado.', 404);
  }
}

module.exports = {
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer
};