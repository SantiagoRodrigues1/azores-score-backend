const News = require('../models/News');
const asyncHandler = require('../utils/asyncHandler');
const { toggleLike, addComment, getComments } = require('../services/features/socialService');
const { trackView } = require('../services/features/discoveryService');

exports.listNews = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 10), 20);
  const skip = (page - 1) * limit;
  const category = req.query.category;

  const filter = category ? { category } : {};
  const [items, total] = await Promise.all([
    News.find(filter).populate('author', 'name role').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    News.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

exports.getNewsById = asyncHandler(async (req, res) => {
  const item = await News.findById(req.params.id).populate('author', 'name role').lean();
  if (!item) {
    return res.status(404).json({ success: false, message: 'Notícia não encontrada' });
  }

  await Promise.all([
    News.findByIdAndUpdate(req.params.id, { $inc: { viewsCount: 1 } }),
    trackView({ entityType: 'news', entityId: req.params.id, userId: req.user?.id })
  ]);

  res.json({ success: true, data: item });
});

exports.createNews = asyncHandler(async (req, res) => {
  const news = await News.create({ ...req.body, author: req.user.id });
  const populated = await News.findById(news._id).populate('author', 'name role');
  res.status(201).json({ success: true, data: populated });
});

exports.updateNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    return res.status(404).json({ success: false, message: 'Notícia não encontrada' });
  }

  const isOwner = news.author && news.author.toString() === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Sem permissão para editar esta notícia' });
  }

  const updated = await News.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('author', 'name role');
  res.json({ success: true, data: updated });
});

exports.deleteNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    return res.status(404).json({ success: false, message: 'Notícia não encontrada' });
  }

  const isOwner = news.author && news.author.toString() === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Sem permissão para remover esta notícia' });
  }

  await news.deleteOne();
  res.json({ success: true, message: 'Notícia removida' });
});

exports.toggleNewsLike = asyncHandler(async (req, res) => {
  const result = await toggleLike({ userId: req.user.id, entityType: 'news', entityId: req.params.id });
  res.json({ success: true, data: result });
});

exports.listNewsComments = asyncHandler(async (req, res) => {
  const comments = await getComments('news', req.params.id);
  res.json({ success: true, data: comments });
});

exports.addNewsComment = asyncHandler(async (req, res) => {
  const comment = await addComment({
    entityType: 'news',
    entityId: req.params.id,
    author: req.user.id,
    content: req.body.content,
    parentCommentId: req.body.parentCommentId || null
  });
  res.status(201).json({ success: true, data: comment });
});
