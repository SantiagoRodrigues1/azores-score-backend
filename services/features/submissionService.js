const Club = require('../../models/Club');
const ImageUpload = require('../../models/ImageUpload');
const Match = require('../../models/Match');
const Player = require('../../models/Player');
const { submissionDataSchemas } = require('../../validators/featureSchemas');

function createHttpError(message, statusCode = 400, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureClubExists(clubId) {
  const club = await Club.findById(clubId).lean();
  if (!club) {
    throw createHttpError('Equipa associada não encontrada.', 404);
  }

  return club;
}

async function normalizePlayerSubmission(data) {
  const team = await ensureClubExists(data.teamId);

  const duplicate = await Player.findOne({
    team: data.teamId,
    numero: String(data.numero)
  }).lean();

  if (duplicate) {
    throw createHttpError(`Já existe um jogador com o número ${data.numero} nesta equipa.`, 409);
  }

  return {
    name: data.name.trim(),
    nome: data.name.trim(),
    numero: String(data.numero),
    nickname: data.nickname?.trim() || '',
    position: data.position,
    email: data.email?.trim().toLowerCase() || '',
    team: data.teamId,
    teamName: team.name,
    notes: data.notes?.trim() || '',
    photo: null,
    image: null,
    goals: 0,
    assists: 0
  };
}

async function normalizeTeamSubmission(data) {
  const duplicate = await Club.findOne({
    name: new RegExp(`^${escapeRegExp(data.name.trim())}$`, 'i')
  }).lean();

  if (duplicate) {
    throw createHttpError('Já existe uma equipa com este nome.', 409);
  }

  return {
    name: data.name.trim(),
    island: data.island,
    stadium: data.stadium?.trim() || '',
    foundedYear: data.foundedYear || undefined,
    description: data.description?.trim() || '',
    logo: data.logo?.trim() || '⚽',
    colors: {
      primary: data.colors?.primary || '#0f766e',
      secondary: data.colors?.secondary || '#ffffff'
    }
  };
}

async function normalizeMatchSubmission(data) {
  if (data.homeTeamId === data.awayTeamId) {
    throw createHttpError('A equipa da casa e de fora não podem ser iguais.');
  }

  await Promise.all([ensureClubExists(data.homeTeamId), ensureClubExists(data.awayTeamId)]);

  const normalizedDate = new Date(data.date);
  const duplicate = await Match.findOne({
    homeTeam: data.homeTeamId,
    awayTeam: data.awayTeamId,
    date: normalizedDate,
    time: data.time
  }).lean();

  if (duplicate) {
    throw createHttpError('Já existe um jogo registado com estes dados.', 409);
  }

  return {
    homeTeam: data.homeTeamId,
    awayTeam: data.awayTeamId,
    date: normalizedDate,
    time: data.time,
    stadium: data.stadium?.trim() || '',
    competition: data.competitionId || undefined,
    notes: data.notes?.trim() || '',
    status: 'scheduled',
    homeScore: 0,
    awayScore: 0
  };
}

async function normalizeImageSubmission(data, userId) {
  await ensureClubExists(data.teamId);

  const player = await Player.findById(data.playerId).lean();
  if (!player) {
    throw createHttpError('Jogador não encontrado.', 404);
  }

  return {
    playerId: data.playerId,
    teamId: data.teamId,
    imageUrl: data.imageUrl,
    caption: data.caption?.trim() || '',
    uploadedBy: userId
  };
}

async function normalizeSubmissionPayload({ type, data, userId }) {
  const schema = submissionDataSchemas[type];
  if (!schema) {
    throw createHttpError('Tipo de submissão não suportado.');
  }

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw createHttpError('Submissão inválida.', 400, error.details.map((detail) => detail.message));
  }

  switch (type) {
    case 'player':
      return normalizePlayerSubmission(value);
    case 'team':
      return normalizeTeamSubmission(value);
    case 'match':
      return normalizeMatchSubmission(value);
    case 'image':
      return normalizeImageSubmission(value, userId);
    default:
      throw createHttpError('Tipo de submissão não suportado.');
  }
}

async function materializeSubmission({ type, data }) {
  switch (type) {
    case 'player': {
      const entity = await Player.create(data);
      return { entityType: 'player', entityId: entity._id };
    }
    case 'team': {
      const entity = await Club.create(data);
      return { entityType: 'team', entityId: entity._id };
    }
    case 'match': {
      const entity = await Match.create(data);
      return { entityType: 'match', entityId: entity._id };
    }
    case 'image': {
      const entity = await ImageUpload.create({
        url: data.imageUrl,
        playerId: data.playerId,
        uploadedBy: data.uploadedBy,
        status: 'approved',
        moderationNote: data.caption || null,
        provider: 'external',
        mimeType: 'image/url',
        sizeBytes: 0
      });

      await Player.findByIdAndUpdate(data.playerId, {
        photo: data.imageUrl,
        image: data.imageUrl
      });

      return { entityType: 'image', entityId: entity._id };
    }
    default:
      throw createHttpError('Tipo de submissão não suportado.');
  }
}

module.exports = {
  createHttpError,
  materializeSubmission,
  normalizeSubmissionPayload
};