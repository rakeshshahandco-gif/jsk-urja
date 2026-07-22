/**
 * WhatsApp AI module — Phase 1A foundation.
 * Isolated from live WhatsApp send/receive and AI providers.
 */
export { default as whatsappAiRouter } from './routes/whatsappAi.routes.js';
export * from './constants/whatsappAi.constants.js';
export * from './models/index.js';

import whatsappAiRouter from './routes/whatsappAi.routes.js';
export default whatsappAiRouter;