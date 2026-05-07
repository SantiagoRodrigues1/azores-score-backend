const Match = require('../models/Match');
const Lineup = require('../models/Lineup');
const LiveMatchService = require('./liveMatchService');
const logger = require('../utils/logger');

/**
 * Match Lineup Flow Service
 * - Computes the current pre-match lineup state
 * - Updates Match.lineupState accordingly
 * - If both teams have submitted valid lineups, triggers auto-start
 */

async function computeState(matchId) {
  const match = await Match.findById(matchId).lean();
  if (!match) {
    throw new Error('Jogo não encontrado');
  }

  const homeTeamId = String(match.homeTeam);
  const awayTeamId = String(match.awayTeam);

  const lineups = await Lineup.find({ match: matchId }).lean();

  const homeLineup = lineups.find(l => String(l.team) === homeTeamId) || null;
  const awayLineup = lineups.find(l => String(l.team) === awayTeamId) || null;

  // Determine state
  let state = 'waiting_lineups';
  if (homeLineup && homeLineup.submitted && (!awayLineup || !awayLineup.submitted)) {
    state = 'home_ready';
  }
  if (awayLineup && awayLineup.submitted && (!homeLineup || !homeLineup.submitted)) {
    state = 'away_ready';
  }
  if (homeLineup && homeLineup.submitted && awayLineup && awayLineup.submitted) {
    state = 'ready_to_start';
  }

  return { state, match, homeLineup, awayLineup };
}

async function processSubmission(matchId, teamId, app) {
  try {
    const { state, match } = await computeState(matchId);

    const prevState = match.lineupState || 'waiting_lineups';
    if (state !== prevState) {
      await Match.findByIdAndUpdate(matchId, { lineupState: state }, { new: true });
      logger.info(`Match ${matchId} lineupState: ${prevState} -> ${state}`);
    }

    const io = app && app.get ? app.get('io') : null;
    if (io) {
      io.emit(`match:${matchId}:lineup_state`, { state });
    }

    // Auto-start when both teams ready
    if (state === 'ready_to_start') {
      // Only auto-start if match isn't already live
      if (match.status !== 'live') {
        logger.info(`Auto-starting match ${matchId} because both lineups submitted`);
        const startedMatch = await LiveMatchService.startMatch(matchId);

        // Update lineupState to live
        await Match.findByIdAndUpdate(matchId, { lineupState: 'live' });

        if (io) {
          io.emit(`match:${matchId}:update`, { event: 'match_started_auto', match: startedMatch });
        }
      }
    }

    return true;
  } catch (error) {
    logger.error('Failed to process lineup submission flow', error.message);
    throw error;
  }
}

module.exports = { processSubmission, computeState };
