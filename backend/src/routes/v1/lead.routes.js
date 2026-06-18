import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import leadValidation from '../../validations/lead.validation.js';
import * as leadController from '../../controllers/lead.controller.js';

const router = express.Router();

router.use(protect);
router.use(requireCompanyFeature('crm.whatsappToLeadEnabled'));

router.get('/visibility-meta', leadController.getLeadVisibilityMeta);
router.get('/report/export/excel', validate(leadValidation.reportExport), leadController.exportLeadReportExcel);
router.get('/report', validate(leadValidation.report), leadController.getLeadReport);

router
    .route('/')
    .get(validate(leadValidation.list), leadController.getLeads)
    .post(validate(leadValidation.create), leadController.createLead);

router.post(
    '/from-whatsapp',
    validate(leadValidation.fromWhatsApp),
    leadController.createLeadFromWhatsApp,
);

router.get(
    '/:id/activities',
    validate(leadValidation.activities),
    leadController.getActivities,
);

router.get(
    '/:id/tasks',
    validate(leadValidation.getOne),
    leadController.getLeadTasks,
);

router.post(
    '/:id/create-task',
    validate(leadValidation.createTaskFromLead),
    leadController.createTaskFromLead,
);

router.post(
    '/:id/share-asset',
    validate(leadValidation.shareAsset),
    leadController.shareAsset,
);

router
    .route('/:id')
    .get(validate(leadValidation.getOne), leadController.getLead)
    .patch(validate(leadValidation.update), leadController.updateLead)
    .delete(validate(leadValidation.remove), leadController.deleteLead);

export default router;
