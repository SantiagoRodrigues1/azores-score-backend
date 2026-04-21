const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const logger = require('../utils/logger');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { generateMatchesFromCollections } = require('../services/matchGenerator');

// Statuses where the scoreline is meaningful and should be shown
const ACTIVE_STATUSES = new Set(['live', 'halftime', 'second_half', 'finished']);

/**
 * Maps a Match document to the compact format consumed by the frontend.
 * The `resultado` field is only populated for matches that are in progress
 * or finished, so the frontend can distinguish "not started" from "0-0".
 */
function mapMatchToCompact(m) {
  const homeTeamName = m.homeTeam?.name || 'Equipa Casa';
  const awayTeamName = m.awayTeam?.name || 'Equipa Fora';
  const competitionName = m.competition?.name || 'Sem Competição';

  return {
    _id: m._id,
    casa: homeTeamName,
    fora: awayTeamName,
    homeTeam: m.homeTeam
      ? { id: m.homeTeam._id, name: m.homeTeam.name, logo: m.homeTeam.logo || null }
      : null,
    awayTeam: m.awayTeam
      ? { id: m.awayTeam._id, name: m.awayTeam.name, logo: m.awayTeam.logo || null }
      : null,
    data_hora: m.date,
    status: m.status,
    // Only include scoreline when the match has actually started
    resultado: ACTIVE_STATUSES.has(m.status)
      ? `${m.homeScore || 0}-${m.awayScore || 0}`
      : null,
    competicao: competitionName,
    estadio: m.stadium || null
  };
}

/**
 * GET /api/matches-by-competition
 * Returns all non-cancelled matches grouped by competition name, then by date.
 * Each competition entry follows the ChampionshipStanding shape expected by the
 * frontend's useMatchesByCompetitionQuery hook.
 */
router.get('/', async (req, res) => {
  try {
    const matches = await Match.find({ status: { $ne: 'cancelled' } })
      .populate('homeTeam', 'name logo')
      .populate('awayTeam', 'name logo')
      .populate('competition', 'name')
      .sort({ date: 1, time: 1 })
      .lean();

    // Group matches by competition, then by calendar date string
    const byCompetition = new Map();

    for (const m of matches) {
      const compName = m.competition?.name || 'Sem Competição';
      if (!byCompetition.has(compName)) {
        byCompetition.set(compName, new Map());
      }

      const dateKey = m.date
        ? new Date(m.date).toLocaleDateString('pt-PT')
        : new Date().toLocaleDateString('pt-PT');

      const byDate = byCompetition.get(compName);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }

      byDate.get(dateKey).push(mapMatchToCompact(m));
    }

    const result = [];
    for (const [compName, byDate] of byCompetition) {
      const proximos_jogos = [];
      for (const [dia, jogos] of byDate) {
        proximos_jogos.push({ dia, jogos });
      }

      result.push({
        campeonato: compName,
        temporada: new Date().getFullYear().toString(),
        proximos_jogos
      });
    }

    res.json(result);
  } catch (err) {
    logger.error('Erro ao buscar matches por competição', err);
    res.status(500).json({ error: 'Erro ao carregar jogos' });
  }
});

/**
 * POST /api/matches-by-competition/generate
 * Admin-only. Deletes all matches and regenerates them grouped by island.
 */
router.post('/generate', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await generateMatchesFromCollections();
    res.json({
      success: true,
      message: `${result.created} jogos gerados para: ${result.competitions.join(', ')}.`,
      created: result.created,
      competitions: result.competitions
    });
  } catch (err) {
    logger.error('Erro ao gerar jogos', err);
    res.status(500).json({ success: false, error: 'Erro ao gerar jogos' });
  }
});

module.exports = router;
