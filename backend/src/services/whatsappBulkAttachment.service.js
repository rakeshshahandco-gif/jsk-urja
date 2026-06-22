import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ApiError } from '../utils/ApiError.js';
import {
    WHATSAPP_BULK_UPLOAD_DIR,
    WHATSAPP_BULK_IMAGE_EXTENSIONS,
    WHATSAPP_BULK_SEND_CONTENT_TYPES,
} from '../constants/whatsappBulk.constants.js';

export function buildImageAttachmentRef({ file, companyId, userId, financialYearId = null }) {
    const relative = path.join(WHATSAPP_BULK_UPLOAD_DIR, file.filename).replace(/\\/g, '/');
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
        fileName: file.filename,
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

/** Backward compat: legacy attachmentPath string. */
export function resolveLegacyAttachmentPath(attachmentPath) {
    if (!attachmentPath) return '';
    return path.isAbsolute(attachmentPath) ? attachmentPath : path.join(process.cwd(), attachmentPath);
}

export function resolveCampaignAttachment(campaignOrMatter) {
    if (campaignOrMatter?.imageAttachment?.filePath) {
        return {
            ref: campaignOrMatter.imageAttachment,
            absolutePath: resolveAttachmentAbsolutePath(campaignOrMatter.imageAttachment),
        };
    }
    const legacy = campaignOrMatter?.attachmentPath || '';
    if (!legacy) return { ref: null, absolutePath: '' };
    return {
        ref: {
            attachmentId: '',
            fileName: path.basename(legacy),
            filePath: legacy,
            fileUrl: legacy.startsWith('/') ? legacy : `/${legacy}`,
            mimeType: '',
            sizeBytes: 0,
        },
        absolutePath: resolveLegacyAttachmentPath(legacy),
    };
}

export function isImageAttachmentRef(ref) {
    if (!ref?.filePath) return false;
    const ext = path.extname(ref.fileName || ref.filePath).toLowerCase();
    if (WHATSAPP_BULK_IMAGE_EXTENSIONS.includes(ext)) return true;
    return (ref.mimeType || '').startsWith('image/');
}

export function assertImageFileExists(absolutePath, label = 'Image') {
    if (!absolutePath) {
        throw new ApiError(400, `${label} is required but no file was selected`);
    }
    if (!fs.existsSync(absolutePath)) {
        throw new ApiError(400, `${label} file not found on server. Please re-upload the image.`);
    }
    const ext = path.extname(absolutePath).toLowerCase();
    if (!WHATSAPP_BULK_IMAGE_EXTENSIONS.includes(ext)) {
        throw new ApiError(400, `${label} must be JPG, JPEG, PNG, or WEBP`);
    }
}

export function validateSendContentPayload({ sendContentType, messageBody, imageAttachment, absolutePath }) {
    const mode = sendContentType || 'text_only';
    if (!WHATSAPP_BULK_SEND_CONTENT_TYPES.includes(mode)) {
        throw new ApiError(400, 'Invalid send content type');
    }
    if (mode === 'text_only') {
        if (!String(messageBody || '').trim()) {
            throw new ApiError(400, 'Message body is required for text-only send');
        }
        return;
    }
    assertImageFileExists(absolutePath, 'Image');
    if (!isImageAttachmentRef(imageAttachment || { filePath: absolutePath })) {
        throw new ApiError(400, 'Attachment must be a JPG, JPEG, PNG, or WEBP image');
    }
    if (mode === 'image_with_caption' && !String(messageBody || '').trim()) {
        throw new ApiError(400, 'Caption/message is required for image + caption send');
    }
}
