import express from 'express';
import multer from 'multer';
import { validate } from '../../middlewares/validate.middleware.js';
import customerValidation from '../../validations/customer.validation.js';
import customerController from '../../controllers/customer.controller.js';
import reminderController from '../../controllers/reminder.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// router.use(protect); // TEMPORARILY DISABLED FOR RECOVERY

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
        }
    },
});

router
    .route('/')
    .post(validate(customerValidation.createCustomer), customerController.createCustomer)
    .get(validate(customerValidation.getCustomers), customerController.getCustomers);

// Import/Export routes
router.get('/template/download', customerController.downloadTemplate);
router.post('/import', upload.single('file'), customerController.importCustomers);
router.get('/export', customerController.exportCustomers);

// GST specific bulk update routes
router.post('/import-gst/preview', upload.single('file'), customerController.previewGSTImport);
router.post('/import-gst/confirm', customerController.confirmGSTImport);

router.get('/search', customerController.searchCustomers);
router.get('/types', customerController.getCustomerTypes);
router.get('/stickers', customerController.getCustomerStickers);

router
    .route('/:id')
    .get(validate(customerValidation.getCustomer), customerController.getCustomer)
    .put(validate(customerValidation.updateCustomer), customerController.updateCustomer)
    .delete(validate(customerValidation.deleteCustomer), customerController.deleteCustomer);

router.route('/:id/conversations').get(customerController.getCustomerConversations);
router.route('/:customerId/conversation-history').get(customerController.getConversationHistory);

router.route('/:customerId/reminder').put(reminderController.upsertReminder);

// Debug/Restoration Route (TEMPORARILY UNPROTECTED FOR RECOVERY)
router.get('/debug/restore-all', customerController.restoreAllCustomers);

export default router;
