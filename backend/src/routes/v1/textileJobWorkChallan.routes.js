import express from 'express';
import httpStatus from 'http-status';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import textileDyeingChallanValidation from '../../validations/textileDyeingChallan.validation.js';
import * as ctrl from '../../controllers/textileDyeingChallan.controller.js';
import { normalizeProcessType, TEXTILE_JOB_WORK_PROCESS_TYPES } from '../../constants/textileJobWorkChallan.constants.js';
import { ApiError } from '../../utils/ApiError.js';

const router = express.Router({ mergeParams: true });

router.use(protect);
router.use((req, _res, next) => {
    const fromParam = req.params.processType;
    req.processType = normalizeProcessType(fromParam || req.query.processType, 'Embroidery');
    if (!TEXTILE_JOB_WORK_PROCESS_TYPES.includes(req.processType)) {
        return next(new ApiError(httpStatus.BAD_REQUEST, `Invalid process type: ${fromParam}`));
    }
    next();
});

router.get('/meta', ctrl.getMeta);
router.get('/eligibility', ctrl.getEligibility);

router.get('/reports/stock-with-vendor', validate(textileDyeingChallanValidation.reportQuery), ctrl.stockWithDyers);
router.get('/reports/pending', validate(textileDyeingChallanValidation.reportQuery), ctrl.pendingChallans);
router.get('/reports/return-register', validate(textileDyeingChallanValidation.reportQuery), ctrl.returnRegister);
router.get('/reports/vendor-ledger', validate(textileDyeingChallanValidation.reportQuery), ctrl.dyerLedger);
router.get('/reports/loss', validate(textileDyeingChallanValidation.reportQuery), ctrl.lossReport);

router.get('/lookup', validate(textileDyeingChallanValidation.lookup), ctrl.lookupBarcode);

router.route('/')
    .get(validate(textileDyeingChallanValidation.list), ctrl.listChallans)
    .post(validate(textileDyeingChallanValidation.create), ctrl.createChallan);

router.get('/:id/barcode', ctrl.getBarcode);

router.post('/:id/returns', validate(textileDyeingChallanValidation.returnEntry), ctrl.recordReturn);

router.get('/:id', ctrl.getChallan);

export default router;
