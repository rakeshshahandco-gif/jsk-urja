import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import companyWorkflowAssignmentValidation from '../../validations/companyWorkflowAssignment.validation.js';
import * as ctrl from '../../controllers/companyWorkflowAssignment.controller.js';

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/:companyId/options', validate(companyWorkflowAssignmentValidation.listOptions), ctrl.listCompanyWorkflowOptions);
router.get('/:companyId', validate(companyWorkflowAssignmentValidation.get), ctrl.getCompanyWorkflowAssignment);
router.put('/:companyId', validate(companyWorkflowAssignmentValidation.assign), ctrl.assignCompanyWorkflow);

export default router;
