import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';

const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/product-catalog/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const safeField = String(file.fieldname || 'file').replace(/[^a-z0-9_-]/gi, '');
        cb(null, safeField + '-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Allowed: PDF/JPG/PNG/WEBP/GIF.`));
    }
};

export const productCatalogUpload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter,
});
