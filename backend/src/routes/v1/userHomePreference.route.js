import express from 'express';
import { getPreferences, updatePreferences, resetPreferences } from '../../controllers/userHomePreference.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getPreferences)
    .post(updatePreferences)
    .put(updatePreferences)
    .delete(resetPreferences);

export default router;
