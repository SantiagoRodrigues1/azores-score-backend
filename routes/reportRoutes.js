const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const validate = require('../middleware/validate');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { reportSchema, reportReviewSchema } = require('../validators/featureSchemas');

router.use(verifyToken);
router.post('/', validate(reportSchema), reportController.createReport);
router.get('/admin', verifyAdmin, reportController.listReports);
router.post('/admin/:id', verifyAdmin, validate(reportReviewSchema), reportController.reviewReport);

module.exports = router;
