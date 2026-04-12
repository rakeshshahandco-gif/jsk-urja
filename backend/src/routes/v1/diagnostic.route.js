import express from 'express';
import { getSystemDiscovery, getHealth } from '../../controllers/diagnostic.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Admin-only diagnostics
router.use(protect);
router.use(authorize('admin', 'superadmin'));

/**
 * @route GET /api/v1/diagnostic/discovery
 * @desc Auto-discover all system components (models, routes)
 * @access Admin
 */
router.get('/discovery', getSystemDiscovery);

/**
 * @route GET /api/v1/diagnostic/health
 * @desc System health and statistics
 * @access Admin
 */
router.get('/health', getHealth);

export default router;
