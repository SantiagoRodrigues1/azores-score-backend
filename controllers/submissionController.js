const Submission = require('../models/Submission');
const Player = require('../models/Player');
const Club = require('../models/Club');
const Match = require('../models/Match');
const asyncHandler = require('../utils/asyncHandler');
const { createUserNotification } = require('../services/features/notificationService');
const { materializeSubmission, normalizeSubmissionPayload } = require('../services/features/submissionService');

exports.createSubmission = asyncHandler(async (req, res) => {
  const normalizedData = await normalizeSubmissionPayload({
    type: req.body.type,
    data: req.body.data,
    userId: req.user.id
  });

  const submission = await Submission.create({
    type: req.body.type,
    data: normalizedData,
    userId: req.user.id
  });

  res.status(201).json({ success: true, data: submission });
});

exports.listMySubmissions = asyncHandler(async (req, res) => {
  const submissions = await Submission.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: submissions });
});

exports.listPendingSubmissions = asyncHandler(async (req, res) => {
  const submissions = await Submission.find({ status: req.query.status || 'pending' })
    .populate('userId', 'name email role')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: submissions });
});

exports.reviewSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id);
  if (!submission) {
    return res.status(404).json({ success: false, message: 'Submissão não encontrada' });
  }

  if (submission.status !== 'pending') {
    return res.status(409).json({ success: false, message: 'Esta submissão já foi revista.' });
  }

  let materialized = null;
  const nextStatus = req.body.status;

  if (nextStatus === 'approved') {
    const normalizedData = await normalizeSubmissionPayload({
      type: submission.type,
      data: submission.data,
      userId: submission.userId.toString()
    });

    materialized = await materializeSubmission({ type: submission.type, data: normalizedData });
    submission.data = normalizedData;
    submission.materializedEntityType = materialized.entityType;
    submission.materializedEntityId = materialized.entityId;
    submission.materializedAt = new Date();
  }

  submission.status = nextStatus;
  submission.reviewNote = req.body.reviewNote || null;
  submission.reviewedBy = req.user.id;
  await submission.save();

  await createUserNotification({
    userId: submission.userId,
    title: `Submissão ${submission.status === 'approved' ? 'aprovada' : 'rejeitada'}`,
    message: submission.status === 'approved'
      ? 'A tua contribuição foi aprovada pela administração.'
      : `A tua contribuição foi rejeitada.${submission.reviewNote ? ` Motivo: ${submission.reviewNote}` : ''}`,
    type: submission.status === 'approved' ? 'pedido_aprovado' : 'pedido_rejeitado'
  });

  res.json({ success: true, data: submission });
});
