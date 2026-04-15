const Competition = require('../models/Competition');
const asyncHandler = require('../utils/asyncHandler');

exports.listCompetitions = asyncHandler(async (req, res) => {
  const status = String(req.query.status || '').trim();
  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }

  const competitions = await Competition.find(filter)
    .populate('teams', 'name logo island')
    .sort({ season: -1, name: 1 })
    .lean();

  res.json({ success: true, data: competitions });
});