import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import {
    getRawMaterialReport,
    getFinishedGoodsReport,
    getStockLedger,
    getStockMovementLedger,
    rebuildStockMovementLedger,
    getStockSummary,
    getStockDashboard,
} from '../../controllers/stock.controller.js';

const router = express.Router();
router.use(protect);

router.get('/dashboard', getStockDashboard);
router.get('/raw-material-report', getRawMaterialReport);
router.get('/finished-goods-report', getFinishedGoodsReport);
router.get('/summary', getStockSummary);
router.get('/movement-ledger', getStockMovementLedger);
router.post('/rebuild-ledger', rebuildStockMovementLedger);
router.get('/ledger/:itemId', getStockLedger);

export default router;
