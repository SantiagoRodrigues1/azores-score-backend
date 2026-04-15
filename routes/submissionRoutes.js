const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const validate = require('../middleware/validate');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { submissionCreateSchema, submissionReviewSchema } = require('../validators/featureSchemas');

router.use(verifyToken);
router.post('/', validate(submissionCreateSchema), submissionController.createSubmission);
router.get('/mine', submissionController.listMySubmissions);
router.get('/admin/review', verifyAdmin, submissionController.listPendingSubmissions);
router.post('/admin/review/:id', verifyAdmin, validate(submissionReviewSchema), submissionController.reviewSubmission);

module.exports = router;
