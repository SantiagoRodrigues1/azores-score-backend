// controllers/awardController.js
const AwardWinner = require('../models/AwardWinner');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/awards?type=&month=&year=
exports.listAwards = asyncHandler(async (req, res) => {
  const { type, month, year } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (month) filter.month = Number(month);
  if (year) filter.year = Number(year);

  const awards = await AwardWinner.find(filter)
    .populate('player', 'name numero photo position')
    .populate('createdBy', 'name')
    .sort({ year: -1, month: -1 })
    .lean();

  res.json({ success: true, data: awards });
});

// GET /api/awards/:id
exports.getAwardById = asyncHandler(async (req, res) => {
  const award = await AwardWinner.findById(req.params.id)
    .populate('player', 'name numero photo position team')
    .populate('createdBy', 'name')
    .lean();

  if (!award) {
    return res.status(404).json({ success: false, message: 'Prémio não encontrado' });
  }
  res.json({ success: true, data: award });
});

// POST /api/awards  (admin or journalist)
exports.createAward = asyncHandler(async (req, res) => {
  const award = await AwardWinner.create({ ...req.body, createdBy: req.user.id });
  const populated = await AwardWinner.findById(award._id)
    .populate('player', 'name numero photo position');
  res.status(201).json({ success: true, data: populated });
});

// PUT /api/awards/:id  (admin or journalist)
exports.updateAward = asyncHandler(async (req, res) => {
  const award = await AwardWinner.findByIdAndUpdate(req.params.id, req.body, { new: true })
    .populate('player', 'name numero photo position');
  if (!award) {
    return res.status(404).json({ success: false, message: 'Prémio não encontrado' });
  }
  res.json({ success: true, data: award });
});

// DELETE /api/awards/:id  (admin only)
exports.deleteAward = asyncHandler(async (req, res) => {
  const award = await AwardWinner.findByIdAndDelete(req.params.id);
  if (!award) {
    return res.status(404).json({ success: false, message: 'Prémio não encontrado' });
  }
  res.json({ success: true, message: 'Prémio removido' });
});
