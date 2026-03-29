import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';
import path from 'path';
import fs from 'fs';

// Allowed Mime Types for PLM Module
const allowedMimes = [
    'application/pdf',               // Datasheet, Test Report, Schematic
    'image/jpeg',                   // Images
    'image/png',                    // Images
    'image/webp',                   // Images
    'application/zip',              // Gerber files, Firmware source code
    'application/x-zip-compressed', // Zip variations
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel BOM, Test logs
    'application/vnd.ms-excel',     // .xls
    'text/plain',                   // Firmware versions, notes
    'text/csv'                      // Data logs
];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/prd/';
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate a unique filename: timestamp + random + extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new ApiError(400, `File type ${file.mimetype} is not allowed. Supported formats: PDF, Image, ZIP, Excel, Text.`));
    }
};

export const prdUpload = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25 MB max limit because firmware zips or large schematics
    },
    fileFilter
});
