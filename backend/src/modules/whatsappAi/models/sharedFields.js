import mongoose from 'mongoose';

/** Soft-delete + actor audit fields shared by WhatsApp AI models (no field-level indexes). */
export const softDeleteAuditFields = {
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
};

/** Attachment metadata only - never binary/base64. */
export const attachmentMetaSchema = new mongoose.Schema(
    {
        fileName: { type: String, trim: true, default: '', maxlength: 260 },
        fileUrl: { type: String, trim: true, default: '', maxlength: 2000 },
        storageReference: { type: String, trim: true, default: '', maxlength: 1000 },
        mimeType: { type: String, trim: true, default: '', maxlength: 120 },
        fileSize: { type: Number, default: null, min: 0 },
        checksum: { type: String, trim: true, default: '', maxlength: 128 },
    },
    { _id: false },
);

export function assertNoBinaryPayload(payload = {}) {
    const forbidden = ['base64', 'binary', 'buffer', 'fileContent', 'dataUri', 'contentBase64'];
    for (const key of forbidden) {
        if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] != null && payload[key] !== '') {
            const err = new Error('Binary/base64 field not allowed: ' + key);
            err.statusCode = 400;
            throw err;
        }
    }
    const s = JSON.stringify(payload);
    if (/data:[^;]+;base64,/i.test(s)) {
        const err = new Error('Base64 data URI content is not allowed');
        err.statusCode = 400;
        throw err;
    }
}