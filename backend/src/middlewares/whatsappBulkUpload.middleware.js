import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';
import {
    WHATSAPP_BULK_UPLOAD_DIR,
    WHATSAPP_BULK_IMAGE_MIMES,
    WHATSAPP_BULK_IMAGE_MAX_BYTES,
} from '../constants/whatsappBulk.constants.js';

const uploadRoot = path.join(process.cwd(), WHATSAPP_BULK_UPLOAD_DIR);
if (!fs.existsSync(uploadRoot)) {
    fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '') || '.bin';
        const safe = String(path.basename(file.originalname || 'file', ext)).replace(/[^\w.\-]+/g, '_');
        cb(null, `wb-${Date.now()}-${safe}${ext.toLowerCase()}`);
    },
});

export const whatsappBulkUpload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
});

const imageFileFilter = (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const okMime = WHATSAPP_BULK_IMAGE_MIMES.includes(file.mimetype);
    const okExt = /\.(jpe?g|png|webp)$/i.test(ext);
    if (okMime || okExt) cb(null, true);
    else cb(new ApiError(400, 'Only JPG, JPEG, PNG, or WEBP images are allowed.'));
};

/** Image uploads for matter/campaign attachments (CRM disk storage pattern). */
export const whatsappBulkImageUpload = multer({
    storage,
    limits: { fileSize: WHATSAPP_BULK_IMAGE_MAX_BYTES },
    fileFilter: imageFileFilter,
});
