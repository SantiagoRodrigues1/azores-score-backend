const Joi = require('joi');

const objectId = Joi.string().hex().length(24);
const positionEnum = ['Guarda-redes', 'Defesa Central', 'Lateral Esquerdo', 'Lateral Direito', 'Médio Defensivo', 'Médio', 'Médio Ofensivo', 'Extremo Esquerdo', 'Extremo Direito', 'Avançado', 'Outro'];
const islandEnum = ['São Miguel', 'Terceira', 'Faial', 'Pico', 'São Jorge', 'Graciosa', 'Flores', 'Corvo', 'Açores'];
const hexColor = Joi.string().pattern(/^#(?:[0-9a-fA-F]{3}){1,2}$/);
const imageDataUriPattern = /^data:image\/(png|jpe?g|webp);base64,/;
const imageUriOrDataSchema = Joi.alternatives().try(
  Joi.string().uri(),
  Joi.string().pattern(imageDataUriPattern)
);
const photoEditValueSchema = Joi.alternatives().try(
  Joi.string().uri(),
  Joi.string().pattern(imageDataUriPattern),
  Joi.string().trim().valid(''),
  Joi.valid(null)
);

function hydratePhotoEditRequestValue(payload = {}) {
  if (payload.field !== 'photo') {
    return payload;
  }

  const normalizedNewValue = typeof payload.newValue === 'string'
    ? payload.newValue.trim()
    : payload.newValue;

  if (normalizedNewValue) {
    return {
      ...payload,
      newValue: normalizedNewValue
    };
  }

  if (payload.proof?.type === 'image' && payload.proof.value) {
    return {
      ...payload,
      newValue: payload.proof.value
    };
  }

  return {
    ...payload,
    newValue: ''
  };
}

exports.newsCreateSchema = Joi.object({
  title: Joi.string().trim().min(5).max(160).required(),
  content: Joi.string().trim().min(20).required(),
  image: imageUriOrDataSchema.allow(null, ''),
  category: Joi.string().trim().min(2).max(60).required(),
  tags: Joi.array().items(Joi.string().trim().max(30)).default([])
});

exports.newsUpdateSchema = Joi.object({
  title: Joi.string().trim().min(5).max(160),
  content: Joi.string().trim().min(20),
  image: imageUriOrDataSchema.allow(null, ''),
  category: Joi.string().trim().min(2).max(60),
  tags: Joi.array().items(Joi.string().trim().max(30))
}).min(1);

const playerSubmissionDataSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  numero: Joi.number().integer().min(1).max(99).required(),
  position: Joi.string().valid(...positionEnum).required(),
  teamId: objectId.required(),
  email: Joi.string().email().allow('', null),
  nickname: Joi.string().trim().max(60).allow('', null),
  notes: Joi.string().trim().max(500).allow('', null)
});

const teamSubmissionDataSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  island: Joi.string().valid(...islandEnum).default('Açores'),
  stadium: Joi.string().trim().max(120).allow('', null),
  foundedYear: Joi.number().integer().min(1800).max(new Date().getFullYear()).allow(null),
  description: Joi.string().trim().max(1000).allow('', null),
  logo: Joi.string().trim().max(300).allow('', null),
  colors: Joi.object({
    primary: hexColor.default('#0f766e'),
    secondary: hexColor.default('#ffffff')
  }).default()
});

const matchSubmissionDataSchema = Joi.object({
  homeTeamId: objectId.required(),
  awayTeamId: objectId.required().invalid(Joi.ref('homeTeamId')),
  date: Joi.date().iso().required(),
  time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  stadium: Joi.string().trim().max(120).allow('', null),
  competitionId: objectId.allow(null, ''),
  notes: Joi.string().trim().max(500).allow('', null)
});

const imageSubmissionDataSchema = Joi.object({
  playerId: objectId.required(),
  teamId: objectId.required(),
  imageUrl: Joi.string().uri().required(),
  caption: Joi.string().trim().max(280).allow('', null)
});

exports.submissionDataSchemas = {
  player: playerSubmissionDataSchema,
  team: teamSubmissionDataSchema,
  match: matchSubmissionDataSchema,
  image: imageSubmissionDataSchema
};

exports.submissionCreateSchema = Joi.object({
  type: Joi.string().valid('player', 'team', 'match', 'image').required(),
  data: Joi.when('type', {
    switch: [
      { is: 'player', then: playerSubmissionDataSchema.required() },
      { is: 'team', then: teamSubmissionDataSchema.required() },
      { is: 'match', then: matchSubmissionDataSchema.required() },
      { is: 'image', then: imageSubmissionDataSchema.required() }
    ],
    otherwise: Joi.object().forbidden()
  })
});

exports.submissionReviewSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  reviewNote: Joi.string().trim().max(500).allow('', null)
});

exports.commentSchema = Joi.object({
  content: Joi.string().trim().min(1).max(500).required(),
  parentCommentId: objectId.allow(null)
});

exports.postCreateSchema = Joi.object({
  text: Joi.string().trim().min(1).max(1200).required(),
  image: imageUriOrDataSchema.allow(null, '')
});

exports.favoriteTeamSchema = Joi.object({
  teamId: objectId.required(),
  notifications: Joi.object({
    matchStart: Joi.boolean().default(true),
    goals: Joi.boolean().default(true),
    finalResult: Joi.boolean().default(true)
  }).default()
});

exports.favoriteTeamUpdateSchema = Joi.object({
  notifications: Joi.object({
    matchStart: Joi.boolean(),
    goals: Joi.boolean(),
    finalResult: Joi.boolean()
  }).required()
});

exports.imageUploadSchema = Joi.object({
  playerId: objectId.required(),
  imageBase64: Joi.string().pattern(imageDataUriPattern).required()
});

exports.imageReviewSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  moderationNote: Joi.string().trim().max(500).allow('', null)
});

exports.reportSchema = Joi.object({
  entityType: Joi.string().valid('post', 'comment').required(),
  entityId: objectId.required(),
  reason: Joi.string().trim().min(3).max(120).required(),
  details: Joi.string().trim().max(500).allow('', null)
});

exports.reportReviewSchema = Joi.object({
  status: Joi.string().valid('reviewed', 'dismissed').required()
});

exports.trackViewSchema = Joi.object({
  entityType: Joi.string().valid('player', 'team', 'news').required(),
  entityId: objectId.required()
});

exports.playerCompareSchema = Joi.object({
  firstPlayerId: objectId.required(),
  secondPlayerId: objectId.required().invalid(Joi.ref('firstPlayerId'))
});

const proofValueSchema = imageUriOrDataSchema;

exports.editRequestCreateSchema = Joi.object({
  playerId: objectId.required(),
  field: Joi.string().valid('name', 'numero', 'position', 'email', 'nickname', 'photo').required(),
  newValue: Joi.when('field', {
    switch: [
      {
        is: 'numero',
        then: Joi.number().integer().min(1).max(99).required()
      },
      {
        is: 'position',
        then: Joi.string().valid(...positionEnum).required()
      },
      {
        is: 'email',
        then: Joi.string().email().allow('').required()
      },
      {
        is: 'photo',
        then: photoEditValueSchema.required()
      }
    ],
    otherwise: Joi.string().trim().min(1).max(240).required()
  }),
  justification: Joi.string().trim().min(10).max(1000).required(),
  proof: Joi.object({
    type: Joi.string().valid('link', 'image').required(),
    value: proofValueSchema.required()
  }).allow(null)
}).custom((payload, helpers) => {
  const hydratedPayload = hydratePhotoEditRequestValue(payload);

  if (hydratedPayload.field === 'photo' && !hydratedPayload.newValue) {
    return helpers.message('A nova foto deve ser enviada por URL ou ficheiro.');
  }

  return hydratedPayload;
});

exports.editRequestReviewSchema = Joi.object({
  reviewNote: Joi.string().trim().max(500).allow('', null)
});
