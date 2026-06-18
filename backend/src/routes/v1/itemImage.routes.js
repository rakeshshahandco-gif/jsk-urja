import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { itemImageUpload } from '../../middlewares/itemImageUpload.middleware.js';
import itemImageValidation from '../../validations/itemImage.validation.js';
import * as itemImageController from '../../controllers/itemImage.controller.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/meta', itemImageController.getMeta);

router.get(
    '/eligibility',
    itemImageController.getEligibility,
);

router.get(
    '/:itemId',
    validate(itemImageValidation.listByItem),
    itemImageController.listImages,
);

router.post(
    '/:itemId/upload',
    itemImageUpload.single('file'),
    validate(itemImageValidation.upload),
    itemImageController.uploadImage,
);

router.get(
    '/file/:imageId',
    validate(itemImageValidation.getImage),
    itemImageController.getImage,
);

router.put(
    '/file/:imageId/replace',
    itemImageUpload.single('file'),
    validate(itemImageValidation.replace),
    itemImageController.replaceImage,
);

router.delete(
    '/file/:imageId',
    validate(itemImageValidation.remove),
    itemImageController.removeImage,
);

export default router;
