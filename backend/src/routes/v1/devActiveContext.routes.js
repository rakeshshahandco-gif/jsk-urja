import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { getActiveContext } from '../../controllers/devActiveContext.controller.js';

const router = express.Router();

router.get('/active-context', protect, getActiveContext);

export default router;
