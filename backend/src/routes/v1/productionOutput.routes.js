import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createProductionOutput, getProductionOutputs, getProductionOutputById } from '../../controllers/productionOutput.controller.js';
const router = express.Router();
router.use(protect);
router.route('/').post(createProductionOutput).get(getProductionOutputs);
router.route('/:id').get(getProductionOutputById);
export default router;
