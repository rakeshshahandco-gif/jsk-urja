import express from 'express';
import multer from 'multer';
import path from 'path';
import { protect } from '../../middlewares/auth.middleware.js';
import {
    listCompanies,
    listActiveCompanies,
    getCompany,
    createCompany,
    updateCompany,
    toggleCompanyActive,
    uploadCompanyLogo,
} from '../../controllers/company.controller.js';

const router = express.Router();

// Configure multer for logo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'company-logo-' + uniqueSuffix + path.extname(file.originalname));
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    },
});

router.use(protect);

router.get('/', listCompanies);
router.get('/active', listActiveCompanies);
router.get('/:id', getCompany);
router.post('/', createCompany);
router.put('/:id', updateCompany);
router.patch('/:id/toggle-active', toggleCompanyActive);
router.post('/upload-logo', upload.single('logoFile'), uploadCompanyLogo);

export default router;
