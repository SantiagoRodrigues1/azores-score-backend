const asyncHandler = require('../utils/asyncHandler');
const lineupService = require('../services/lineupService');

exports.saveLineup = asyncHandler(async (req, res) => {
  const lineup = await lineupService.saveLineup(req.user, req.body);
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