const mongoose = require('mongoose');
const ViewEvent = require('../../models/ViewEvent');
const Player = require('../../models/Player');
const Club = require('../../models/Club');
const News = require('../../models/News');
const Comment = require('../../models/Comment');
const FavoriteTeam = require('../../models/FavoriteTeam');
const Like = require('../../models/Like');
const SocialPost = require('../../models/SocialPost');

async function trackView({ entityType, entityId, userId }) {
  await ViewEvent.create({
    entityType,
    entityId,
    userId: userId || null
  });

  const modelMap = {
    player: Player,
    team: Club,
    news: News
  };

  const model = modelMap[entityType];
  if (model && model.schema.path('viewsCount')) {
    await model.findByIdAndUpdate(entityId, { $inc: { viewsCount: 1 } });
  }
}

async function getTrending(limit = 5) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const viewBuckets = await ViewEvent.aggregate([
    { $match: { viewedAt: { $gte: since } } },
    {
      $group: {
        _id: { entityType: '$entityType', entityId: '$entityId' },
        views: { $sum: 1 }
      }
    },
    { $sort: { views: -1 } },
    { $limit: 30 }
  ]);

  const [newsLikes, newsComments, teamFollowers] = await Promise.all([
    Like.aggregate([
      { $match: { entityType: 'news' } },
      { $group: { _id: '$entityId', count: { $sum: 1 } } }
    ]),
    Comment.aggregate([
      { $match: { entityType: 'news' } },
      { $group: { _id: '$entityId', count: { $sum: 1 } } }
    ]),
    FavoriteTeam.aggregate([
      { $group: { _id: '$teamId', count: { $sum: 1 } } }
    ])
  ]);

  const newsLikesMap = new Map(newsLikes.map((item) => [String(item._id), item.count]));
  const newsCommentsMap = new Map(newsComments.map((item) => [String(item._id), item.count]));
  const teamFollowersMap = new Map(teamFollowers.map((item) => [String(item._id), item.count]));

  const grouped = { player: [], team: [], news: [] };
  viewBuckets.forEach((item) => grouped[item._id.entityType].push(item));

  const [players, teams, news] = await Promise.all([
    hydrateTrending(grouped.player.slice(0, limit), Player, (doc, item) => ({
      score: item.views * 3 + (doc.viewsCount || 0) * 0.2
    })),
    hydrateTrending(grouped.team.slice(0, limit), Club, (doc, item) => ({
      score: item.views * 3 + (doc.viewsCount || 0) * 0.2 + (teamFollowersMap.get(String(doc._id)) || 0) * 4,
      followers: teamFollowersMap.get(String(doc._id)) || 0
    })),
    hydrateTrending(grouped.news.slice(0, limit), News, (doc, item) => ({
      score: item.views * 3 + (newsLikesMap.get(String(doc._id)) || 0) * 2 + (newsCommentsMap.get(String(doc._id)) || 0) * 3,
      likes: newsLikesMap.get(String(doc._id)) || 0,
      comments: newsCommentsMap.get(String(doc._id)) || 0
    }))
  ]);

  return { players, teams, news };
}

async function hydrateTrending(items, Model, getMeta = () => ({})) {
  if (!items.length) {
    return [];
  }

  const ids = items.map((item) => item._id.entityId);
  const docs = await Model.find({ _id: { $in: ids } }).lean();
  const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));

  return items
    .map((item) => ({
      views: item.views,
      entity: docMap.get(String(item._id.entityId)),
      ...getMeta(docMap.get(String(item._id.entityId)), item)
    }))
    .filter((item) => item.entity)
    .sort((left, right) => (right.score || right.views) - (left.score || left.views))
    .slice(0, items.length);
}

async function smartSearch(query, limit = 6) {
  const safeRegex = new RegExp(query, 'i');
  const [players, teams, news] = await Promise.all([
    Player.find({ $or: [{ name: safeRegex }, { nome: safeRegex }, { nickname: safeRegex }] }).limit(limit).lean(),
    Club.find({ name: safeRegex }).limit(limit).lean(),
    News.find({ $or: [{ title: safeRegex }, { category: safeRegex }] }).sort({ createdAt: -1 }).limit(limit).lean()
  ]);

  return { players, teams, news };
}

async function getRecentActivity(limit = 8) {
  const [posts, news, submissions] = await Promise.all([
    SocialPost.find({}).populate('author', 'name username avatar').sort({ createdAt: -1 }).limit(limit).lean(),
    News.find({}).populate('author', 'name username avatar').sort({ createdAt: -1 }).limit(limit).lean(),
    require('../../models/Submission').find({ status: 'approved' }).sort({ updatedAt: -1 }).limit(limit).lean()
  ]);

  return [
    ...posts.map((post) => ({
      id: String(post._id),
      type: 'post',
      title: post.author?.name || post.author?.username || 'Comunidade',
      description: post.text,
      createdAt: post.createdAt,
      url: '/community'
    })),
    ...news.map((item) => ({
      id: String(item._id),
      type: 'news',
      title: item.title,
      description: item.category,
      createdAt: item.createdAt,
      url: `/news/${item._id}`
    })),
    ...submissions.map((item) => ({
      id: String(item._id),
      type: 'submission',
      title: `Submissão aprovada: ${item.type}`,
      description: item.reviewNote || 'Nova contribuição validada pela administração.',
      createdAt: item.updatedAt,
      url: '/contributions'
    }))
  ]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, limit);
}

module.exports = {
  trackView,
  getTrending,
  smartSearch,
  getRecentActivity
};
