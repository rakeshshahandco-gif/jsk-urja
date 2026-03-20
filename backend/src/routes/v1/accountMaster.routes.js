import express from 'express';
import accountMasterController from '../../controllers/accountMaster.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/initialize', accountMasterController.initializeMasters);
router.get('/groups', accountMasterController.getGroups);
router.post('/groups', accountMasterController.createGroup);
router.get('/ledgers', accountMasterController.getLedgers);
router.post('/ledgers', accountMasterController.createLedger);

export default router;
