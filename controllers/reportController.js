const Report = require('../models/Report');
const SocialPost = require('../models/SocialPost');
const asyncHandler = require('../utils/asyncHandler');

exports.createReport = asyncHandler(async (req, res) => {
  const report = await Report.create({
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    reason: req.body.reason,
    details: req.body.details || null,
    reportedBy: req.user.id
  });

  if (req.body.entityType === 'post') {
    await SocialPost.findByIdAndUpdate(req.body.entityId, { $inc: { reportsCount: 1 } });
  }

  res.status(201).json({ success: true, data: report });
});

exports.listReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ status: req.query.status || 'pending' })
    .populate('reportedBy', 'name email')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: reports });
});

exports.reviewReport = asyncHandler(async (req, res) => {
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, reviewedBy: req.user.id },
    { new: true }
  );

  if (!report) {
    return res.status(404).json({ success: false, message: 'Denúncia não encontrada' });
  }

  res.json({ success: true, data: report });
});
