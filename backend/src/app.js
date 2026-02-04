import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/error.middleware.js';
import { ApiError } from './utils/ApiError.js';
import routes from './routes/v1/index.js';

const app = express();

// Global Middlewares
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:4000', 'http://localhost:5173'],
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.use('/api/v1', routes);

// 404 Handler
app.use((req, res, next) => {
    next(new ApiError(404, 'Endpoint not found'));
});

// Global Error Handler
app.use(errorHandler);

export { app };
