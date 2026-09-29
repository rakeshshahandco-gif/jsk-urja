import express from 'express';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import { listSalesDocumentAudits, getSalesDocumentAuditById } from '../../controllers/salesDocumentAudit.controller.js';

const router = express.Router();
router.use(protect);
router.use(authorize('admin', 'superadmin'));

router.get('/', listSalesDocumentAudits);
router.get('/:id', getSalesDocumentAuditById);

export default router;
