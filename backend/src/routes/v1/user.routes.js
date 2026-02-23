import express from 'express';
import {
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    getUserById,
    getAssignableUsers
} from '../../controllers/user.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import userValidation from '../../validations/user.validation.js';

const router = express.Router();

// Protect all routes
router.use(protect);

router.get('/assignable', getAssignableUsers);

// Only Admin can view all users and create new ones
router.route('/')
    .get(authorize('admin'), validate(userValidation.getUsers), getUsers)
    .post(authorize('admin'), validate(userValidation.createUser), createUser);

router.route('/:id')
    .get(authorize('admin'), validate(userValidation.getUser), getUserById)
    .put(authorize('admin'), validate(userValidation.updateUser), updateUser)
    .delete(authorize('admin'), validate(userValidation.deleteUser), deleteUser);

export default router;
