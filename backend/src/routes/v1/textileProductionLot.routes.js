import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import textileProductionLotValidation from '../../validations/textileProductionLot.validation.js';
import * as ctrl from '../../controllers/textileProductionLot.controller.js';

const router = express.Router();

router.use(protect);

router.get(
    '/eligibility/:companyId',
    checkPermission('production.textile_production.view'),
    validate(textileProductionLotValidation.eligibility),
    ctrl.getTextileEligibility,
);

router.get(
    '/',
    checkPermission('production.textile_production.view'),
    validate(textileProductionLotValidation.list),
    ctrl.listTextileProductionLots,
);

router.post(
    '/',
    checkPermission('production.textile_production.add'),
    validate(textileProductionLotValidation.create),
    ctrl.createTextileProductionLot,
);

router.get(
    '/:id/report',
    checkPermission('production.textile_production.view'),
    validate(textileProductionLotValidation.report),
    ctrl.getTextileLotReport,
);

router.get(
    '/:id',
    checkPermission('production.textile_production.view'),
    validate(textileProductionLotValidation.get),
    ctrl.getTextileProductionLot,
);

router.post(
    '/:id/dyeing-issue',
    checkPermission('production.textile_production.edit'),
    validate(textileProductionLotValidation.dyeingIssue),
    ctrl.recordDyeingIssue,
);

router.post(
    '/:id/dyeing-return',
    checkPermission('production.textile_production.edit'),
    validate(textileProductionLotValidation.dyeingReturn),
    ctrl.recordDyeingReturn,
);

router.post(
    '/:id/stages/:stageIndex/start',
    checkPermission('production.textile_production.edit'),
    validate(textileProductionLotValidation.startStage),
    ctrl.startTextileStage,
);

router.post(
    '/:id/stages/:stageIndex/complete',
    checkPermission('production.textile_production.edit'),
    validate(textileProductionLotValidation.completeStage),
    ctrl.completeTextileStage,
);

export default router;
