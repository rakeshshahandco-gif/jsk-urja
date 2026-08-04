import express from 'express';
import * as supplierController from '../../controllers/supplier.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
router.use(protect);

router.get('/export/template', supplierController.exportSupplierTemplate);
router.post('/import/excel', upload.single('file'), supplierController.importSuppliersExcel);
router.get('/generate-code', supplierController.generateSupplierCodeRoute);
router.get('/by-ledger/:ledgerId', supplierController.getSuppliersByLedgerId);
router.post('/ensure-for-ledger', supplierController.ensureSupplierForLedger);

router.route('/').get(supplierController.getSuppliers).post(supplierController.createSupplier);
router.route('/:id')
    .get(supplierController.getSupplierById)
    .put(supplierController.updateSupplier)
    .delete(supplierController.deleteSupplier);

export default router;
