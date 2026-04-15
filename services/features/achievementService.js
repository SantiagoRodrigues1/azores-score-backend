const Submission = require('../../models/Submission');
const SocialPost = require('../../models/SocialPost');
const Comment = require('../../models/Comment');

async function getAchievementsForUser(userId) {
  const [approvedSubmissions, postsCount, commentsCount] = await Promise.all([
    Submission.countDocuments({ userId, status: 'approved' }),
    SocialPost.countDocuments({ author: userId }),
    Comment.countDocuments({ author: userId })
  ]);

  const achievements = [];

  if (approvedSubmissions >= 3) {
    achievements.push({
      key: 'top_contributor',
      title: 'Top contributor',
      description: 'Aprovou 3 ou mais contribuições.'
    });
  }

  if (postsCount + commentsCount >= 10) {
    achievements.push({
      key: 'active_user',
      title: 'Active user',
      description: 'Participou ativamente na comunidade.'
    });
  }

  return achievements;
}

module.exports = { getAchievementsForUser };
