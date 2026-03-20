import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createComponentReplacement, getComponentReplacements, getComponentReplacementById } from '../../controllers/componentReplacement.controller.js';
const router = express.Router();
router.use(protect);
router.route('/').post(createComponentReplacement).get(getComponentReplacements);
router.route('/:id').get(getComponentReplacementById);
export default router;
