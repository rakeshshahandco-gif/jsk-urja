import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import leadValidation from '../../validations/lead.validation.js';
import * as leadController from '../../controllers/lead.controller.js';

const router = express.Router();

router.use(protect);
// All Lead endpoints are gated by the WhatsApp-to-Lead feature flag so the
// module is invisible to companies that have not enabled it.
router.use(requireCompanyFeature('crm.whatsappToLeadEnabled'));

router
    .route('/')
    .get(validate(leadValidation.list), leadController.getLeads)
    .post(validate(leadValidation.create), leadController.createLead);

router.post(
    '/from-whatsapp',
    validate(leadValidation.fromWhatsApp),
    leadController.createLeadFromWhatsApp,
);

router
    .route('/:id')
    .get(validate(leadValidation.getOne), leadController.getLead)
    .patch(validate(leadValidation.update), leadController.updateLead)
    .delete(validate(leadValidation.remove), leadController.deleteLead);

router.post(
    '/:id/share-asset',
    validate(leadValidation.shareAsset),
    leadController.shareAsset,
);

router.get(
    '/:id/activities',
    validate(leadValidation.activities),
    leadController.getActivities,
);

export default router;
