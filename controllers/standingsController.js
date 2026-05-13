// controllers/standingsController.js
const { MongoClient } = require('mongodb');
const { loadEnv, getMongoUri } = require('../config/env');
const logger = require('../utils/logger');
const Standing = require('../models/Standing');

loadEnv();

const uri = getMongoUri();
const client = new MongoClient(uri);

let mongoClient;

const LIVE_MATCH_STATUSES = new Set(['live', 'halftime', 'second_half']);

function toTimestamp(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMatchStatus(status) {
  if (status === 'finished') {
    return 'finished';
  }

  if (LIVE_MATCH_STATUSES.has(status)) {
    return 'live';
  }

  return 'scheduled';
}

function resolveSeasonFromMatches(matches = []) {
  const years = matches
    .map((match) => new Date(match?.date || match?.createdAt || 0).getFullYear())
    .filter((year) => Number.isFinite(year) && year > 2000)
    .sort((left, right) => left - right);

  if (!years.length) {
    return String(new Date().getFullYear());
  }

  const minYear = years[0];
  const maxYear = years[years.length - 1];
  if (minYear === maxYear) {
    return String(maxYear);
  }

  return `${minYear}/${maxYear}`;
}

function buildClubLookup(clubs = []) {
  return new Map(clubs.map((club) => [String(club._id), club]));
}

function getClubName(clubsById, clubId) {
  return clubsById.get(String(clubId || ''))?.name || 'Equipa';
}

function formatGoalScorer(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/^player-/iu, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\bnull\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || value;
}

function buildAzoresStandingsFromMatches(matches = [], clubs = []) {
  const clubsById = buildClubLookup(clubs);
  const standings = new Map();
  const finishedMatches = matches.filter((match) => match?.status === 'finished');

  function ensureTeam(clubId) {
    const key = String(clubId || '');

    if (!standings.has(key)) {
      standings.set(key, {
        equipa: getClubName(clubsById, key),
        jogos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        golosMarcados: 0,
        golosSofridos: 0,
        pontos: 0
      });
    }

    return standings.get(key);
  }

  for (const match of finishedMatches) {
    const home = ensureTeam(match.homeTeam);
    const away = ensureTeam(match.awayTeam);
    const homeScore = Number(match.homeScore || 0);
    const awayScore = Number(match.awayScore || 0);

    home.jogos += 1;
    away.jogos += 1;
    home.golosMarcados += homeScore;
    home.golosSofridos += awayScore;
    away.golosMarcados += awayScore;
    away.golosSofridos += homeScore;

    if (homeScore > awayScore) {
      home.vitorias += 1;
      away.derrotas += 1;
      home.pontos += 3;
    } else if (homeScore < awayScore) {
      away.vitorias += 1;
      home.derrotas += 1;
      away.pontos += 3;
    } else {
      home.empates += 1;
      away.empates += 1;
      home.pontos += 1;
      away.pontos += 1;
    }
  }

  return Array.from(standings.values())
    .sort((left, right) => {
      if (right.pontos !== left.pontos) {
        return right.pontos - left.pontos;
      }

      if (right.vitorias !== left.vitorias) {
        return right.vitorias - left.vitorias;
      }

      const goalDifferenceDelta = (right.golosMarcados - right.golosSofridos) - (left.golosMarcados - left.golosSofridos);
      if (goalDifferenceDelta !== 0) {
        return goalDifferenceDelta;
      }

      return left.equipa.localeCompare(right.equipa, 'pt', { sensitivity: 'base' });
    })
    .map((team, index) => ({
      posicao: String(index + 1),
      equipa: team.equipa,
      pontos: String(team.pontos),
      jogos: String(team.jogos),
      vitorias: String(team.vitorias),
      empates: String(team.empates),
      derrotas: String(team.derrotas),
      golos: `${team.golosMarcados}-${team.golosSofridos}`,
      diferenca: String(team.golosMarcados - team.golosSofridos)
    }));
}

function buildAzoresTopScorers(matches = [], clubs = []) {
  const clubsById = buildClubLookup(clubs);
  const scorers = new Map();

  for (const match of matches) {
    for (const event of Array.isArray(match?.events) ? match.events : []) {
      if (event?.type !== 'goal') {
        continue;
      }

      const playerName = formatGoalScorer(event.player);
      if (!playerName) {
        continue;
      }

      const teamName = getClubName(clubsById, event.team);
      const key = `${playerName}::${teamName}`;
      const current = scorers.get(key) || { jogador: playerName, equipa: teamName, golos: 0 };
      current.golos += 1;
      scorers.set(key, current);
    }
  }

  return Array.from(scorers.values())
    .sort((left, right) => right.golos - left.golos || left.jogador.localeCompare(right.jogador, 'pt', { sensitivity: 'base' }))
    .slice(0, 10);
}

function buildAzoresUpcomingMatches(matches = [], clubs = []) {
  const clubsById = buildClubLookup(clubs);
  const upcomingMatches = matches
    .filter((match) => !['finished', 'cancelled', 'postponed'].includes(String(match?.status || '')))
    .sort((left, right) => toTimestamp(left?.date) - toTimestamp(right?.date))
    .slice(0, 10)
    .map((match) => ({
      casa: getClubName(clubsById, match.homeTeam),
      fora: getClubName(clubsById, match.awayTeam),
      data_hora: match.date ? new Date(match.date).toISOString() : '',
      status: normalizeMatchStatus(match.status),
      resultado: LIVE_MATCH_STATUSES.has(String(match.status || ''))
        ? `${Number(match.homeScore || 0)}-${Number(match.awayScore || 0)}`
        : undefined
    }));

  return upcomingMatches.length ? [{ jogos: upcomingMatches }] : [];
}

/**
 * Builds azores_score standings from the Standing mongoose model (updated on match finish).
 * This is the PRIMARY source of truth when live match data is available.
 */
async function buildAzoresScoreFromStandingModel() {
  try {
    const allStandings = await Standing.find({}).sort({ points: -1, goalDifference: -1, goalsFor: -1 }).lean();
    if (!allStandings.length) return null;

    // Group by league+season and pick the most recently updated group
    const grouped = new Map();
    for (const s of allStandings) {
      const key = `${s.league}::${s.season}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(s);
    }

    // Use the group with the most recent lastUpdated
    let bestGroup = null;
    let bestTime = 0;
    for (const [, entries] of grouped) {
      const latest = Math.max(...entries.map((e) => new Date(e.lastUpdated || e.updatedAt || 0).getTime()));
      if (latest > bestTime) { bestTime = latest; bestGroup = entries; }
    }

    if (!bestGroup || !bestGroup.length) return null;

    // Sort by position
    bestGroup.sort((a, b) => a.position - b.position);

    const classificacao = bestGroup.map((s, idx) => ({
      posicao: String(idx + 1),
      equipa: s.team,
      pontos: String(s.points),
      jogos: String(s.played),
      vitorias: String(s.won),
      empates: String(s.drawn),
      derrotas: String(s.lost),
      golos: `${s.goalsFor}-${s.goalsAgainst}`,
      diferenca: String(s.goalDifference)
    }));

    return {
      campeonato: 'azores_score',
      temporada: bestGroup[0].season,
      classificacao,
      melhores_marcadores: [],
      proximos_jogos: [],
      data_extracao: new Date(bestTime).toISOString(),
      status: 'live_standings'
    };
  } catch (_error) {
    return null;
  }
}

async function buildAzoresScoreFromMatches(mongo) {
  try {
    const database = mongo.db('azores_score');
    const [clubs, matches] = await Promise.all([
      database.collection('clubs').find({}).toArray(),
      database.collection('matches').find({}).toArray()
    ]);

    if (!matches.length) {
      return null;
    }

    const classificacao = buildAzoresStandingsFromMatches(matches, clubs);
    if (!classificacao.length) {
      return null;
    }

    const latestActivity = matches
      .map((match) => match.updatedAt || match.date || match.createdAt)
      .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] || null;

    return {
      campeonato: 'azores_score',
      temporada: resolveSeasonFromMatches(matches),
      classificacao,
      melhores_marcadores: buildAzoresTopScorers(matches, clubs),
      proximos_jogos: buildAzoresUpcomingMatches(matches, clubs),
      data_extracao: latestActivity,
      status: 'generated_from_matches'
    };
  } catch (_error) {
    return null;
  }
}

function buildSyntheticAzoresAggregate(entries = []) {
  const regionalEntries = entries.filter((entry) => entry?.campeonato && entry.campeonato !== 'azores_score');
  if (!regionalEntries.length) {
    return null;
  }

  const latestExtraction = regionalEntries
    .map((entry) => entry.data_extracao)
    .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] || null;

  return {
    campeonato: 'azores_score',
    temporada: regionalEntries.map((entry) => entry.temporada).find(Boolean) || String(new Date().getFullYear()),
    classificacao: regionalEntries.flatMap((entry) =>
      (Array.isArray(entry.classificacao) ? entry.classificacao : []).map((row) => ({
        ...row,
        campeonato_origem: entry.campeonato
      }))
    ),
    melhores_marcadores: regionalEntries.flatMap((entry) =>
      (Array.isArray(entry.melhores_marcadores) ? entry.melhores_marcadores : []).map((row) => ({
        ...row,
        campeonato_origem: entry.campeonato
      }))
    ),
    proximos_jogos: regionalEntries.flatMap((entry) => Array.isArray(entry.proximos_jogos) ? entry.proximos_jogos : []),
    data_extracao: latestExtraction,
    status: 'fallback_aggregate'
  };
}

function hasStandingsData(entry) {
  return Boolean(entry && Array.isArray(entry.classificacao) && entry.classificacao.length > 0);
}

async function getClient() {
  if (!mongoClient) {
    await client.connect();
    mongoClient = client;
    logger.debug('Standings MongoDB client connected');
  }
  return mongoClient;
}

const CAMPEONATOS = [
  'campeonato_sao_miguel',
  'campeonato_terceira',
  'campeonato_sao_jorge',
  'campeonato_graciosa',
  'campeonato_horta',
  'azores_score',
];

exports.getStandings = async (req, res) => {
  try {
    const { campeonato } = req.query; // opcional
    const mongo = await getClient();

    const campeonatosParaBuscar = campeonato
      ? [campeonato]
      : CAMPEONATOS;

    const resultadoFinal = [];

    for (const nomeDB of campeonatosParaBuscar) {
      const db = mongo.db(nomeDB);

      // 👉 o scraper guarda tudo nesta coleção
      const collection = db.collection('classificacao_completa');

      // pega SEMPRE o mais recente
      const doc = await collection
        .find({})
        .sort({ data_extracao: -1 })
        .limit(1)
        .toArray();

      if (doc.length) {
        resultadoFinal.push({
          campeonato: nomeDB,
          temporada: doc[0].temporada,
          classificacao: doc[0].classificacao,
          melhores_marcadores: doc[0].melhores_marcadores,
          proximos_jogos: doc[0].proximos_jogos,
          data_extracao: doc[0].data_extracao
        });
      }
    }

    const hasRealAzores = resultadoFinal.some((entry) => entry.campeonato === 'azores_score' && hasStandingsData(entry));
    if (!hasRealAzores && (!campeonato || campeonato === 'azores_score')) {
      // 1st priority: Standing model populated by finishMatch (live match data)
      const liveModelData = await buildAzoresScoreFromStandingModel();
      // 2nd priority: recalculate from raw matches in azores_score DB
      const generatedAzores = liveModelData || await buildAzoresScoreFromMatches(mongo);
      const fallbackAzores = generatedAzores || buildSyntheticAzoresAggregate(resultadoFinal);

      if (fallbackAzores) {
        if (campeonato === 'azores_score') {
          return res.json([fallbackAzores]);
        }

        resultadoFinal.unshift(fallbackAzores);
      }
    }

    if (campeonato === 'azores_score') {
      const azoresEntries = resultadoFinal.filter((entry) => entry.campeonato === 'azores_score');
      return res.json(azoresEntries);
    }

    res.json(resultadoFinal);
  } catch (err) {
    logger.error('Failed to load standings', err.message);
    res.status(500).json({ error: 'Erro ao carregar classificações' });
  }
};
