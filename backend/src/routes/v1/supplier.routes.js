import express from 'express';
import * as supplierController from '../../controllers/supplier.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(supplierController.getSuppliers).post(supplierController.createSupplier);
router.route('/:id')
    .get(supplierController.getSupplierById)
    .put(supplierController.updateSupplier)
    .delete(supplierController.deleteSupplier);

export default router;
