// services/matchGenerator.js
// Reads teams from separate championship databases and generates
// round-robin fixtures. Each database = one championship.
// Teams from different databases are NEVER mixed.

const { MongoClient } = require('mongodb');
const Match = require('../models/Match');
const Club = require('../models/Club');
const Competition = require('../models/Competition');
const { getMongoUri } = require('../config/env');

// Championship databases and their display names
const CHAMPIONSHIP_DATABASES = [
  { dbName: 'azores_score',         champName: 'Campeonato Açores' },
  { dbName: 'campeonato_graciosa',  champName: 'Campeonato Graciosa' },
  { dbName: 'campeonato_horta',     champName: 'Campeonato Horta' },
  { dbName: 'campeonato_sao_jorge', champName: 'Campeonato São Jorge' },
  { dbName: 'campeonato_sao_miguel', champName: 'Campeonato São Miguel' },
  { dbName: 'campeonato_terceira',  champName: 'Campeonato Terceira' },
];

// Collections in azores_score that are NOT team roster collections
const AZORES_SCORE_SYSTEM_COLLECTIONS = new Set([
  'jogadores', 'adminusers', 'users', 'referees', 'matchreports', 'lineups',
  'scorers', 'reports', 'stripewebhookevents', 'notifications', 'players',
  'auditlogs', 'refereeprofiles', 'classificacao_completa', 'news', 'clubs',
  'competitions', 'socialposts', 'melhores_marcadores', 'viewevents',
  'imageuploads', 'equipas_descricao', 'submissions', 'favoriteteams',
  'editrequests', 'matches', 'standings', 'comments', 'likes',
  'matches_jornada_15',
]);

/**
 * Returns true if the collection name represents a team roster.
 * Excludes technical staff, standings, and system collections.
 */
function isTeamCollection(collName, dbName) {
  if (collName.endsWith('_tecnica')) return false;
  if (collName === 'classificacao_completa') return false;
  if (collName.startsWith('Equipa')) return false;
  if (dbName === 'azores_score' && AZORES_SCORE_SYSTEM_COLLECTIONS.has(collName)) return false;
  return true;
}

/**
 * Finds an existing Club by name or creates a new one.
 * Collection name from the championship DB is used as the club name.
 */
async function findOrCreateClub(teamName) {
  let club = await Club.findOne({ name: teamName }).lean();
  if (!club) {
    club = await Club.create({ name: teamName });
    club = club.toObject();
  }
  return club._id;
}

/**
 * Finds an existing Competition by name or creates a new one.
 */
async function findOrCreateCompetition(champName, season) {
  let comp = await Competition.findOne({ name: champName });
  if (!comp) {
    comp = await Competition.create({
      name: champName,
      season,
      type: 'league',
      status: 'active',
    });
  }
  return comp._id;
}

/**
 * Generates round-robin fixtures (home + away) for a list of Club ObjectIds.
 * Dates are spread one week apart starting from startDate.
 * All teams are guaranteed to be from the same championship database.
 */
function buildRoundRobin(clubIds, competitionId, startDate) {
  const fixtures = [];
  let weekOffset = 0;

  for (let i = 0; i < clubIds.length; i++) {
    for (let j = 0; j < clubIds.length; j++) {
      if (i === j) continue;

      const matchDate = new Date(startDate);
      matchDate.setDate(matchDate.getDate() + weekOffset * 7);

      fixtures.push({
        homeTeam: clubIds[i],
        awayTeam: clubIds[j],
        competition: competitionId,
        date: matchDate,
        status: 'scheduled',
        homeScore: 0,
        awayScore: 0,
      });

      weekOffset++;
    }
  }

  return fixtures;
}

/**
 * Main generator:
 * 1. Deletes all existing matches.
 * 2. For each championship database, reads team collections (one collection = one team).
 * 3. Finds or creates Club and Competition documents in the main DB.
 * 4. Generates round-robin fixtures — teams from different databases are NEVER mixed.
 * 5. Bulk-inserts all fixtures.
 *
 * @returns {{ created: number, competitions: string[] }}
 */
async function generateMatchesFromCollections() {
  // Build a base URI without the database path so we can access all databases
  const rawUri = getMongoUri() || 'mongodb://127.0.0.1:27017';
  let baseUri;
  try {
    // new URL() parses mongodb:// URIs when we swap the protocol temporarily
    const parsed = new URL(rawUri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    const proto = rawUri.startsWith('mongodb+srv://') ? 'mongodb+srv://' : 'mongodb://';
    const auth = parsed.username
      ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}@`
      : '';
    baseUri = `${proto}${auth}${parsed.host}`; // host includes port
  } catch {
    baseUri = 'mongodb://127.0.0.1:27017';
  }

  const client = new MongoClient(baseUri);
  await client.connect();

  try {
    // 1. Delete all existing matches
    await Match.deleteMany({});

    const season = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7); // first match one week from now

    const allFixtures = [];
    const competitionNames = [];

    // 2. Process each championship database
    for (const { dbName, champName } of CHAMPIONSHIP_DATABASES) {
      const db = client.db(dbName);
      const allCollections = await db.listCollections().toArray();

      // Filter to team roster collections only
      const teamCollections = allCollections
        .map(c => c.name)
        .filter(name => isTeamCollection(name, dbName));

      // Need at least 2 teams to generate matches
      if (teamCollections.length < 2) continue;

      // 3. Find or create a Club document for each team (by collection name)
      const clubIds = [];
      for (const teamName of teamCollections) {
        const clubId = await findOrCreateClub(teamName);
        clubIds.push(clubId);
      }

      // 4. Find or create the Competition document
      const competitionId = await findOrCreateCompetition(champName, season);

      // 5. Generate round-robin fixtures — all teams are from this database only
      const fixtures = buildRoundRobin(clubIds, competitionId, startDate);
      allFixtures.push(...fixtures);
      competitionNames.push(`${champName} (${clubIds.length} equipas)`);
    }

    // 6. Bulk-insert all fixtures
    if (allFixtures.length > 0) {
      await Match.insertMany(allFixtures);
    }

    return { created: allFixtures.length, competitions: competitionNames };

  } finally {
    await client.close();
  }
}

module.exports = { generateMatchesFromCollections };

