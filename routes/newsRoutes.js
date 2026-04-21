const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const validate = require('../middleware/validate');
const { verifyToken, verifyAdmin, verifyRole } = require('../middleware/auth');
const { newsCreateSchema, newsUpdateSchema, commentSchema } = require('../validators/featureSchemas');

// Middleware: allow journalists and admins to manage news
const canManageNews = verifyRole(['journalist', 'admin']);

router.get('/', newsController.listNews);
router.get('/:id', newsController.getNewsById);
router.post('/', verifyToken, canManageNews, validate(newsCreateSchema), newsController.createNews);
router.put('/:id', verifyToken, canManageNews, validate(newsUpdateSchema), newsController.updateNews);
router.delete('/:id', verifyToken, canManageNews, newsController.deleteNews);
router.post('/:id/like', verifyToken, newsController.toggleNewsLike);
router.get('/:id/comments', newsController.listNewsComments);
router.post('/:id/comments', verifyToken, validate(commentSchema), newsController.addNewsComment);

module.exports = router;
