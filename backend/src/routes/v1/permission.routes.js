import express from 'express';
import { getPermissionMetadata } from '../../controllers/permission.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Publicly available as it only contains module/permission labels
router.get('/metadata', getPermissionMetadata);

// Also support the flat / permissions if needed
router.get('/', getPermissionMetadata);

export default router;
