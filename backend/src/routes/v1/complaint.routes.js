import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createComplaint, getComplaints, getComplaint, updateComplaint, deleteComplaint } from '../../controllers/complaint.controller.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getComplaints).post(createComplaint);
router.route('/:id').get(getComplaint).put(updateComplaint).delete(deleteComplaint);

export default router;
