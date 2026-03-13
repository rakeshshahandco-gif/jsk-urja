import express from 'express';
import cors from 'cors';
// Force restart to apply validation changes (version 4)
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './middlewares/error.middleware.js';
import { ApiError } from './utils/ApiError.js';
import routes from './routes/v1/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Global Middlewares
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
})); // Disabled CSP and allowed cross-origin resources
app.use(cors({
    origin: ['http://localhost:4000', 'http://localhost:5173', "https://jsk-urja.onrender.com"],
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

// API Routes
app.use('/api/v1', routes);

// 404 Handler for API routes
app.use('/api', (req, res, next) => {
    next(new ApiError(404, 'Endpoint not found'));
});

// SPA Fallback - Serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

// Global Error Handler
app.use(errorHandler);

export { app };
