import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import customerValidation from '../../validations/customer.validation.js';
import customerController from '../../controllers/customer.controller.js';
import reminderController from '../../controllers/reminder.controller.js';

const router = express.Router();

router
    .route('/')
    .post(validate(customerValidation.createCustomer), customerController.createCustomer)
    .get(validate(customerValidation.getCustomers), customerController.getCustomers);

router
    .route('/:id')
    .get(validate(customerValidation.getCustomer), customerController.getCustomer)
    .put(validate(customerValidation.updateCustomer), customerController.updateCustomer)
    .delete(validate(customerValidation.deleteCustomer), customerController.deleteCustomer);

router.route('/:id/conversations').get(customerController.getCustomerConversations);
router.route('/:customerId/conversation-history').get(customerController.getConversationHistory);

router.route('/:customerId/reminder').put(reminderController.upsertReminder);

export default router;
