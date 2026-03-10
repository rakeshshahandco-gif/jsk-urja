import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createReplacementDispatch, getReplacementDispatches, getReplacementDispatch, deleteReplacementDispatch } from '../../controllers/replacementDispatch.controller.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getReplacementDispatches).post(createReplacementDispatch);
router.route('/:id').get(getReplacementDispatch).delete(deleteReplacementDispatch);

export default router;
