import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import { productCatalogUpload } from '../../middlewares/productCatalogUpload.middleware.js';
import productCatalogValidation from '../../validations/productCatalog.validation.js';
import * as productCatalogController from '../../controllers/productCatalog.controller.js';

const router = express.Router();

router.use(protect);
router.use(requireCompanyFeature('crm.productCatalogEnabled'));

router
    .route('/')
    .get(validate(productCatalogValidation.list), productCatalogController.getProducts)
    .post(validate(productCatalogValidation.create), productCatalogController.createProduct);

router
    .route('/:id')
    .get(validate(productCatalogValidation.getOne), productCatalogController.getProduct)
    .patch(validate(productCatalogValidation.update), productCatalogController.updateProduct)
    .delete(validate(productCatalogValidation.remove), productCatalogController.deleteProduct);

router.post(
    '/:id/upload',
    validate(productCatalogValidation.uploadAsset),
    productCatalogUpload.single('file'),
    productCatalogController.uploadAsset,
);

export default router;
