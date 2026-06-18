import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import workflowProductionLotValidation from '../../validations/workflowProductionLot.validation.js';
import { workflowProductionLotUpload } from '../../middlewares/workflowProductionLotUpload.middleware.js';
import * as ctrl from '../../controllers/workflowProductionLot.controller.js';

const router = express.Router();

router.use(protect);

router.get(
    '/preview/:companyId',
    checkPermission('production.workflow_production.view'),
    validate(workflowProductionLotValidation.preview),
    ctrl.getWorkflowPreview,
);

router.get(
    '/',
    checkPermission('production.workflow_production.view'),
    validate(workflowProductionLotValidation.list),
    ctrl.listWorkflowProductionLots,
);

router.post(
    '/',
    checkPermission('production.workflow_production.add'),
    validate(workflowProductionLotValidation.create),
    ctrl.createWorkflowProductionLot,
);

router.get(
    '/:id',
    checkPermission('production.workflow_production.view'),
    validate(workflowProductionLotValidation.get),
    ctrl.getWorkflowProductionLot,
);

router.post(
    '/:id/stages/:stageIndex/start',
    checkPermission('production.workflow_production.edit'),
    validate(workflowProductionLotValidation.startStage),
    ctrl.startWorkflowProductionStage,
);

router.post(
    '/:id/stages/:stageIndex/complete',
    checkPermission('production.workflow_production.edit'),
    validate(workflowProductionLotValidation.completeStage),
    ctrl.completeWorkflowProductionStage,
);

router.post(
    '/:id/stages/:stageIndex/skip',
    checkPermission('production.workflow_production.edit'),
    validate(workflowProductionLotValidation.skipStage),
    ctrl.skipWorkflowProductionStage,
);

router.post(
    '/:id/stages/:stageIndex/attachment',
    checkPermission('production.workflow_production.edit'),
    workflowProductionLotUpload.single('file'),
    ctrl.uploadStageAttachment,
);

export default router;
