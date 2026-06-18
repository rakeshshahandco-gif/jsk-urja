import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import textileDyeingChallanValidation from '../../validations/textileDyeingChallan.validation.js';
import * as ctrl from '../../controllers/textileDyeingChallan.controller.js';

const router = express.Router();

router.use(protect);
router.use((req, _res, next) => {
    req.processType = 'Dyeing';
    next();
});

router.get('/meta', ctrl.getMeta);
router.get('/eligibility', ctrl.getEligibility);

router.get('/reports/stock-with-dyers', validate(textileDyeingChallanValidation.reportQuery), ctrl.stockWithDyers);
router.get('/reports/pending', validate(textileDyeingChallanValidation.reportQuery), ctrl.pendingChallans);
router.get('/reports/return-register', validate(textileDyeingChallanValidation.reportQuery), ctrl.returnRegister);
router.get('/reports/dyer-ledger', validate(textileDyeingChallanValidation.reportQuery), ctrl.dyerLedger);
router.get('/reports/loss', validate(textileDyeingChallanValidation.reportQuery), ctrl.lossReport);

router.get('/lookup', validate(textileDyeingChallanValidation.lookup), ctrl.lookupBarcode);

router.route('/')
    .get(validate(textileDyeingChallanValidation.list), ctrl.listChallans)
    .post(validate(textileDyeingChallanValidation.create), ctrl.createChallan);

router.get('/:id/barcode', ctrl.getBarcode);

router.post('/:id/returns', validate(textileDyeingChallanValidation.returnEntry), ctrl.recordReturn);

router.get('/:id', ctrl.getChallan);

export default router;
