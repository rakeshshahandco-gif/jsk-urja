import express from 'express';
import { geocodeAddress } from '../../controllers/utils.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/geocode', geocodeAddress);

export default router;
