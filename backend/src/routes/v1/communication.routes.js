import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as communicationController from '../../controllers/communication.controller.js';

const router = express.Router();

router.use(protect);

router.post('/send', communicationController.sendOrder);
router.get('/logs', communicationController.getLogs);
router.get('/download-pdf', communicationController.downloadOrderPDF);

export default router;
