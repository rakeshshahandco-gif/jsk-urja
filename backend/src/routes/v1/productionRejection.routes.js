import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createProductionRejection, getProductionRejections, getProductionRejectionById } from '../../controllers/productionRejection.controller.js';
const router = express.Router();
router.use(protect);
router.route('/').post(createProductionRejection).get(getProductionRejections);
router.route('/:id').get(getProductionRejectionById);
export default router;
