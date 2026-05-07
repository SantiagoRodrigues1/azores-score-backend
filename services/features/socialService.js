const Comment = require('../../models/Comment');
const Like = require('../../models/Like');
const News = require('../../models/News');
const SocialPost = require('../../models/SocialPost');
const { buildNotificationDedupeKey, createUserNotification } = require('./notificationService');

const entityModelMap = {
  news: News,
  post: SocialPost,
  comment: Comment
};

async function toggleLike({ userId, entityType, entityId }) {
  const existing = await Like.findOne({ userId, entityType, entityId });

  if (existing) {
    await Like.deleteOne({ _id: existing._id });
    await updateCounter(entityType, entityId, -1);
    return { liked: false };
  }

  await Like.create({ userId, entityType, entityId });
  await updateCounter(entityType, entityId, 1);
  await notifyEntityOwnerOnLike({ userId, entityType, entityId });
  return { liked: true };
}

async function updateCounter(entityType, entityId, change) {
  const Model = entityModelMap[entityType];
  if (!Model) {
    return;
  }

  const counterField = entityType === 'comment' ? 'likesCount' : 'likesCount';
  await Model.findByIdAndUpdate(entityId, { $inc: { [counterField]: change } });
}

async function addComment({ entityType, entityId, author, content, parentCommentId = null }) {
  const normalizedContent = String(content || '').trim();
  const duplicatedRecentComment = await Comment.findOne({
    entityType,
    entityId,
    author,
    content: normalizedContent,
    parentCommentId,
    createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
  }).lean();

  if (duplicatedRecentComment) {
    const error = new Error('Aguarda um instante antes de repetir o mesmo comentário.');
    error.statusCode = 429;
    throw error;
  }

  const comment = await Comment.create({ entityType, entityId, author, content: normalizedContent, parentCommentId });

  if (parentCommentId) {
    await Comment.findByIdAndUpdate(parentCommentId, { $inc: { repliesCount: 1 } });
  }

  const Model = entityModelMap[entityType];
  if (Model && Model.schema.path('commentsCount')) {
    await Model.findByIdAndUpdate(entityId, { $inc: { commentsCount: 1 } });
  }

  await notifyCommentTargets({ entityType, entityId, author, parentCommentId, commentId: comment._id });

  return Comment.findById(comment._id).populate('author', 'name role avatar username');
}

async function notifyEntityOwnerOnLike({ userId, entityType, entityId }) {
  const Model = entityModelMap[entityType];
  if (!Model || !Model.schema.path('author')) {
    return;
  }

  const entity = await Model.findById(entityId).select('author').lean();
  const ownerId = entity?.author?.toString?.() || String(entity?.author || '');

  if (!ownerId || ownerId === String(userId)) {
    return;
  }

  await createUserNotification({
    userId: ownerId,
    title: 'Nova reação na comunidade',
    message: entityType === 'comment' ? 'Alguém reagiu ao teu comentário.' : 'Alguém reagiu ao teu conteúdo.',
    type: 'system',
    eventKey: 'like.created',
    dedupeKey: buildNotificationDedupeKey({ userId: ownerId, eventKey: 'like.created', referenceId: entityId, fingerprint: `${entityType}:${userId}` }),
    actionUrl: entityType === 'news' ? `/news/${entityId}` : '/community',
    referenceId: entityId,
    payload: {
      entityType,
      entityId: String(entityId),
      actorUserId: String(userId)
    },
    meta: {
      icon: 'heart',
      color: 'rose',
      buttonText: 'Ver atividade'
    }
  });
}

async function notifyCommentTargets({ entityType, entityId, author, parentCommentId, commentId }) {
  if (parentCommentId) {
    const parentComment = await Comment.findById(parentCommentId).select('author').lean();
    const parentAuthorId = parentComment?.author?.toString?.() || String(parentComment?.author || '');

    if (parentAuthorId && parentAuthorId !== String(author)) {
      await createUserNotification({
        userId: parentAuthorId,
        title: 'Nova resposta ao teu comentário',
        message: 'Alguém respondeu ao teu comentário na comunidade.',
        type: 'system',
        eventKey: 'comment.created',
        dedupeKey: buildNotificationDedupeKey({ userId: parentAuthorId, eventKey: 'comment.created', referenceId: commentId, fingerprint: `${entityType}:reply:${author}` }),
        actionUrl: entityType === 'news' ? `/news/${entityId}` : '/community',
        referenceId: commentId,
        payload: {
          entityType,
          entityId: String(entityId),
          parentCommentId: String(parentCommentId),
          actorUserId: String(author)
        },
        meta: {
          icon: 'message-circle',
          color: 'blue',
          buttonText: 'Ver resposta'
        }
      });
    }

    return;
  }

  const Model = entityModelMap[entityType];
  if (!Model || !Model.schema.path('author')) {
    return;
  }

  const entity = await Model.findById(entityId).select('author').lean();
  const ownerId = entity?.author?.toString?.() || String(entity?.author || '');

  if (!ownerId || ownerId === String(author)) {
    return;
  }

  await createUserNotification({
    userId: ownerId,
    title: 'Novo comentário recebido',
    message: entityType === 'news' ? 'Recebeste um novo comentário numa notícia.' : 'Recebeste um novo comentário numa publicação.',
    type: 'system',
    eventKey: 'comment.created',
    dedupeKey: buildNotificationDedupeKey({ userId: ownerId, eventKey: 'comment.created', referenceId: commentId, fingerprint: `${entityType}:root:${author}` }),
    actionUrl: entityType === 'news' ? `/news/${entityId}` : '/community',
    referenceId: commentId,
    payload: {
      entityType,
      entityId: String(entityId),
      actorUserId: String(author)
    },
    meta: {
      icon: 'message-square',
      color: 'emerald',
      buttonText: 'Ver comentário'
    }
  });
}

async function getComments(entityType, entityId) {
  return Comment.find({ entityType, entityId })
    .populate('author', 'name role avatar username')
    .sort({ createdAt: 1 })
    .lean();
}

module.exports = {
  toggleLike,
  addComment,
  getComments
};
