import express from 'express';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import {
    getModuleRegistry,
    getCompanyModuleAllocation,
    updateCompanyModuleAllocation,
    checkModuleEnabled,
    updateIndustryTemplateModules,
} from '../../controllers/moduleAllocation.controller.js';

const router = express.Router();

router.use(protect);
router.use(authorize('superadmin', 'admin'));

router.get('/registry', getModuleRegistry);
router.get('/company/:companyId', getCompanyModuleAllocation);
router.put('/company/:companyId', updateCompanyModuleAllocation);
router.get('/company/:companyId/check/:moduleCode', checkModuleEnabled);
router.put('/industry-template/:id/modules', updateIndustryTemplateModules);

export default router;
