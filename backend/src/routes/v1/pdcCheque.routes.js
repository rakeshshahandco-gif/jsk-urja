import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/pdcCheque.controller.js';

const router = express.Router();
router.use(protect);

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.get('/due-soon', ctrl.getDueSoon);
router.get('/:id', ctrl.getById);
router.patch('/:id', ctrl.update);
router.post('/:id/present', ctrl.present);
router.post('/:id/clear', ctrl.clear);
router.post('/:id/bounce', ctrl.bounce);
router.post('/:id/cancel', ctrl.cancel);

export default router;
