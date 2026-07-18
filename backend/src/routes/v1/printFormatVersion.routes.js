import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import printFormatVersionValidation from '../../validations/printFormatVersion.validation.js';
import * as printFormatVersionController from '../../controllers/printFormatVersion.controller.js';

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/registry', printFormatVersionController.getRegistry);
router.get('/', validate(printFormatVersionValidation.list), printFormatVersionController.listPrintFormatVersions);
router.post('/', validate(printFormatVersionValidation.create), printFormatVersionController.createDraft);
router.get('/:id', validate(printFormatVersionValidation.get), printFormatVersionController.getPrintFormatVersion);
router.get('/:id/preview', validate(printFormatVersionValidation.preview), printFormatVersionController.previewVersion);
router.post('/:id/copy', validate(printFormatVersionValidation.copy), printFormatVersionController.copyVersion);
router.put('/:id', validate(printFormatVersionValidation.update), printFormatVersionController.updateVersion);
router.patch('/:id/approve', validate(printFormatVersionValidation.approve), printFormatVersionController.approveVersion);
router.patch('/:id/set-default', validate(printFormatVersionValidation.setDefault), printFormatVersionController.setDefaultVersion);
router.patch('/:id/lock', validate(printFormatVersionValidation.lock), printFormatVersionController.lockVersion);
router.patch('/:id/archive', validate(printFormatVersionValidation.archive), printFormatVersionController.archiveVersion);

export default router;
