const asyncHandler = require('../utils/asyncHandler');
const teamManagerService = require('../services/teamManagerService');

exports.getMatchDetails = asyncHandler(async (req, res) => {
  const data = await teamManagerService.getMatchDetails(req.user, req.params.id);
  res.json(data);
});

exports.listMatches = asyncHandler(async (req, res) => {
  const result = await teamManagerService.listMatches(req.user, req.query);
  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    message: result.message
  });
});

exports.listPlayers = asyncHandler(async (req, res) => {
  const result = await teamManagerService.listTeamPlayers(req.user, req.query);
  res.json({
    success: true,
    data: result.data,
    byPosition: result.byPosition,
    teamName: result.teamName,
    pagination: result.pagination,
    message: result.message
  });
});

exports.getDashboard = asyncHandler(async (req, res) => {
  const result = await teamManagerService.getDashboard(req.user, req.query);
  res.json({
    success: true,
    ...result
  });
});