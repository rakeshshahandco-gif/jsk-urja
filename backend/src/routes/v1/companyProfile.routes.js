import express from 'express';
import { getCompanyProfile, updateCompanyProfile } from '../../controllers/companyProfile.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';
import multer from 'multer';
import path from 'path';

// Configure multer for disk storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Make sure this folder exists
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext) || file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDF files are allowed'));
        }
    }
});

const router = express.Router();

router.use(protect); // All company profile routes are protected

router.route('/')
    .get(getCompanyProfile)
    .put(upload.single('logoFile'), updateCompanyProfile);

export default router;
