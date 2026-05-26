/**
 * SAAS Admin Routes — all require superadmin role.
 * These routes are exempt from company scope middleware.
 */
import { Router } from 'express';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import {
    getSaasDashboard,
    listAllCompanies,
    getCompanyDetails,
    toggleCompanyActive,
    updateEnabledModules,
    getSubscription,
    upsertSubscription,
    impersonateCompanyAdmin,
    listActivityLogs,
} from '../../controllers/saas.controller.js';

const router = Router();

// All SAAS admin routes require authentication + superadmin role
router.use(protect, authorize('superadmin'));

// Dashboard
router.get('/dashboard', getSaasDashboard);

// Companies
router.get('/companies', listAllCompanies);
router.get('/companies/:companyId', getCompanyDetails);
router.patch('/companies/:companyId/toggle-active', toggleCompanyActive);
router.patch('/companies/:companyId/modules', updateEnabledModules);

// Subscriptions
router.get('/companies/:companyId/subscription', getSubscription);
router.put('/companies/:companyId/subscription', upsertSubscription);

// Impersonation
router.post('/companies/:companyId/impersonate', impersonateCompanyAdmin);

// Activity Logs
router.get('/activity-logs', listActivityLogs);

export default router;
