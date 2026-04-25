import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as contactController from '../../controllers/weChatContact.controller.js';
import * as groupController from '../../controllers/weChatGroup.controller.js';
import * as productController from '../../controllers/weChatProduct.controller.js';
import * as priceController from '../../controllers/weChatPriceRecord.controller.js';
import * as sampleController from '../../controllers/weChatSample.controller.js';
import * as followUpController from '../../controllers/weChatFollowUp.controller.js';
import * as searchController from '../../controllers/weChatSearch.controller.js';
import * as exportController from '../../controllers/weChatExport.controller.js';
import * as importController from '../../controllers/weChatImport.controller.js';
import * as dashboardController from '../../controllers/weChatDashboard.controller.js';
import multer from 'multer';
import { prdUpload } from '../../middlewares/prdUpload.middleware.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
router.use(protect);

// Dashboard
router.get('/dashboard', dashboardController.getDashboardStats);

// Global Search
router.get('/search', searchController.globalSearch);

// Exports
router.get('/export/contacts', exportController.exportContacts);
router.get('/export/prices', exportController.exportPriceComparison);

// Imports
router.post('/import/contacts', upload.single('file'), importController.importContacts);

// Contacts
router.route('/contacts')
    .post(contactController.createContact)
    .get(contactController.getContacts);
router.route('/contacts/:contactId')
    .get(contactController.getContact)
    .put(contactController.updateContact)
    .delete(contactController.deleteContact);

// Groups
router.route('/groups')
    .post(groupController.createGroup)
    .get(groupController.getGroups);
router.route('/groups/:groupId')
    .get(groupController.getGroup)
    .put(groupController.updateGroup)
    .delete(groupController.deleteGroup);

// Group Members
router.route('/groups/:groupId/members')
    .post(groupController.addGroupMember);
router.route('/groups/members/:membershipId')
    .put(groupController.updateGroupMember)
    .delete(groupController.removeGroupMember);

// Products
router.route('/products')
    .post(productController.createProduct)
    .get(productController.getProducts);
router.route('/products/:productId')
    .get(productController.getProduct)
    .put(productController.updateProduct)
    .delete(productController.deleteProduct);

// Prices
router.route('/products/:productId/prices')
    .get(priceController.getProductPrices);
router.route('/prices')
    .post(priceController.createPriceRecord)
    .get(priceController.getPrices);
router.route('/prices/:priceId')
    .put(priceController.updatePriceRecord)
    .delete(priceController.deletePriceRecord);

// Samples
router.route('/samples')
    .post(sampleController.createSample)
    .get(sampleController.getSamples);
router.route('/samples/:sampleId')
    .get(sampleController.getSample)
    .put(sampleController.updateSample)
    .delete(sampleController.deleteSample);

// Follow-Ups
router.route('/followups')
    .post(followUpController.createFollowUp)
    .get(followUpController.getFollowUps);
router.route('/followups/:followUpId')
    .put(followUpController.updateFollowUp)
    .delete(followUpController.deleteFollowUp);

export default router;
