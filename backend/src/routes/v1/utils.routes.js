import express from 'express';
import { geocodeAddress, getLiveExchangeRates } from '../../controllers/utils.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/geocode', geocodeAddress);
router.get('/exchange-rates', getLiveExchangeRates);

export default router;
