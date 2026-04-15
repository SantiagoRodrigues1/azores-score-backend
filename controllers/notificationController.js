const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

exports.listNotifications = asyncHandler(async (req, res) => {
  const status = String(req.query.status || 'all');
  const query = { userId: req.user.id };

  if (status === 'unread') {
    query.lida = false;
  }

  if (status === 'read') {
    query.lida = true;
  }

  const notifications = await Notification.find(query)
    .sort({ criadoEm: -1 })
    .limit(Number(req.query.limit || 50))
    .lean();

  const unreadCount = await Notification.countDocuments({ userId: req.user.id, lida: false });

  res.json({
    success: true,
    data: notifications,
    meta: {
      unreadCount,
      status
    }
  });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { lida: true, dataLeitura: new Date() },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notificação não encontrada' });
  }

  res.json({ success: true, data: notification });
});

exports.markAsUnread = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { lida: false, dataLeitura: null },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notificação não encontrada' });
  }

  res.json({ success: true, data: notification });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user.id, lida: false },
    { lida: true, dataLeitura: new Date() }
  );
  res.json({ success: true, message: 'Notificações atualizadas' });
});
