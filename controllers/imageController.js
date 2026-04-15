const ImageUpload = require('../models/ImageUpload');
const Player = require('../models/Player');
const asyncHandler = require('../utils/asyncHandler');
const { uploadBase64Image } = require('../services/features/cloudinaryService');
const { createUserNotification } = require('../services/features/notificationService');

exports.uploadPlayerImage = asyncHandler(async (req, res) => {
  const player = await Player.findById(req.body.playerId);
  if (!player) {
    return res.status(404).json({ success: false, message: 'Jogador não encontrado' });
  }

  const upload = await uploadBase64Image(req.body.imageBase64, 'azores-score/players');
  const image = await ImageUpload.create({
    url: upload.url,
    publicId: upload.publicId,
    provider: upload.provider,
    mimeType: upload.mimeType,
    sizeBytes: upload.sizeBytes,
    storagePath: upload.storagePath,
    playerId: req.body.playerId,
    uploadedBy: req.user.id
  });

  res.status(201).json({ success: true, data: image });
});

exports.listMyUploads = asyncHandler(async (req, res) => {
  const uploads = await ImageUpload.find({ uploadedBy: req.user.id })
    .populate('playerId', 'name team')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: uploads });
});

exports.listPendingUploads = asyncHandler(async (req, res) => {
  const uploads = await ImageUpload.find({ status: req.query.status || 'pending' })
    .populate('playerId', 'name team')
    .populate('uploadedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: uploads });
});

exports.reviewUpload = asyncHandler(async (req, res) => {
  const image = await ImageUpload.findById(req.params.id);
  if (!image) {
    return res.status(404).json({ success: false, message: 'Imagem não encontrada' });
  }

  image.status = req.body.status;
  image.moderationNote = req.body.moderationNote || null;
  await image.save();

  if (image.status === 'approved') {
    await Player.findByIdAndUpdate(image.playerId, {
      image: image.url,
      photo: image.url
    });
  }

  await createUserNotification({
    userId: image.uploadedBy,
    title: `Imagem ${image.status === 'approved' ? 'aprovada' : 'rejeitada'}`,
    message: image.status === 'approved'
      ? 'A imagem submetida foi aprovada.'
      : `A imagem submetida foi rejeitada.${image.moderationNote ? ` Motivo: ${image.moderationNote}` : ''}`,
    type: image.status === 'approved' ? 'pedido_aprovado' : 'pedido_rejeitado'
  });

  res.json({ success: true, data: image });
});
