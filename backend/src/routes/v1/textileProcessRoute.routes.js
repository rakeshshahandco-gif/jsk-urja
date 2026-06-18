import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import validation from '../../validations/textileProcessRoute.validation.js';
import * as ctrl from '../../controllers/textileProcessRoute.controller.js';

const router = express.Router();
router.use(protect);

router.get('/meta', ctrl.getMeta);
router.get('/eligibility', ctrl.getEligibility);

router.route('/')
    .get(validate(validation.list), ctrl.listRoutes)
    .post(validate(validation.create), ctrl.createRoute);

router.route('/:id')
    .get(ctrl.getRoute)
    .patch(validate(validation.update), ctrl.updateRoute)
    .delete(ctrl.deactivateRoute);

export default router;
