import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/security.controller.js';

const router = express.Router();

router.use(protect);

router.get('/context', ctrl.getMySecurityContext);

router.get('/settings', ctrl.getSettings);
router.patch('/settings', ctrl.patchSettings);

router.get('/permissions/matrix', ctrl.getPermissionMatrix);

router.get('/approval-rules', ctrl.listApprovalRules);
router.post('/approval-rules', ctrl.createApprovalRule);
router.patch('/approval-rules/:id', ctrl.updateApprovalRule);
router.delete('/approval-rules/:id', ctrl.deleteApprovalRule);

router.get('/approval-queue', ctrl.getApprovalQueue);
router.post('/approval-requests', ctrl.submitApprovalRequest);
router.post('/approval-requests/:id/approve', ctrl.approveRequest);
router.post('/approval-requests/:id/reject', ctrl.rejectRequest);
router.post('/approval-evaluate', ctrl.evaluateApproval);

router.get('/locks', ctrl.getLocks);
router.put('/locks', ctrl.updateLocks);
router.post('/locks/override', ctrl.overrideLock);

router.get('/audit-logs', ctrl.getAuditLogs);

router.get('/notification-rules', ctrl.getNotificationRules);
router.patch('/notification-rules/:id', ctrl.patchNotificationRule);

router.get('/login-history', ctrl.getLoginHistory);
router.post('/users/:userId/force-logout', ctrl.forceLogoutUser);
router.post('/force-logout-all', ctrl.forceLogoutAll);

router.get('/reports', ctrl.getSecurityReports);

export default router;
