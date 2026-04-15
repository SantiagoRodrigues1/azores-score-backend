const express = require('express');
const router = express.Router();
const editRequestController = require('../controllers/editRequestController');
const validate = require('../middleware/validate');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { editRequestCreateSchema, editRequestReviewSchema } = require('../validators/featureSchemas');

router.use(verifyToken);

router.post('/', validate(editRequestCreateSchema), editRequestController.createEditRequest);
router.get('/mine', editRequestController.listMyEditRequests);
router.get('/', verifyAdmin, editRequestController.listEditRequests);
router.put('/:id/approve', verifyAdmin, validate(editRequestReviewSchema), editRequestController.approveEditRequest);
router.put('/:id/reject', verifyAdmin, validate(editRequestReviewSchema), editRequestController.rejectEditRequest);

module.exports = router;