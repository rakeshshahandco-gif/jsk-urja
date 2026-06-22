console.log('--- BACKEND STARTING (v8.2 - Force Deploy) ---'); // Trigger restart: 2026-04-25T15:48:00Z
// Load DB config first so global Mongoose plugins register before models (via app import).
import { connectDB } from './config/db.js';
import { app } from './app.js';
import config from './config/config.js';
import logger from './utils/logger.js';
import http from 'http';
import { initSocket } from './config/socket.js';
import { initializeUserManagement } from './utils/userInitializer.js';
import { ensureDefaultIndustryTemplates } from './services/industryTemplate.service.js';
import { startTaskCron } from './cron/taskCron.js';
import { startReminderCron } from './cron/reminderCron.js';
import { startWhatsappBulkCron } from './cron/whatsappBulkCron.js';
import { startEmailBulkCron } from './cron/emailBulkCron.js';
import WhatsAppService from './services/whatsapp.service.js';

// Connect to Database
let server;
connectDB().then((connected) => {
    if (!connected) {
        logger.warn('⚠️  Starting server without database connection');
    } else {
        // Initialize User Management system on startup
        initializeUserManagement().catch(err => logger.error('User Init Error:', err));
        ensureDefaultIndustryTemplates().catch(err => logger.error('Industry Template Seed Error:', err));
        
        // Start Cron Jobs
        startTaskCron();
        startReminderCron();
        startWhatsappBulkCron();
        startEmailBulkCron();
    }

    // Create HTTP server wrapping Express app
    const httpServer = http.createServer(app);

    // Initialize Socket.io
    initSocket(httpServer);

    server = httpServer.listen(config.port, () => {
        console.log(`Server started at ${new Date().toISOString()} on port ${config.port}`);
        logger.info(`Listening to port ${config.port}`);
        logger.info(`🌐 API available at: http://localhost:${config.port}/api/v1`);

        // Auto-reconnect all saved per-user WhatsApp sessions (after 5s delay for socket init)
        setTimeout(() => {
            WhatsAppService.initializeSavedSessions().catch(e =>
                logger.error(`[WhatsApp] Session init error: ${e.message}`)
            );
        }, 5000);
    });

    httpServer.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            const msg = `Port ${config.port} is already in use. Close duplicate backend terminal or run: npm run dev:safe (from project root)`;
            console.error(`\n❌ ${msg}\n`);
            logger.error(msg);
            process.exit(1);
        }
        logger.error(err);
        process.exit(1);
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
