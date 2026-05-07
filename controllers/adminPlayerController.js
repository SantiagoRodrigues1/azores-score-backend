const asyncHandler = require('../utils/asyncHandler');
const adminPlayerService = require('../services/adminPlayerService');

exports.listPlayers = asyncHandler(async (req, res) => {
  const result = await adminPlayerService.listPlayers(req.query);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

exports.createPlayer = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    teamName: req.params.teamName ? decodeURIComponent(req.params.teamName) : req.body.teamName
  };
  const player = await adminPlayerService.createPlayer(payload, {
    actor: req.user,
    requestMeta: {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }
  });
  res.status(201).json({ success: true, data: player });
});

exports.updatePlayer = asyncHandler(async (req, res) => {
  const player = await adminPlayerService.updatePlayer(req.params.id, req.body, {
    actor: req.user,
    requestMeta: {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }
  });
  res.json({ success: true, data: player });
});

exports.deletePlayer = asyncHandler(async (req, res) => {
  await adminPlayerService.deletePlayer(req.params.id, {
    actor: req.user,
    requestMeta: {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }
  });
  res.json({ success: true });
});