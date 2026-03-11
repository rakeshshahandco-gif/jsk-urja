import express from 'express';
import * as controller from '../../controllers/cashBankAccount.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(controller.createAccount)
    .get(controller.getAccounts);

router.route('/:id')
    .put(controller.updateAccount)
    .delete(controller.deleteAccount);

export default router;
