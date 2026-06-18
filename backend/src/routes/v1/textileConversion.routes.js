import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import textileConversionValidation from '../../validations/textileConversion.validation.js';
import * as ctrl from '../../controllers/textileConversion.controller.js';

const router = express.Router();

router.use(protect);

router.get('/meta', ctrl.getMeta);

router.get(
    '/eligibility',
    validate(textileConversionValidation.eligibility),
    ctrl.getEligibility,
);

router.get(
    '/reports/chain',
    validate(textileConversionValidation.chainReport),
    ctrl.chainReport,
);

router.post(
    '/preview',
    validate(textileConversionValidation.preview),
    ctrl.previewCalc,
);

router
    .route('/masters')
    .get(validate(textileConversionValidation.listMasters), ctrl.listMasters)
    .post(validate(textileConversionValidation.createMaster), ctrl.createMaster);

router
    .route('/masters/:id')
    .get(validate(textileConversionValidation.getMaster), ctrl.getMaster)
    .patch(validate(textileConversionValidation.updateMaster), ctrl.updateMaster)
    .delete(validate(textileConversionValidation.removeMaster), ctrl.removeMaster);

router
    .route('/entries')
    .get(validate(textileConversionValidation.listEntries), ctrl.listEntries)
    .post(validate(textileConversionValidation.createEntry), ctrl.createEntry);

router
    .route('/entries/:id')
    .get(validate(textileConversionValidation.getEntry), ctrl.getEntry);

router.post(
    '/entries/:id/cancel',
    validate(textileConversionValidation.cancelEntry),
    ctrl.cancelEntry,
);

export default router;
