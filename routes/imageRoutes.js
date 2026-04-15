const express = require('express');
const router = express.Router();
const imageController = require('../controllers/imageController');
const validate = require('../middleware/validate');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { imageUploadSchema, imageReviewSchema } = require('../validators/featureSchemas');

router.use(verifyToken);
router.post('/', validate(imageUploadSchema), imageController.uploadPlayerImage);
router.get('/mine', imageController.listMyUploads);
router.get('/admin/review', verifyAdmin, imageController.listPendingUploads);
router.post('/admin/review/:id', verifyAdmin, validate(imageReviewSchema), imageController.reviewUpload);

module.exports = router;
