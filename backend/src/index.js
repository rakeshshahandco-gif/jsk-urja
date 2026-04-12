console.log('--- BACKEND STARTING (v8 - visibility lockdown active) ---'); // Trigger restart: 2026-04-12T00:12:00Z
import { app } from './app.js';
import config from './config/config.js';
import { connectDB } from './config/db.js';
import logger from './utils/logger.js';
import http from 'http';
import { initSocket } from './config/socket.js';
import { initializeUserManagement } from './utils/userInitializer.js';
import { startTaskCron } from './cron/taskCron.js';
import { startReminderCron } from './cron/reminderCron.js';

// Connect to Database
let server;
connectDB().then((connected) => {
    if (!connected) {
        logger.warn('⚠️  Starting server without database connection');
    } else {
        // Initialize User Management system on startup
        initializeUserManagement().catch(err => logger.error('User Init Error:', err));
        
        // Start Cron Jobs
        startTaskCron();
        startReminderCron();
    }

    // Create HTTP server wrapping Express app
    const httpServer = http.createServer(app);

    // Initialize Socket.io
    initSocket(httpServer);

    server = httpServer.listen(config.port, () => {
        console.log(`Server started at ${new Date().toISOString()} on port ${config.port}`);
        logger.info(`Listening to port ${config.port}`);
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