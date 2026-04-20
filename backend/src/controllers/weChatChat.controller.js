import httpStatus from 'http-status';
import { WeChatChat } from '../models/weChatChat.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Get Chat History ─────────────────────────────────────────────────────────

export const getChats = asyncHandler(async (req, res) => {
    const { contactId, groupId, productId, partNumber, tag, source, startDate, endDate, search } = req.query;

    let query = {};

    if (contactId) query.contactId = contactId;
    if (groupId) query.groupId = groupId;
    if (productId) query.productId = productId;
    if (partNumber) query.partNumber = { $regex: partNumber, $options: 'i' };
    if (tag) query.tag = tag;
    if (source) query.source = source;

    if (startDate || endDate) {
        query.chatDate = {};
        if (startDate) query.chatDate.$gte = new Date(startDate);
        if (endDate) query.chatDate.$lte = new Date(endDate);
    }

    if (search) {
        query.message = { $regex: search, $options: 'i' };
    }

    const chats = await WeChatChat.find(query)
        .populate('contactId', 'weChatDisplayName englishName companyName')
        .populate('productId', 'productName partNumber productCategory')
        .populate('groupId', 'groupName')
        .populate('recordedBy', 'name')
        .sort('-chatDate')
        .limit(100);

    res.send(new ApiResponse(httpStatus.OK, chats));
});

// ── Add Chat Entry ───────────────────────────────────────────────────────────

export const addChat = asyncHandler(async (req, res) => {
    const { contactId, groupId, productId, partNumber, productCategory, message, tag, direction, source, chatDate } = req.body;

    if (!contactId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'contactId is required');
    }
    if (!message || !message.trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Message content is required');
    }

    const chat = await WeChatChat.create({
        contactId,
        groupId: groupId || null,
        productId: productId || null,
        partNumber: partNumber || '',
        productCategory: productCategory || '',
        message: message.trim(),
        tag: tag || 'General',
        direction: direction || 'note',
        source: source || 'manual',
        chatDate: chatDate ? new Date(chatDate) : new Date(),
        recordedBy: req.user._id
    });

    const populated = await WeChatChat.findById(chat._id)
        .populate('contactId', 'weChatDisplayName companyName')
        .populate('productId', 'productName partNumber')
        .populate('recordedBy', 'name');

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, populated, 'Chat entry added'));
});

// ── Delete Chat Entry ────────────────────────────────────────────────────────

export const deleteChat = asyncHandler(async (req, res) => {
    const chat = await WeChatChat.findById(req.params.chatId);
    if (!chat) throw new ApiError(httpStatus.NOT_FOUND, 'Entry not found');

    await WeChatChat.findByIdAndDelete(req.params.chatId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Entry deleted'));
});

// ── Upload Attachment to Chat Entry ─────────────────────────────────────────

export const uploadChatAttachment = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');

    const attachment = {
        filename: req.file.originalname,
        url: `/uploads/prd/${req.file.filename}`,
        mimetype: req.file.mimetype,
        size: req.file.size,
        type: req.body.type || 'Other',
        notes: req.body.notes,
        uploadDate: new Date()
    };

    const chat = await WeChatChat.findByIdAndUpdate(
        req.params.chatId,
        { $push: { attachments: attachment } },
        { new: true }
    );

    if (!chat) throw new ApiError(httpStatus.NOT_FOUND, 'Chat entry not found');
    res.send(new ApiResponse(httpStatus.OK, chat, 'Attachment uploaded'));
});
