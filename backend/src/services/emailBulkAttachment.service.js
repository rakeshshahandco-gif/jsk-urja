import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ApiError } from '../utils/ApiError.js';
import {
    EMAIL_BULK_UPLOAD_DIR,
    EMAIL_BULK_SEND_CONTENT_TYPES,
} from '../constants/emailBulk.constants.js';

export function buildAttachmentRef({ file, companyId, userId, financialYearId = null }) {
    const relative = path.join(EMAIL_BULK_UPLOAD_DIR, file.filename).replace(/\\/g, '/');
    const absolute = path.join(process.cwd(), relative);
    let checksum = '';
    try {
        const buf = fs.readFileSync(absolute);
        checksum = crypto.createHash('md5').update(buf).digest('hex');
    } catch {
        checksum = '';
    }
    return {
        attachmentId: crypto.randomUUID(),
        fileName: file.originalname || file.filename,
        filePath: relative,
        fileUrl: `/${relative}`,
        mimeType: file.mimetype || '',
        sizeBytes: file.size || 0,
        checksum,
        companyId: companyId || null,
        financialYearId: financialYearId || null,
        createdBy: userId || null,
    };
}

export function resolveAttachmentAbsolutePath(attachmentRef) {
    if (!attachmentRef?.filePath) return '';
    const p = attachmentRef.filePath;
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function resolveCampaignAttachments(campaignOrTemplate) {
    const refs = campaignOrTemplate?.attachments || [];
    return refs.map((ref) => ({
        ref,
        absolutePath: resolveAttachmentAbsolutePath(ref),
    }));
}

export function assertAttachmentExists(absolutePath, label = 'Attachment') {
    if (!absolutePath) {
        throw new ApiError(400, `${label} is required but no file was selected`);
    }
    if (!fs.existsSync(absolutePath)) {
        throw new ApiError(400, `${label} file not found on server. Please re-upload.`);
    }
}

export function validateSendContentPayload({ sendContentType, subject, bodyText, bodyHtml, attachments = [] }) {
    const mode = sendContentType || 'text_only';
    if (!EMAIL_BULK_SEND_CONTENT_TYPES.includes(mode)) {
        throw new ApiError(400, 'Invalid send content type');
    }
    if (!String(subject || '').trim()) {
        throw new ApiError(400, 'Subject is required');
    }
    if (mode === 'text_only' && !String(bodyText || bodyHtml || '').trim()) {
        throw new ApiError(400, 'Email body is required for text-only send');
    }
    if (mode === 'html' && !String(bodyHtml || bodyText || '').trim()) {
        throw new ApiError(400, 'HTML body is required for html send');
    }
    if (mode === 'html_with_attachment') {
        if (!String(bodyHtml || bodyText || '').trim()) {
            throw new ApiError(400, 'Email body is required for html with attachment');
        }
        if (!attachments.length) {
            throw new ApiError(400, 'At least one attachment is required');
        }
        for (const att of attachments) {
            assertAttachmentExists(resolveAttachmentAbsolutePath(att), 'Attachment');
        }
    }
}

export function toNodemailerAttachments(attachments = []) {
    return attachments.map((att) => {
        const absolutePath = resolveAttachmentAbsolutePath(att);
        return {
            filename: att.fileName || path.basename(absolutePath),
            path: absolutePath,
            contentType: att.mimeType || undefined,
        };
    });
}
