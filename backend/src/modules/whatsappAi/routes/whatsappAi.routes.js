import express from 'express';
import { protect, checkPermission } from '../../../middlewares/auth.middleware.js';
import { requireCompanyFeature } from '../../../middlewares/featureAccess.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { WHATSAPP_AI_FEATURE_PATH, WHATSAPP_AI_PERMISSIONS } from '../constants/whatsappAi.constants.js';
import { requireAnyPermission } from '../middleware/requireAnyPermission.js';
import validation from '../validations/whatsappAi.validation.js';
import * as ctrl from '../controllers/whatsappAi.controller.js';

const router = express.Router();

// Auth first. Company scope is applied by /api/v1 parent (resolveCompanyScope).
router.use(protect);

// Health is reachable when authenticated+permitted even if feature is off (reports flag state).
router.get('/health', checkPermission(WHATSAPP_AI_PERMISSIONS.VIEW), ctrl.health);

// All other endpoints require company feature flag communication.whatsappAiEnabled.
router.use(requireCompanyFeature(WHATSAPP_AI_FEATURE_PATH));

router.get('/settings', checkPermission(WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE), ctrl.getSettings);
router.put(
    '/settings',
    checkPermission(WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE),
    validate(validation.updateSettings),
    ctrl.updateSettings,
);

router.get(
    '/conversations',
    requireAnyPermission([
        WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ALL,
        WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ASSIGNED,
    ]),
    validate(validation.listConversations),
    ctrl.listConversations,
);
router.get(
    '/conversations/:id',
    requireAnyPermission([
        WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ALL,
        WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ASSIGNED,
    ]),
    validate(validation.idParam),
    ctrl.getConversation,
);

router.get(
    '/lead-drafts',
    requireAnyPermission([
        WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_CREATE,
        WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_APPROVE,
        WHATSAPP_AI_PERMISSIONS.VIEW,
    ]),
    validate(validation.listLeadDrafts),
    ctrl.listLeadDrafts,
);
router.get(
    '/lead-drafts/:id',
    requireAnyPermission([
        WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_CREATE,
        WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_APPROVE,
        WHATSAPP_AI_PERMISSIONS.VIEW,
    ]),
    validate(validation.idParam),
    ctrl.getLeadDraft,
);

// List/read: manage OR approve. Mutating create/edit/submit/activate: manage. Approve/reject: approve.
router.get(
    '/knowledge',
    requireAnyPermission([
        WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE,
        WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE,
    ]),
    validate(validation.listKnowledge),
    ctrl.listKnowledge,
);
router.post('/knowledge', checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE), validate(validation.createKnowledge), ctrl.createKnowledge);
router.put('/knowledge/:id', checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE), validate(validation.updateKnowledge), ctrl.updateKnowledge);
router.post('/knowledge/:id/submit', checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE), validate(validation.idParam), ctrl.submitKnowledge);
router.post('/knowledge/:id/approve', checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE), validate(validation.idParam), ctrl.approveKnowledge);
router.post('/knowledge/:id/reject', checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE), validate(validation.rejectKnowledge), ctrl.rejectKnowledge);
// Activation stays on manage (existing Phase 1A registration design).
router.post('/knowledge/:id/activate', checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE), validate(validation.idParam), ctrl.activateKnowledge);
router.post('/knowledge/:id/deactivate', checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE), validate(validation.idParam), ctrl.deactivateKnowledge);


// Phase 1B-1: authenticated internal/test inbound only (not a public webhook).
router.post(
    '/internal/test-inbound',
    checkPermission(WHATSAPP_AI_PERMISSIONS.TESTING_INBOUND),
    validate(validation.testInbound),
    ctrl.testInbound,
);


// Phase 1B-2: deterministic dry-run draft generation (not a public webhook / not live AI).
router.post(
    '/internal/test-generate-draft',
    checkPermission(WHATSAPP_AI_PERMISSIONS.TESTING_GENERATE_DRAFT),
    validate(validation.testGenerateDraft),
    ctrl.testGenerateDraft,
);
router.get(
    '/internal/test-drafts/:id',
    checkPermission(WHATSAPP_AI_PERMISSIONS.TESTING_GENERATE_DRAFT),
    validate(validation.testDraftIdParam),
    ctrl.getTestDraft,
);

router.get('/documents', checkPermission(WHATSAPP_AI_PERMISSIONS.DOCUMENTS_MANAGE), validate(validation.listDocuments), ctrl.listDocuments);
router.post('/documents', checkPermission(WHATSAPP_AI_PERMISSIONS.DOCUMENTS_MANAGE), validate(validation.createDocument), ctrl.createDocument);
router.put('/documents/:id', checkPermission(WHATSAPP_AI_PERMISSIONS.DOCUMENTS_MANAGE), validate(validation.updateDocument), ctrl.updateDocument);

router.get('/audit-logs', checkPermission(WHATSAPP_AI_PERMISSIONS.AUDIT_VIEW), validate(validation.listAuditLogs), ctrl.listAuditLogs);
router.get('/permissions-check', checkPermission(WHATSAPP_AI_PERMISSIONS.VIEW), ctrl.permissionsCheck);
router.get('/dashboard-summary', checkPermission(WHATSAPP_AI_PERMISSIONS.DASHBOARD_VIEW), ctrl.dashboardSummary);

export default router;