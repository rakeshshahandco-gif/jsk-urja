import express from 'express';
import {
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    getUserById
} from '../../controllers/user.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// Only Admin can view all users and create new ones
router.route('/')
    .get(authorize('admin'), getUsers)
    .post(authorize('admin'), createUser);

router.route('/:id')
    .get(authorize('admin'), getUserById)
    .put(authorize('admin'), updateUser)
    .delete(authorize('admin'), deleteUser);

export default router;
