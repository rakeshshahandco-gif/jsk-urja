import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import followupValidation from '../../validations/followup.validation.js';
import followupController from '../../controllers/followup.controller.js';

const router = express.Router();

router
    .route('/')
    .post(validate(followupValidation.createFollowup), followupController.createFollowup)
    .get(validate(followupValidation.getFollowups), followupController.getFollowups);

router
    .route('/upcoming')
    .get(followupController.getUpcomingFollowups);

router
    .route('/customer/:customerId')
    .get(validate(followupValidation.getFollowupsByCustomer), followupController.getFollowupsByCustomer);

router
    .route('/:followupId')
    .get(validate(followupValidation.getFollowup), followupController.getFollowup)
    .patch(validate(followupValidation.updateFollowup), followupController.updateFollowup)
    .delete(validate(followupValidation.deleteFollowup), followupController.deleteFollowup);

export default router;
