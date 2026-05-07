const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const validate = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { postCreateSchema, commentSchema } = require('../validators/featureSchemas');

router.get('/posts', communityController.listPosts);
router.get('/profiles/:userId', communityController.getProfile);
router.post('/posts', verifyToken, validate(postCreateSchema), communityController.createPost);
router.post('/posts/:id/like', verifyToken, communityController.togglePostLike);
router.delete('/posts/:id', verifyToken, communityController.deletePost);
router.get('/posts/:id/comments', communityController.listPostComments);
router.post('/posts/:id/comments', verifyToken, validate(commentSchema), communityController.addPostComment);
router.post('/comments/:id/like', verifyToken, communityController.toggleCommentLike);
router.delete('/comments/:id', verifyToken, communityController.deleteComment);

module.exports = router;
