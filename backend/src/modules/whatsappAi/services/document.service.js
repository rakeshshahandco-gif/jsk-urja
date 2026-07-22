import { WhatsAppAIDocumentReference } from '../models/index.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertNoBinaryPayload } from '../models/sharedFields.js';
import { appendActionLog } from './audit.service.js';

function parsePagination(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

export async function listDocuments(companyId, query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { companyId, isDeleted: false };
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    if (query.documentType) filter.documentType = query.documentType;
    if (query.productId) filter.productId = query.productId;
    if (query.active === 'true' || query.active === true) filter.active = true;
    if (query.q) {
        const q = String(query.q).trim();
        filter.$or = [
            { title: new RegExp(q, 'i') },
            { fileName: new RegExp(q, 'i') },
        ];
    }

    const [results, total] = await Promise.all([
        WhatsAppAIDocumentReference.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        WhatsAppAIDocumentReference.countDocuments(filter),
    ]);
    return { results, page, limit, total, totalPages: Math.ceil(total / limit) || 0 };
}

export async function createDocument(companyId, payload, userId) {
    assertNoBinaryPayload(payload);
    const doc = await WhatsAppAIDocumentReference.create({
        companyId,
        productId: payload.productId || null,
        knowledgeId: payload.knowledgeId || null,
        title: payload.title,
        documentType: payload.documentType || 'other',
        fileName: payload.fileName || '',
        fileUrl: payload.fileUrl || '',
        storageReference: payload.storageReference || '',
        mimeType: payload.mimeType || '',
        fileSize: payload.fileSize ?? null,
        checksum: payload.checksum || '',
        language: payload.language || 'en',
        approvalStatus: payload.approvalStatus || 'draft',
        active: payload.active !== false,
        createdBy: userId,
        updatedBy: userId,
    });
    await appendActionLog({
        companyId,
        actionType: 'document_created',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Document created: ${doc.title}`,
        afterState: { id: doc._id, title: doc.title },
        success: true,
    });
    return doc.toObject();
}

export async function updateDocument(companyId, id, payload, userId) {
    assertNoBinaryPayload(payload);
    const doc = await WhatsAppAIDocumentReference.findOne({ _id: id, companyId, isDeleted: false });
    if (!doc) throw new ApiError(404, 'Document not found');

    const fields = [
        'productId', 'knowledgeId', 'title', 'documentType', 'fileName', 'fileUrl',
        'storageReference', 'mimeType', 'fileSize', 'checksum', 'language',
        'approvalStatus', 'active',
    ];
    for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(payload, f)) doc[f] = payload[f];
    }
    doc.updatedBy = userId;
    await doc.save();

    await appendActionLog({
        companyId,
        actionType: 'document_updated',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Document updated: ${doc.title}`,
        success: true,
    });
    return doc.toObject();
}