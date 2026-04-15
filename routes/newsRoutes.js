const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const validate = require('../middleware/validate');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { newsCreateSchema, newsUpdateSchema, commentSchema } = require('../validators/featureSchemas');

router.get('/', newsController.listNews);
router.get('/:id', newsController.getNewsById);
router.post('/', verifyToken, verifyAdmin, validate(newsCreateSchema), newsController.createNews);
router.put('/:id', verifyToken, verifyAdmin, validate(newsUpdateSchema), newsController.updateNews);
router.delete('/:id', verifyToken, verifyAdmin, newsController.deleteNews);
router.post('/:id/like', verifyToken, newsController.toggleNewsLike);
router.get('/:id/comments', newsController.listNewsComments);
router.post('/:id/comments', verifyToken, validate(commentSchema), newsController.addNewsComment);

module.exports = router;
