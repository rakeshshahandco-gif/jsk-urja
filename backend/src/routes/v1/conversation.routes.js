import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import conversationValidation from '../../validations/conversation.validation.js';
import conversationController from '../../controllers/conversation.controller.js';

const router = express.Router();

router
    .route('/')
    .post(validate(conversationValidation.createConversation), conversationController.createConversation)
    .get(validate(conversationValidation.getConversations), conversationController.getConversations);

router
    .route('/customer/:customerId')
    .get(validate(conversationValidation.getConversationsByCustomer), conversationController.getConversationsByCustomer);

router
    .route('/:conversationId')
    .get(validate(conversationValidation.getConversation), conversationController.getConversation)
    .patch(validate(conversationValidation.updateConversation), conversationController.updateConversation)
    .delete(validate(conversationValidation.deleteConversation), conversationController.deleteConversation);

export default router;
