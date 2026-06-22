import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';
import {
    EMAIL_BULK_UPLOAD_DIR,
    EMAIL_BULK_ALLOWED_MIMES,
    EMAIL_BULK_MAX_ATTACHMENT_BYTES,
} from '../constants/emailBulk.constants.js';

const uploadRoot = path.join(process.cwd(), EMAIL_BULK_UPLOAD_DIR);
if (!fs.existsSync(uploadRoot)) {
    fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '') || '.bin';
        const safe = String(path.basename(file.originalname || 'file', ext)).replace(/[^\w.\-]+/g, '_');
        cb(null, `eb-${Date.now()}-${safe}${ext.toLowerCase()}`);
    },
});

const fileFilter = (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const okMime = EMAIL_BULK_ALLOWED_MIMES.includes(file.mimetype);
    const okExt = /\.(pdf|jpe?g|png|webp|xlsx?|csv|txt)$/i.test(ext);
    if (okMime || okExt) cb(null, true);
    else cb(new ApiError(400, 'File type not allowed for email bulk upload.'));
};

export const emailBulkUpload = multer({
    storage,
    limits: { fileSize: EMAIL_BULK_MAX_ATTACHMENT_BYTES },
    fileFilter,
});

export const emailBulkAttachmentUpload = multer({
    storage,
    limits: { fileSize: EMAIL_BULK_MAX_ATTACHMENT_BYTES },
    fileFilter,
});
