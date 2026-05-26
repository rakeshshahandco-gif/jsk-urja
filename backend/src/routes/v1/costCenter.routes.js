import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/costCenter.controller.js';

const router = express.Router();
router.use(protect);

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.get('/pl-report', ctrl.getPL);
router.get('/:id', ctrl.getById);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
