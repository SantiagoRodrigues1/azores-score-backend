const SocialPost = require('../models/SocialPost');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { toggleLike, addComment, getComments } = require('../services/features/socialService');
const { getAchievementsForUser } = require('../services/features/achievementService');
const { uploadBase64Image } = require('../services/features/cloudinaryService');

exports.listPosts = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  const skip = (page - 1) * limit;

  const [posts, total] = await Promise.all([
    SocialPost.find()
      .populate('author', 'name role avatar username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SocialPost.countDocuments()
  ]);

  res.json({
    success: true,
    data: posts,
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  });
});

exports.createPost = asyncHandler(async (req, res) => {
  const normalizedText = String(req.body.text || '').trim();
  const rawImage = String(req.body.image || '').trim();
  const duplicatedRecentPost = await SocialPost.findOne({
    author: req.user.id,
    text: normalizedText,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) }
  }).lean();

  if (duplicatedRecentPost) {
    return res.status(429).json({
      success: false,
      message: 'Aguarda um instante antes de publicar conteúdo repetido.'
    });
  }

  let imageUrl = null;
  if (rawImage) {
    if (/^data:image\//iu.test(rawImage)) {
      const upload = await uploadBase64Image(rawImage, 'community-posts');
      imageUrl = upload.url;
    } else {
      imageUrl = rawImage;
    }
  }

  const post = await SocialPost.create({
    author: req.user.id,
    text: normalizedText,
    image: imageUrl
  });

  const populated = await SocialPost.findById(post._id).populate('author', 'name role avatar username');
  res.status(201).json({ success: true, data: populated });
});

exports.togglePostLike = asyncHandler(async (req, res) => {
  const result = await toggleLike({ userId: req.user.id, entityType: 'post', entityId: req.params.id });
  res.json({ success: true, data: result });
});

exports.listPostComments = asyncHandler(async (req, res) => {
  const comments = await getComments('post', req.params.id);
  res.json({ success: true, data: comments });
});

exports.addPostComment = asyncHandler(async (req, res) => {
  const comment = await addComment({
    entityType: 'post',
    entityId: req.params.id,
    author: req.user.id,
    content: req.body.content,
    parentCommentId: req.body.parentCommentId || null
  });
  res.status(201).json({ success: true, data: comment });
});

exports.toggleCommentLike = asyncHandler(async (req, res) => {
  const result = await toggleLike({ userId: req.user.id, entityType: 'comment', entityId: req.params.id });
  res.json({ success: true, data: result });
});

exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select('name email role avatar username createdAt').lean();
  if (!user) {
    return res.status(404).json({ success: false, message: 'Utilizador não encontrado' });
  }

  const [postsCount, achievements] = await Promise.all([
    SocialPost.countDocuments({ author: req.params.userId }),
    getAchievementsForUser(req.params.userId)
  ]);

  res.json({
    success: true,
    data: {
      ...user,
      postsCount,
      achievements
    }
  });
});
