import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import textileJobWorkRateValidation from '../../validations/textileJobWorkRate.validation.js';
import * as ctrl from '../../controllers/textileJobWorkRate.controller.js';

const router = express.Router();

router.use(protect);

router.get('/meta', ctrl.getMeta);

router.get(
    '/eligibility',
    validate(textileJobWorkRateValidation.eligibility),
    ctrl.getEligibility,
);

router.get(
    '/reports/vendor-rates',
    validate(textileJobWorkRateValidation.reports),
    ctrl.vendorRateReport,
);

router.get(
    '/reports/worker-rates',
    validate(textileJobWorkRateValidation.reports),
    ctrl.workerRateReport,
);

router.get(
    '/reports/process-cost-summary',
    validate(textileJobWorkRateValidation.reports),
    ctrl.processCostSummary,
);

router.get(
    '/lookup',
    validate(textileJobWorkRateValidation.lookup),
    ctrl.lookupRate,
);

router
    .route('/')
    .get(validate(textileJobWorkRateValidation.list), ctrl.listRates)
    .post(validate(textileJobWorkRateValidation.create), ctrl.createRate);

router
    .route('/:id')
    .patch(validate(textileJobWorkRateValidation.update), ctrl.updateRate)
    .delete(validate(textileJobWorkRateValidation.remove), ctrl.removeRate);

export default router;
