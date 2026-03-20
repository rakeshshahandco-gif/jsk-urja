import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import {
    getRawMaterialReport,
    getFinishedGoodsReport,
    getStockLedger,
    getStockSummary,
    getStockDashboard,
} from '../../controllers/stock.controller.js';

const router = express.Router();
router.use(protect);

router.get('/dashboard', getStockDashboard);
router.get('/raw-material-report', getRawMaterialReport);
router.get('/finished-goods-report', getFinishedGoodsReport);
router.get('/summary', getStockSummary);
router.get('/ledger/:itemId', getStockLedger);

export default router;
