import express from 'express';
import {
    getMyUiPreferences,
    updateMyUiPreferences,
    resetMyUiPreferences,
} from '../../controllers/userUiPreferences.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/me')
    .get(getMyUiPreferences)
    .patch(updateMyUiPreferences)
    .put(updateMyUiPreferences)
    .delete(resetMyUiPreferences);

export default router;
