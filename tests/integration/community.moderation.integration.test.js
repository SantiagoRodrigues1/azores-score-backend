const request = require('supertest');
const AuditLog = require('../../models/AuditLog');
const Comment = require('../../models/Comment');
const Like = require('../../models/Like');
const Report = require('../../models/Report');
const SocialPost = require('../../models/SocialPost');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createAuthHeader, createUser } = require('./helpers/factories');

describe('community moderation integration', () => {
  let app;

  beforeAll(async () => {
    ({ app } = await createTestContext());
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await destroyTestContext();
  });

  it('allows owners to delete their own posts and removes related comments, likes, and reports', async () => {
    const owner = await createUser({ email: 'community-owner@example.com', role: 'fan' });
    const reporter = await createUser({ email: 'community-reporter@example.com', role: 'fan' });
    const post = await SocialPost.create({ author: owner._id, text: 'Post para remoção', commentsCount: 2, reportsCount: 1 });
    const rootComment = await Comment.create({ entityType: 'post', entityId: post._id, author: reporter._id, content: 'Comentário raiz' });
    const replyComment = await Comment.create({ entityType: 'post', entityId: post._id, author: owner._id, content: 'Resposta', parentCommentId: rootComment._id });

    await Like.create({ userId: reporter._id, entityType: 'post', entityId: post._id });
    await Like.create({ userId: owner._id, entityType: 'comment', entityId: rootComment._id });
    await Report.create({ entityType: 'post', entityId: post._id, reportedBy: reporter._id, reason: 'Spam' });
    await Report.create({ entityType: 'comment', entityId: rootComment._id, reportedBy: owner._id, reason: 'Abuso' });

    const response = await request(app)
      .delete(`/api/community/posts/${post._id}`)
      .set('Authorization', createAuthHeader(owner));

    expect(response.status).toBe(200);
    expect(await SocialPost.findById(post._id).lean()).toBeNull();
    expect(await Comment.countDocuments({ entityId: post._id })).toBe(0);
    expect(await Like.countDocuments()).toBe(0);
    expect(await Report.countDocuments()).toBe(0);
    expect(replyComment._id).toBeDefined();
  });

  it('allows admins to delete community comments and records moderation audit logs', async () => {
    const owner = await createUser({ email: 'community-post-author@example.com', role: 'fan' });
    const admin = await createUser({ email: 'community-admin@example.com', role: 'admin' });
    const post = await SocialPost.create({ author: owner._id, text: 'Post com comentário', commentsCount: 2 });
    const rootComment = await Comment.create({ entityType: 'post', entityId: post._id, author: owner._id, content: 'Comentário moderado', repliesCount: 1 });
    await Comment.create({ entityType: 'post', entityId: post._id, author: admin._id, content: 'Resposta moderada', parentCommentId: rootComment._id });

    const response = await request(app)
      .delete(`/api/community/comments/${rootComment._id}`)
      .set('Authorization', createAuthHeader(admin));

    expect(response.status).toBe(200);
    expect(await Comment.countDocuments({ entityId: post._id })).toBe(0);

    const refreshedPost = await SocialPost.findById(post._id).lean();
    expect(refreshedPost.commentsCount).toBe(0);

    const auditEntry = await AuditLog.findOne({ entity: 'CommunityComment', action: 'DELETE', entityId: String(rootComment._id) }).lean();
    expect(auditEntry).toBeTruthy();
    expect(auditEntry.userId.toString()).toBe(admin._id.toString());
    expect(auditEntry.description).toMatch(/comentário da comunidade removido/i);
  });
});