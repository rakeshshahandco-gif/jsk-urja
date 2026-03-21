import express from 'express';
import { getPermissionMetadata } from '../../controllers/permission.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/metadata', getPermissionMetadata);

// Also support the flat / permissions if needed
router.get('/', getPermissionMetadata);

export default router;
