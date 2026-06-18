import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import validation from '../../validations/textileProductionOrder.validation.js';
import * as ctrl from '../../controllers/textileProductionOrder.controller.js';

const router = express.Router();
router.use(protect);

router.get('/meta', ctrl.getMeta);
router.get('/eligibility', ctrl.getEligibility);
router.get('/dashboard', validate(validation.dashboard), ctrl.dashboard);

router.route('/')
    .get(validate(validation.list), ctrl.listOrders)
    .post(validate(validation.create), ctrl.createOrder);

router.post('/:id/start', ctrl.startOrder);
router.post('/:id/skip-stage', validate(validation.skipStage), ctrl.skipStage);
router.post('/:id/complete-stage', validate(validation.completeStage), ctrl.completeStage);
router.post('/:id/issue-stage', validate(validation.issueStage), ctrl.issueStage);
router.post('/:id/receive-stage', validate(validation.receiveStage), ctrl.receiveStage);

router.get('/:id', ctrl.getOrder);

export default router;
