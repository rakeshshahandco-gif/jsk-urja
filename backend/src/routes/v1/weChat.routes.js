import express from 'express';
import * as weChatController from '../../controllers/weChat.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { prdUpload } from '../../middlewares/prdUpload.middleware.js';

const router = express.Router();

router.use(protect);

// ── Unified Search ───────────────────────────────────────────────────────────
router.get('/search', checkPermission('wechat.contacts.view'), weChatController.searchUnified);

// ── Contacts ─────────────────────────────────────────────────────────────────
router.route('/contacts')
    .get(checkPermission('wechat.contacts.view'), weChatController.getContacts)
    .post(checkPermission('wechat.contacts.manage'), weChatController.createContact);

router.route('/contacts/:contactId')
    .get(checkPermission('wechat.contacts.view'), weChatController.getContact)
    .patch(checkPermission('wechat.contacts.manage'), weChatController.updateContact)
    .delete(checkPermission('wechat.contacts.delete'), weChatController.deleteContact);

router.post('/contacts/:contactId/notes', checkPermission('wechat.contacts.notes'), weChatController.addNoteToContact);

// ── Groups ───────────────────────────────────────────────────────────────────
router.route('/groups')
    .get(checkPermission('wechat.contacts.view'), weChatController.getGroups)
    .post(checkPermission('wechat.contacts.manage'), weChatController.createGroup);

router.route('/groups/:groupId')
    .get(checkPermission('wechat.contacts.view'), weChatController.getGroup)
    .patch(checkPermission('wechat.contacts.manage'), weChatController.updateGroup)
    .delete(checkPermission('wechat.contacts.delete'), weChatController.deleteGroup);

router.post('/groups/:groupId/notes', checkPermission('wechat.contacts.notes'), weChatController.addNoteToGroup);

// ── Attachments ──────────────────────────────────────────────────────────────
router.post('/attachments/:targetType/:targetId', 
    checkPermission('wechat.contacts.manage'), 
    prdUpload.single('file'), 
    weChatController.uploadAttachment
);

export default router;
