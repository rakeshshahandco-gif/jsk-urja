/**
 * Backend ticker for Simple Lead Search Auto Collection / Auto Processing.
 * Advances jobs without requiring the CRM page to stay open (HTTP poll).
 * Reuses existing tickAutoCollection / tickAutoProcessing — no new collections.
 */
import logger from '../utils/logger.js';
import { AssistedCaptureSession } from '../models/assistedCaptureSession.model.js';
import { companyScopeAls } from '../utils/companyScopeContext.js';

const TICK_MS = 2000;
let timer = null;
let running = false;

async function tickOnce() {
    if (running) return;
    running = true;
    try {
        const sessions = await AssistedCaptureSession.find({
            $or: [
                { 'autoCollection.status': 'running' },
                {
                    'autoProcessing.status': { $nin: ['paused_owner', 'stopped'] },
                    $or: [
                        { 'autoProcessing.enabled': true },
                        { 'autoProcessing.ownerWorkflowEnabled': true },
                        { 'autoProcessing.status': 'running' },
                    ],
                },
            ],
        })
            .select('_id companyId createdBy autoCollection.status autoProcessing.status autoProcessing.enabled autoProcessing.ownerWorkflowEnabled')
            .limit(40)
            .lean();

        if (!sessions.length) return;

        const autoCol = await import(
            '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.autoCollection.service.js'
        );
        const autoProc = await import(
            '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.autoProcessing.service.js'
        );

        for (const s of sessions) {
            const companyId = s.companyId;
            const sessionId = String(s._id);
            const user = { _id: s.createdBy, id: s.createdBy };
            await companyScopeAls.run({ companyId }, async () => {
                try {
                    if (s.autoCollection?.status === 'running') {
                        await autoCol.tickAutoCollection({ companyId, user, sessionId });
                    }
                } catch (e) {
                    logger.warn(`[SLS-Runtime] AC tick ${sessionId}: ${e?.message || e}`);
                }
                try {
                    const mayAp = s.autoProcessing
                        && s.autoProcessing.status !== 'paused_owner'
                        && s.autoProcessing.status !== 'stopped'
                        && (
                            s.autoProcessing.enabled
                            || s.autoProcessing.ownerWorkflowEnabled
                            || s.autoProcessing.status === 'running'
                        );
                    if (mayAp) {
                        await autoProc.tickAutoProcessing({ companyId, user, sessionId });
                    }
                } catch (e) {
                    logger.warn(`[SLS-Runtime] AP tick ${sessionId}: ${e?.message || e}`);
                }
            });
        }
    } catch (e) {
        logger.error(`[SLS-Runtime] tick failed: ${e?.message || e}`);
    } finally {
        running = false;
    }
}

export function startSimpleLeadSearchRuntimeCron() {
    if (timer) return;
    timer = setInterval(() => {
        tickOnce().catch(() => {});
    }, TICK_MS);
    // First pass shortly after boot (after stale recovery)
    setTimeout(() => tickOnce().catch(() => {}), 10000);
    logger.info(`[SLS-Runtime] Backend ticker started (every ${TICK_MS}ms)`);
}

export function stopSimpleLeadSearchRuntimeCron() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
