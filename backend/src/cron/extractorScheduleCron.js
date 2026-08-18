import logger from '../utils/logger.js';
import { tickScheduledSearches } from '../services/dataExtractor/discovery/phase6/ops.service.js';

const TICK_MS = 60 * 1000;
let timer = null;
let running = false;

async function tickOnce() {
    if (running) return;
    running = true;
    try {
        await tickScheduledSearches();
    } catch (err) {
        logger.warn(`[ExtractorSchedule] ${err?.message || err}`);
    } finally {
        running = false;
    }
}

export function startExtractorScheduleCron() {
    if (timer) return;
    timer = setInterval(() => { tickOnce(); }, TICK_MS);
    if (typeof timer.unref === 'function') timer.unref();
}
