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
import { startSimpleLeadSearchRuntimeCron } from './cron/simpleLeadSearchRuntimeCron.js';
import { startExtractorScheduleCron } from './cron/extractorScheduleCron.js';
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
        
        // Start Cron Jobs (staging: no WhatsApp/Email bulk auto-send side effects)
        startTaskCron();
        startReminderCron();
        startSimpleLeadSearchRuntimeCron();
        startExtractorScheduleCron();
        if (String(config.appEnv || '').toLowerCase() === 'staging') {
            logger.info('[STAGING] WhatsApp/Email bulk crons disabled');
        } else {
            startWhatsappBulkCron();
            startEmailBulkCron();
        }

        // SLS: reclaim stale CP6–CP8 processing locks after restart (no auto campaign restart)
        setTimeout(() => {
            import('./services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.autoProcessing.service.js')
                .then((mod) => mod.recoverStaleAutoProcessingOnStartup())
                .then((summary) => {
                    logger.info(`[SLS] Startup stale-job recovery: ${JSON.stringify(summary)}`);
                })
                .catch((err) => logger.error(`[SLS] Startup recovery failed: ${err?.message || err}`));
            import('./services/dataExtractor/discovery/phase6/ops.service.js')
                .then((mod) => mod.recoverStaleDiscoveryJobsOnStartup())
                .then((summary) => {
                    logger.info(`[Discovery] Startup stale-job recovery: ${JSON.stringify(summary)}`);
                })
                .catch((err) => logger.error(`[Discovery] Startup recovery failed: ${err?.message || err}`));
        }, 8000);
    }

    // Create HTTP server wrapping Express app
    const httpServer = http.createServer(app);

    // Initialize Socket.io
    initSocket(httpServer);

    // Render requires an open HTTP port on 0.0.0.0; local JSK uses PORT from env/.env.local (5100).
    const listenHost = '0.0.0.0';
    server = httpServer.listen(config.port, listenHost, () => {
        console.log(`Server started at ${new Date().toISOString()} on ${listenHost}:${config.port}`);
        logger.info(`Listening on ${listenHost}:${config.port}`);
        logger.info(`🌐 API available at: http://localhost:${config.port}/api/v1`);

        // Auto-reconnect WhatsApp sessions — skipped on staging to avoid live customer chat side effects
        if (String(config.appEnv || '').toLowerCase() === 'staging') {
            logger.info('[STAGING] WhatsApp session auto-reconnect disabled');
        } else {
            setTimeout(() => {
                WhatsAppService.initializeSavedSessions().catch(e =>
                    logger.error(`[WhatsApp] Session init error: ${e.message}`)
                );
            }, 5000);
        }
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
