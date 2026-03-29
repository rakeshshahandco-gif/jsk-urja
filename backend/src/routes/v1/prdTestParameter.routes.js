import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePrdRole, requirePrdDeletePermission } from '../../middlewares/prdAuth.middleware.js';
import * as prdTestParamController from '../../controllers/prdTestParameter.controller.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .get(
        requirePrdRole('rd_manager', 'testing_eng', 'qa_head', 'production', 'management_viewer'),
        prdTestParamController.getParameters
    )
    .post(
        requirePrdRole('rd_manager', 'qa_head'),
        prdTestParamController.createParameter
    );

router
    .route('/:id')
    .put(
        requirePrdRole('rd_manager', 'qa_head'),
        prdTestParamController.updateParameter
    )
    .delete(
        requirePrdDeletePermission,
        prdTestParamController.deleteParameter
    );

export default router;
