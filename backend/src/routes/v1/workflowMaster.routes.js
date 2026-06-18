import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import workflowMasterValidation from '../../validations/workflowMaster.validation.js';
import * as workflowMasterController from '../../controllers/workflowMaster.controller.js';

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/registry', workflowMasterController.getWorkflowRegistry);
router.get('/', validate(workflowMasterValidation.list), workflowMasterController.listWorkflowMasters);
router.get('/by-template/:templateId', validate(workflowMasterValidation.getByTemplate), workflowMasterController.getWorkflowMasterByTemplate);
router.get('/:id', validate(workflowMasterValidation.get), workflowMasterController.getWorkflowMaster);
router.post('/', validate(workflowMasterValidation.create), workflowMasterController.createWorkflowMaster);
router.put('/:id', validate(workflowMasterValidation.update), workflowMasterController.updateWorkflowMaster);
router.patch('/:id/stages/reorder', validate(workflowMasterValidation.reorder), workflowMasterController.reorderWorkflowStages);
router.patch('/:id/toggle-active', validate(workflowMasterValidation.toggle), workflowMasterController.toggleWorkflowMasterActive);
router.delete('/:id', validate(workflowMasterValidation.remove), workflowMasterController.deleteWorkflowMaster);

export default router;
