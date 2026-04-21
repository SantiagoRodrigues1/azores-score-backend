const { ObjectId } = require('mongodb');
const { getClient } = require('../config/db');
const { isClubManagerRole } = require('../utils/accessControl');

const TEAM_DATABASES = [
  { campeonato: 'azores_score', island: 'Acores' },
  { campeonato: 'campeonato_graciosa', island: 'Graciosa' },
  { campeonato: 'campeonato_horta', island: 'Faial/Pico' },
  { campeonato: 'campeonato_sao_jorge', island: 'Sao Jorge' },
  { campeonato: 'campeonato_sao_miguel', island: 'Sao Miguel' },
  { campeonato: 'campeonato_terceira', island: 'Terceira' }
];

const GENERIC_COLLECTIONS = new Set([
  'adminusers',
  'auditlogs',
  'clubs',
  'comments',
  'competitions',
  'editrequests',
  'equipas_descricao',
  'favoriteteams',
  'imageuploads',
  'jogadores',
  'likes',
  'lineups',
  'matchreports',
  'matches',
  'matches_jornada_15',
  'melhores_marcadores',
  'news',
  'notifications',
  'players',
  'refereeprofiles',
  'referees',
  'reports',
  'scorers',
  'socialposts',
  'standings',
  'stripewebhookevents',
  'submissions',
  'users',
  'viewevents'
]);

const TEAM_ALIAS_STOPWORDS = new Set([
  'acdr',
  'ad',
  'cd',
  'cf',
  'clube',
  'club',
  'fc',
  'futebol',
  'football',
  'gd',
  'jd',
  'sc',
  'sl',
  'sport',
  'sporting',
  'ud'
]);

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function collapseWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && collapseWhitespace(value).length > 0;
}

function normalizeName(value = '') {
  return collapseWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isNumericLike(value) {
  return typeof value === 'number' || (isNonEmptyString(value) && /^-?\d+(?:[.,]\d+)?$/.test(collapseWhitespace(value)));
}

function prettifyTeamName(value = '') {
  return collapseWhitespace(
    String(value || '')
      .replace(/^Equipa Tecnica\s+/iu, '')
      .replace(/^Equipa Técnica\s+/iu, '')
      .replace(/_tecnica$/iu, '')
      .replace(/_/g, ' ')
      .replace(/([a-zà-ÿ0-9])([A-Z])/gu, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
  );
}

function getDisplayNameScore(value = '') {
  const candidate = collapseWhitespace(value);
  if (!candidate) {
    return 0;
  }

  let score = 1;
  if (/\s/.test(candidate)) {
    score += 3;
  }
  if (/[À-ÿ]/.test(candidate)) {
    score += 1;
  }
  if (/[A-Z][a-z]/.test(candidate)) {
    score += 1;
  }

  return score;
}

function pickPreferredDisplayName(...names) {
  return names
    .filter(isNonEmptyString)
    .map(collapseWhitespace)
    .sort((left, right) => getDisplayNameScore(right) - getDisplayNameScore(left))[0] || '';
}

function getTeamLookupKeys(teamName = '') {
  const keys = new Set();
  const rawName = collapseWhitespace(teamName);
  const withoutParentheses = collapseWhitespace(rawName.replace(/\([^)]*\)/g, ' '));
  const candidates = [
    rawName,
    withoutParentheses,
    prettifyTeamName(rawName),
    prettifyTeamName(withoutParentheses)
  ].filter(isNonEmptyString);

  for (const candidate of candidates) {
    const normalized = normalizeName(candidate);
    if (!normalized) {
      continue;
    }

    keys.add(normalized);
    keys.add(normalized.replace(/[^a-z0-9]/g, ''));

    const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
    if (!tokens.length) {
      continue;
    }

    keys.add(tokens.join(' '));
    keys.add(tokens.join(''));

    const filteredTokens = tokens.filter((token) => !TEAM_ALIAS_STOPWORDS.has(token));
    if (filteredTokens.length && filteredTokens.length !== tokens.length) {
      keys.add(filteredTokens.join(' '));
      keys.add(filteredTokens.join(''));
    }
  }

  return Array.from(keys);
}

function computeTeamNameScore(candidateNames = [], targetName = '') {
  if (!isNonEmptyString(targetName)) {
    return 0;
  }

  const cleanCandidates = candidateNames.filter(isNonEmptyString).map(collapseWhitespace);
  if (!cleanCandidates.length) {
    return 0;
  }

  const candidateKeys = new Set(cleanCandidates.flatMap(getTeamLookupKeys));
  const targetKeys = getTeamLookupKeys(targetName);
  const normalizedTarget = normalizeName(targetName);
  const compactTarget = normalizedTarget.replace(/[^a-z0-9]/g, '');
  const normalizedCandidates = new Set(cleanCandidates.map(normalizeName));
  const compactCandidates = new Set(cleanCandidates.map((value) => normalizeName(value).replace(/[^a-z0-9]/g, '')));

  let score = 0;

  if (normalizedCandidates.has(normalizedTarget)) {
    score += 120;
  }

  if (compactCandidates.has(compactTarget)) {
    score += 80;
  }

  score += targetKeys.filter((key) => candidateKeys.has(key)).length * 10;
  return score;
}

function findBestMatch(items = [], candidateNames = [], getName) {
  let bestItem = null;
  let bestScore = 0;

  for (const item of items) {
    const score = computeTeamNameScore(candidateNames, getName(item));
    if (score > bestScore) {
      bestItem = item;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestItem : null;
}

function getTeamSource(campeonato = 'azores_score') {
  return TEAM_DATABASES.find((entry) => entry.campeonato === campeonato) || {
    campeonato,
    island: prettifyTeamName(campeonato.replace(/^campeonato_/u, '')) || 'Desconhecida'
  };
}

function buildSyntheticTeamId(campeonato, collectionName) {
  const suffix = normalizeName(collectionName).replace(/[^a-z0-9]+/g, '-');
  return `team:${campeonato}:${suffix}`;
}

function isStaffCollectionName(collectionName = '') {
  return /_tecnica$/iu.test(collectionName)
    || /^Equipa Tecnica\s+/iu.test(collectionName)
    || /^Equipa Técnica\s+/iu.test(collectionName);
}

function stripStaffCollectionDecorators(collectionName = '') {
  return prettifyTeamName(
    String(collectionName || '')
      .replace(/^Equipa Tecnica\s+/iu, '')
      .replace(/^Equipa Técnica\s+/iu, '')
      .replace(/_tecnica$/iu, '')
  );
}

function isTeamCollectionName(collectionName = '') {
  return !collectionName.startsWith('system.')
    && collectionName !== 'classificacao_completa'
    && !GENERIC_COLLECTIONS.has(collectionName)
    && !isStaffCollectionName(collectionName);
}

function looksLikeTeamCollection(collectionName, sampleDocument) {
  if (!isTeamCollectionName(collectionName)) {
    return false;
  }

  if (!sampleDocument) {
    return true;
  }

  if (sampleDocument.cargo) {
    return false;
  }

  return [
    sampleDocument.equipa,
    sampleDocument.nome,
    sampleDocument.id_jogador,
    sampleDocument.numero_camisola,
    sampleDocument.posicao_print
  ].some((value) => value !== undefined && value !== null);
}

function extractStandingsTeamName(row = {}) {
  const directCandidate = [
    row.equipa,
    row.team && typeof row.team === 'object' ? row.team.name : null,
    typeof row.team === 'string' ? row.team : null,
    row.name
  ].find(isNonEmptyString);

  if (directCandidate) {
    return collapseWhitespace(directCandidate);
  }

  const fallbackCandidate = [row.pontos, row.jogos, row.vitorias, row.empates, row.derrotas, row.golos, row.diferenca]
    .find((value) => isNonEmptyString(value) && !isNumericLike(value));

  return fallbackCandidate ? collapseWhitespace(fallbackCandidate) : null;
}

function normalizeStandingsEntry(row = {}) {
  const teamName = extractStandingsTeamName(row);

  if (!teamName) {
    return null;
  }

  return {
    ...row,
    equipa: row.equipa || teamName,
    name: teamName
  };
}

async function readCollectionDocumentsSafe(database, collectionName) {
  try {
    return await database.collection(collectionName).find({}).toArray();
  } catch (_error) {
    return [];
  }
}

async function getChampionshipContext(campeonato) {
  const client = await getClient();
  const database = client.db(campeonato);
  const collectionInfo = await database.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = new Set(collectionInfo.map((entry) => entry.name));
  const teamCollectionNames = [];

  for (const { name } of collectionInfo) {
    if (!isTeamCollectionName(name)) {
      continue;
    }

    let sample = null;
    try {
      sample = await database.collection(name).findOne(
        {},
        { projection: { equipa: 1, nome: 1, id_jogador: 1, numero_camisola: 1, posicao_print: 1, cargo: 1 } }
      );
    } catch (_error) {
      sample = null;
    }

    if (looksLikeTeamCollection(name, sample)) {
      teamCollectionNames.push(name);
    }
  }

  let standings = [];
  if (collectionNames.has('classificacao_completa')) {
    try {
      const latestDocument = await database
        .collection('classificacao_completa')
        .find({})
        .sort({ data_extracao: -1 })
        .limit(1)
        .toArray();

      if (latestDocument.length && Array.isArray(latestDocument[0].classificacao)) {
        standings = latestDocument[0].classificacao
          .map(normalizeStandingsEntry)
          .filter(Boolean);
      }
    } catch (_error) {
      standings = [];
    }
  }

  return {
    database,
    collectionNames,
    teamCollectionNames,
    standings
  };
}

function findClassificationForTeam(standings = [], candidateNames = []) {
  const match = findBestMatch(standings, candidateNames, (entry) => entry.name || entry.equipa || '');
  return match || null;
}

function resolveTeamDisplayName(collectionName, players = [], classification = null) {
  if (classification?.name || classification?.equipa) {
    return collapseWhitespace(classification.name || classification.equipa);
  }

  const playerTeamName = players
    .map((player) => player.equipa || player.teamName || player.name)
    .find(isNonEmptyString);

  return pickPreferredDisplayName(
    classification?.name,
    classification?.equipa,
    prettifyTeamName(playerTeamName),
    prettifyTeamName(collectionName),
    playerTeamName,
    collectionName
  );
}

function findStaffCollectionName(collectionNames, teamCollectionName, teamDisplayName) {
  const names = Array.from(collectionNames || []);
  const candidates = [
    `${teamCollectionName}_tecnica`,
    `${prettifyTeamName(teamCollectionName).replace(/\s+/g, '')}_tecnica`,
    `Equipa Técnica ${teamCollectionName}`,
    `Equipa Tecnica ${teamCollectionName}`,
    `Equipa Técnica ${teamDisplayName}`,
    `Equipa Tecnica ${teamDisplayName}`
  ].filter(isNonEmptyString);

  for (const candidate of candidates) {
    if (collectionNames.has(candidate)) {
      return candidate;
    }
  }

  return names.find((collectionName) =>
    isStaffCollectionName(collectionName)
      && computeTeamNameScore([teamCollectionName, teamDisplayName], stripStaffCollectionDecorators(collectionName)) > 0
  ) || null;
}

function buildTeamRecord(source, collectionName, players = [], staff = [], classification = null) {
  const displayName = resolveTeamDisplayName(collectionName, players, classification);

  return {
    _id: buildSyntheticTeamId(source.campeonato, collectionName),
    collectionName,
    name: displayName,
    equipa: displayName,
    campeonato: source.campeonato,
    ilha: source.island,
    players,
    staff,
    totalPlayers: players.length,
    totalStaff: staff.length,
    classificacao: classification || null
  };
}

async function buildTeamFromCollection(source, context, collectionName) {
  const players = await readCollectionDocumentsSafe(context.database, collectionName);
  const classification = findClassificationForTeam(context.standings, [
    collectionName,
    prettifyTeamName(collectionName),
    players.find((player) => isNonEmptyString(player.equipa))?.equipa
  ]);
  const displayName = resolveTeamDisplayName(collectionName, players, classification);
  const staffCollectionName = findStaffCollectionName(context.collectionNames, collectionName, displayName);
  const staff = staffCollectionName
    ? await readCollectionDocumentsSafe(context.database, staffCollectionName)
    : [];

  return buildTeamRecord(source, collectionName, players, staff, classification);
}

function sortTeams(left, right) {
  const byChampionship = left.campeonato.localeCompare(right.campeonato, 'pt', { sensitivity: 'base' });
  if (byChampionship !== 0) {
    return byChampionship;
  }

  return left.name.localeCompare(right.name, 'pt', { sensitivity: 'base' });
}

async function listTeams() {
  const teams = [];

  for (const source of TEAM_DATABASES) {
    let context;

    try {
      context = await getChampionshipContext(source.campeonato);
    } catch (_error) {
      continue;
    }

    for (const collectionName of context.teamCollectionNames) {
      try {
        teams.push(await buildTeamFromCollection(source, context, collectionName));
      } catch (_error) {
        teams.push(buildTeamRecord(source, collectionName, [], [], null));
      }
    }
  }

  return teams.sort(sortTeams);
}

function findMatchingTeamCollection(context, teamName) {
  let bestCollectionName = null;
  let bestScore = 0;

  for (const collectionName of context.teamCollectionNames) {
    const classification = findClassificationForTeam(context.standings, [collectionName, prettifyTeamName(collectionName)]);
    const score = computeTeamNameScore(
      [
        collectionName,
        prettifyTeamName(collectionName),
        classification?.name,
        classification?.equipa
      ],
      teamName
    );

    if (score > bestScore) {
      bestCollectionName = collectionName;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestCollectionName : null;
}

function mapPlayerDocument(player, teamMeta) {
  const playerId = String(player._id || player.id_jogador || `${teamMeta.collectionName}:${player.nome || player.name || 'player'}`);
  const position = player.posicao || player.posicao_print || player.position || 'Outro';
  const teamName = teamMeta.name || player.equipa || prettifyTeamName(teamMeta.collectionName);

  return {
    _id: playerId,
    id: playerId,
    id_jogador: player.id_jogador || null,
    nome: player.nome || player.name || 'Sem nome',
    name: player.name || player.nome || 'Sem nome',
    numero: String(player.numero_camisola || player.numero || player.number || ''),
    number: Number.parseInt(String(player.numero_camisola || player.numero || player.number || 0), 10) || 0,
    position,
    posicao: position,
    team: teamMeta._id,
    teamId: teamMeta._id,
    teamName,
    campeonato: teamMeta.campeonato,
    photo: player.photo || player.image || null,
    image: player.image || player.photo || null,
    url: player.url || player.photo || player.image || '',
    goals: player.goals || player.golos || 0,
    assists: player.assists || 0
  };
}

function buildMinimalTeamMeta(source, collectionName, playerDocument = {}, classification = null) {
  const displayName = resolveTeamDisplayName(collectionName, [playerDocument], classification);

  return {
    _id: buildSyntheticTeamId(source.campeonato, collectionName),
    collectionName,
    name: displayName,
    equipa: displayName,
    campeonato: source.campeonato,
    ilha: source.island
  };
}

function buildRawPlayerUpdate(field, value) {
  const normalizedValue = value === null || value === undefined ? '' : String(value).trim();

  switch (field) {
    case 'name':
      return { $set: { nome: normalizedValue, name: normalizedValue } };
    case 'numero':
      return { $set: { numero: normalizedValue, numero_camisola: normalizedValue } };
    case 'position':
      return { $set: { posicao: normalizedValue, posicao_print: normalizedValue, position: normalizedValue } };
    case 'email':
      return { $set: { email: normalizedValue ? normalizedValue.toLowerCase() : '' } };
    case 'nickname':
      return { $set: { nickname: normalizedValue } };
    case 'photo':
      return { $set: { photo: normalizedValue, image: normalizedValue, url: normalizedValue } };
    default:
      throw createHttpError('Campo de edição não suportado', 400);
  }
}

function orderPlayersByPosition(players) {
  const groupedPlayers = {};

  for (const player of players) {
    const position = player.position || 'Outro';
    if (!groupedPlayers[position]) {
      groupedPlayers[position] = [];
    }
    groupedPlayers[position].push(player);
  }

  return groupedPlayers;
}

async function loadTeamByName(teamName, campeonato = 'azores_score') {
  const source = getTeamSource(campeonato);
  const context = await getChampionshipContext(source.campeonato);
  const collectionName = findMatchingTeamCollection(context, decodeURIComponent(teamName));

  if (!collectionName) {
    return null;
  }

  return buildTeamFromCollection(source, context, collectionName);
}

async function findPlayersForTeamName(teamName, campeonato = 'azores_score') {
  const team = await loadTeamByName(teamName, campeonato);
  if (!team) {
    return [];
  }

  return team.players.map((player) => mapPlayerDocument(player, team));
}

async function getProtectedTeamRoster(user, teamId) {
  const teams = await listTeams();
  const team = teams.find((entry) => entry._id === String(teamId));

  if (!team) {
    throw createHttpError('Equipa nao encontrada', 404);
  }

  if (isClubManagerRole(user.role) && user.role !== 'admin' && String(user.assignedTeam) !== String(teamId)) {
    throw createHttpError('Acesso negado. Voce pode apenas ver a sua equipa.', 403);
  }

  return {
    id: team._id,
    name: team.name,
    players: team.players.map((player) => mapPlayerDocument(player, team))
  };
}

async function listPlayersByTeamName(teamName, campeonato = 'azores_score') {
  const players = await findPlayersForTeamName(teamName, campeonato);
  if (!players.length) {
    throw createHttpError('Nenhum jogador encontrado', 404);
  }

  return orderPlayersByPosition(players);
}

function buildPlayerLookupQuery(playerId) {
  const filters = [{ id_jogador: playerId }, { _id: playerId }];

  if (ObjectId.isValid(playerId)) {
    filters.push({ _id: new ObjectId(playerId) });
  }

  return { $or: filters };
}

async function findPlayerDetailsAcrossDatabases(playerId) {
  for (const source of TEAM_DATABASES) {
    let context;

    try {
      context = await getChampionshipContext(source.campeonato);
    } catch (_error) {
      continue;
    }

    const query = buildPlayerLookupQuery(playerId);

    for (const collectionName of context.teamCollectionNames) {
      try {
        const playerDocument = await context.database.collection(collectionName).findOne(query);

        if (!playerDocument) {
          continue;
        }

        const classification = findClassificationForTeam(context.standings, [
          collectionName,
          prettifyTeamName(collectionName),
          playerDocument.equipa
        ]);
        const teamMeta = buildMinimalTeamMeta(source, collectionName, playerDocument, classification);

        return {
          player: mapPlayerDocument(playerDocument, teamMeta),
          context,
          source,
          collectionName,
          query
        };
      } catch (_error) {
        continue;
      }
    }
  }

  return null;
}

async function getPlayerDetails(playerId) {
  const playerRecord = await findPlayerDetailsAcrossDatabases(playerId);

  if (!playerRecord) {
    throw createHttpError('Jogador nao encontrado', 404);
  }

  return playerRecord.player;
}

async function updatePlayerField(playerId, field, value) {
  const playerRecord = await findPlayerDetailsAcrossDatabases(playerId);

  if (!playerRecord) {
    throw createHttpError('Jogador nao encontrado', 404);
  }

  await playerRecord.context.database.collection(playerRecord.collectionName).updateOne(
    playerRecord.query,
    buildRawPlayerUpdate(field, value)
  );

  const updatedDocument = await playerRecord.context.database.collection(playerRecord.collectionName).findOne(playerRecord.query);
  if (!updatedDocument) {
    throw createHttpError('Jogador nao encontrado', 404);
  }

  const classification = findClassificationForTeam(playerRecord.context.standings, [
    playerRecord.collectionName,
    prettifyTeamName(playerRecord.collectionName),
    updatedDocument.equipa
  ]);
  const teamMeta = buildMinimalTeamMeta(playerRecord.source, playerRecord.collectionName, updatedDocument, classification);
  return mapPlayerDocument(updatedDocument, teamMeta);
}

async function findLegacyPlayersForClubName(clubName) {
  if (!clubName || typeof clubName !== 'string') {
    return [];
  }

  for (const source of TEAM_DATABASES) {
    try {
      const team = await loadTeamByName(clubName, source.campeonato);
      if (team && team.players && team.players.length > 0) {
        return team.players.map((player) => mapPlayerDocument(player, team));
      }
    } catch (_error) {
      continue;
    }
  }

  return [];
}

module.exports = {
  listTeams,
  findPlayersForTeamName,
  findLegacyPlayersForClubName,
  getProtectedTeamRoster,
  listPlayersByTeamName,
  getPlayerDetails,
  updatePlayerField
};