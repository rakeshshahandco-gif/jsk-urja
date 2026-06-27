import express from 'express';
import { getPublicBranding } from '../../controllers/publicBranding.controller.js';

const router = express.Router();

router.get('/branding', getPublicBranding);
router.get('/branding/:slug', getPublicBranding);

export default router;
