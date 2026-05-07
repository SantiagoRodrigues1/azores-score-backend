const SocialPost = require('../models/SocialPost');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const Report = require('../models/Report');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { toggleLike, addComment, getComments } = require('../services/features/socialService');
const { getAchievementsForUser } = require('../services/features/achievementService');
const { uploadBase64Image } = require('../services/features/cloudinaryService');
const { writeAuditLog } = require('../services/auditLogService');

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureOwnerOrAdmin(reqUser, ownerId) {
  if (reqUser?.role === 'admin') {
    return;
  }

  if (String(reqUser?.id || '') !== String(ownerId || '')) {
    throw createHttpError('Acesso negado.', 403);
  }
}

function buildPostSnapshot(post) {
  if (!post) {
    return null;
  }

  return {
    id: String(post._id),
    text: post.text,
    image: post.image || null,
    author: String(post.author),
    likesCount: post.likesCount || 0,
    commentsCount: post.commentsCount || 0,
    reportsCount: post.reportsCount || 0,
    createdAt: post.createdAt || null
  };
}

function buildCommentSnapshot(comment) {
  if (!comment) {
    return null;
  }

  return {
    id: String(comment._id),
    entityType: comment.entityType,
    entityId: String(comment.entityId),
    author: String(comment.author),
    content: comment.content,
    parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
    likesCount: comment.likesCount || 0,
    repliesCount: comment.repliesCount || 0,
    createdAt: comment.createdAt || null
  };
}

async function collectCommentTreeIds(rootCommentId) {
  const collectedIds = [String(rootCommentId)];
  let frontier = [rootCommentId];

  while (frontier.length) {
    const children = await Comment.find({ parentCommentId: { $in: frontier } }).select('_id').lean();
    frontier = children.map((comment) => comment._id);
    collectedIds.push(...frontier.map((commentId) => String(commentId)));
  }

  return collectedIds;
}

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

exports.deletePost = asyncHandler(async (req, res) => {
  const post = await SocialPost.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, message: 'Publicação não encontrada' });
  }

  ensureOwnerOrAdmin(req.user, post.author);

  const comments = await Comment.find({ entityType: 'post', entityId: post._id }).select('_id').lean();
  const commentIds = comments.map((comment) => String(comment._id));

  await Promise.all([
    Comment.deleteMany({ entityType: 'post', entityId: post._id }),
    Like.deleteMany({
      $or: [
        { entityType: 'post', entityId: post._id },
        ...(commentIds.length ? [{ entityType: 'comment', entityId: { $in: commentIds } }] : [])
      ]
    }),
    Report.deleteMany({
      $or: [
        { entityType: 'post', entityId: post._id },
        ...(commentIds.length ? [{ entityType: 'comment', entityId: { $in: commentIds } }] : [])
      ]
    }),
    SocialPost.deleteOne({ _id: post._id })
  ]);

  if (req.user.role === 'admin') {
    await writeAuditLog({
      action: 'DELETE',
      entity: 'CommunityPost',
      entityId: post._id,
      entityName: post.text.slice(0, 80),
      user: req.user,
      before: buildPostSnapshot(post),
      requestMeta: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      },
      description: 'Publicação da comunidade removida pela administração.'
    });
  }

  res.json({ success: true, data: { id: String(post._id) } });
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    return res.status(404).json({ success: false, message: 'Comentário não encontrado' });
  }

  if (comment.entityType !== 'post') {
    throw createHttpError('Este endpoint só suporta comentários da comunidade.', 400);
  }

  ensureOwnerOrAdmin(req.user, comment.author);

  const commentTreeIds = await collectCommentTreeIds(comment._id);

  if (comment.parentCommentId) {
    await Comment.findByIdAndUpdate(comment.parentCommentId, { $inc: { repliesCount: -1 } });
  }

  await Promise.all([
    Comment.deleteMany({ _id: { $in: commentTreeIds } }),
    Like.deleteMany({ entityType: 'comment', entityId: { $in: commentTreeIds } }),
    Report.deleteMany({ entityType: 'comment', entityId: { $in: commentTreeIds } }),
    SocialPost.findByIdAndUpdate(comment.entityId, { $inc: { commentsCount: -commentTreeIds.length } })
  ]);

  if (req.user.role === 'admin') {
    await writeAuditLog({
      action: 'DELETE',
      entity: 'CommunityComment',
      entityId: comment._id,
      entityName: comment.content.slice(0, 80),
      user: req.user,
      before: buildCommentSnapshot(comment),
      requestMeta: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      },
      description: 'Comentário da comunidade removido pela administração.'
    });
  }

  res.json({ success: true, data: { id: String(comment._id), removedComments: commentTreeIds.length } });
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
