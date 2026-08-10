import express from 'express';
import * as ctrl from '../../controllers/moduleLock.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';

const router = express.Router();
router.use(protect);
router.use(requirePlatformAdmin);

router.get('/', ctrl.getModuleLocks);
router.get('/catalog', ctrl.listCatalogLocks);
router.get('/:moduleKey', ctrl.getOneModuleLock);
router.put('/:moduleKey', ctrl.putModuleLock);

export default router;
