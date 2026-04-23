import express from 'express'; // Trigger restart: 2026-04-14T11:55:00Z
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './middlewares/error.middleware.js';
import { ApiError } from './utils/ApiError.js';
import { deletionGuardMiddleware } from './middlewares/deletionGuard.middleware.js';
import routes from './routes/v1/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Global Middlewares
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
    origin: (origin, callback) => {
        // Allow mobile apps (no origin header) or listed web domains
        if (!origin) return callback(null, true);
        
        const allowed = [
            'http://localhost:4000', 
            'http://localhost:4001', 
            'http://localhost:5173', 
            'http://localhost:8081',
            'https://jsk-urja.onrender.com'
        ];
        
        if (allowed.includes(origin) || origin.startsWith('http://localhost:')) {
            callback(null, true);
        } else {
            callback(null, true); // Fallback: allow for testing if matching desktop patterns
        }
    },
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve Frontend Build
const buildPath = path.join(__dirname, '../../dist');
app.use(express.static(buildPath));

// Serve Uploads Directory
const uploadPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadPath));

// API Routes — Global deletion guard runs before all route handlers
app.use('/api/v1', deletionGuardMiddleware);
app.use('/api/v1', routes);

// 404 Handler for API routes
app.use('/api', (req, res, next) => {
    next(new ApiError(404, 'LOCKEDDOWN v7 Endpoint not found'));
});

// SPA Fallback - Serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

// Global Error Handler
app.use(errorHandler);

export { app };
