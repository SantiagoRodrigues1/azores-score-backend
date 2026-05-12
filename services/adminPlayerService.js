const Club = require('../models/Club');
const Player = require('../models/Player');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { closePendingEditRequestsForPlayer, recordAdminPlayerAudit } = require('./playerAdminWorkflowService');

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

async function createPlayer(payload, context = {}) {
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
    team: String(club._id),
    photo: payload.photo || payload.photoUrl || '',
    image: payload.photo || payload.photoUrl || '',
    age: payload.age != null ? Number(payload.age) : null,
    nationality: payload.nationality || null,
    height: payload.height != null ? Number(payload.height) : null,
    weight: payload.weight != null ? Number(payload.weight) : null,
    preferredFoot: payload.preferredFoot || null,
  });

  await recordAdminPlayerAudit({
    action: 'CREATE',
    actor: context.actor,
    after: player,
    requestMeta: context.requestMeta,
    description: 'Jogador criado diretamente pela administração.'
  });

  return player;
}

async function updatePlayer(playerId, payload, context = {}) {
  const player = await Player.findById(playerId);
  if (!player) {
    throw createHttpError('Jogador não encontrado.', 404);
  }

  const before = player.toObject();

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

  if (payload.photo !== undefined || payload.photoUrl !== undefined) {
    const photo = payload.photoUrl || payload.photo || '';
    player.photo = photo;
    player.image = photo;
  }

  if (payload.age !== undefined) player.age = payload.age != null ? Number(payload.age) : null;
  if (payload.nationality !== undefined) player.nationality = payload.nationality || null;
  if (payload.height !== undefined) player.height = payload.height != null ? Number(payload.height) : null;
  if (payload.weight !== undefined) player.weight = payload.weight != null ? Number(payload.weight) : null;
  if (payload.preferredFoot !== undefined) player.preferredFoot = payload.preferredFoot || null;

  await player.save();

  const actorId = context.actor?.id || context.actor?._id;
  await closePendingEditRequestsForPlayer(
    player._id,
    actorId,
    'Pedido fechado automaticamente após alteração administrativa direta.'
  );

  await recordAdminPlayerAudit({
    action: 'UPDATE',
    actor: context.actor,
    before,
    after: player,
    requestMeta: context.requestMeta,
    description: 'Jogador atualizado diretamente pela administração.'
  });

  return player;
}

async function deletePlayer(playerId, context = {}) {
  const player = await Player.findById(playerId);
  if (!player) {
    throw createHttpError('Jogador não encontrado.', 404);
  }

  const before = player.toObject();
  const actorId = context.actor?.id || context.actor?._id;

  await closePendingEditRequestsForPlayer(
    player._id,
    actorId,
    'Pedido fechado automaticamente porque o jogador foi removido pela administração.'
  );

  await Player.findByIdAndDelete(playerId);

  await recordAdminPlayerAudit({
    action: 'DELETE',
    actor: context.actor,
    before,
    requestMeta: context.requestMeta,
    description: 'Jogador removido diretamente pela administração.'
  });
}

module.exports = {
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer
};