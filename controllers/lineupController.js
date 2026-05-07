const asyncHandler = require('../utils/asyncHandler');
const lineupService = require('../services/lineupService');

const matchLineupFlow = require('../services/matchLineupFlowService');

exports.saveLineup = asyncHandler(async (req, res) => {
  const lineup = await lineupService.saveLineup(req.user, req.body);

  // If this request explicitly submitted the lineup, run the state machine
  if (req.body && req.body.submitted) {
    try {
      // Pass the Express app to allow optional Socket.io emission
      await matchLineupFlow.processSubmission(String(lineup.match._id || lineup.match), String(lineup.team._id || lineup.team), req.app);
    } catch (err) {
      // Log but do not block response (validation already passed)
      // Return info to client about state machine errors
      return res.status(500).json({ success: false, message: 'Erro ao processar fluxo de escalações', details: err.message });
    }
  }

  res.json({
    success: true,
    message: 'Escalação guardada com sucesso',
    data: lineup
  });
});

exports.getMatchLineups = asyncHandler(async (req, res) => {
  const lineups = await lineupService.getMatchLineups(req.user, req.params.matchId);
  res.json({ success: true, data: lineups });
});

exports.getTeamLineup = asyncHandler(async (req, res) => {
  const lineup = await lineupService.getTeamLineup(req.user, req.params.matchId, req.params.teamId);
  res.json({ success: true, data: lineup });
});

exports.deleteLineup = asyncHandler(async (req, res) => {
  await lineupService.deleteLineup(req.user, req.params.matchId, req.params.teamId);
  res.json({ success: true, message: 'Escalação removida com sucesso' });
});