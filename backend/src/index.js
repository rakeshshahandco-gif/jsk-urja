import { app } from './app.js';
import config from './config/config.js';
import { connectDB } from './config/db.js';
import logger from './utils/logger.js';

// Connect to Database
let server;
connectDB().then((connected) => {
    if (!connected) {
        logger.warn('⚠️  Starting server without database connection');
    }
    server = app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`);
        logger.info(`🌐 API available at: http://localhost:${config.port}/api/v1`);
    });
}).catch((err) => {
    logger.error('Unexpected error during startup', err);
    process.exit(1);
});

// Graceful Shutdown
const exitHandler = () => {
    if (server) {
        server.close(() => {
            logger.info('Server closed');
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
};

const unexpectedErrorHandler = (error) => {
    logger.error(error);
    exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    if (server) {
        server.close();
    }
});