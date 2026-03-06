import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as stickerController from '../../controllers/sticker.controller.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .get(stickerController.getStickers)
    .post(stickerController.createSticker);

router
    .route('/:id')
    .get(stickerController.getStickerById)
    .put(stickerController.updateSticker)
    .delete(stickerController.deleteSticker);

export default router;
