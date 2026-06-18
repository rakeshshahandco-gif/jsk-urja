import express from 'express';
import * as userController from '../../controllers/user.controller.js';
import { getPermissionMetadata, syncPermissions } from '../../controllers/permission.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';

const router = express.Router();

router.use(protect);

// 1. SPECIFIC ROUTES (Must be BEFORE :id)
router.get('/permissions/metadata', getPermissionMetadata);
router.post('/permissions/sync', protect, requirePlatformAdmin, syncPermissions);
router.get('/roles', userController.getRoles);
router.get('/departments', userController.getDepartments);

// 2. RESOURCE ROUTES
router.route('/roles')
    .post(requirePlatformAdmin, userController.createRole);

router.route('/roles/:id')
    .patch(requirePlatformAdmin, userController.updateRole);

router.route('/departments')
    .post(authorize('superadmin', 'admin'), userController.createDepartment);

// 3. USER MANAGEMENT
// Allow all authenticated users to view users
router.route('/')
    .get(userController.getUsers);

// Admin only routes
router.use(authorize('superadmin', 'admin'));

router.route('/')
    .post(userController.createUser);

router.route('/:id')
    .get(userController.getUser)
    .patch(userController.updateUser)
    .delete(userController.deleteUser);

export default router;
