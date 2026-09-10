/**
 * Backend ticker for Simple Lead Search Auto Collection / Auto Processing.
 * Advances jobs without requiring the CRM page to stay open (HTTP poll).
 * Reuses existing tickAutoCollection / tickAutoProcessing — no new collections.
 */
import logger from '../utils/logger.js';
import { AssistedCaptureSession } from '../models/assistedCaptureSession.model.js';
import { User } from '../models/user.model.js';
import { companyScopeAls } from '../utils/companyScopeContext.js';

const TICK_MS = 2000;
let timer = null;
let running = false;
const tickerUserCache = new Map();

async function tickerUser(session) {
    const id = String(session.createdBy || '');
    if (tickerUserCache.has(id)) return tickerUserCache.get(id);
    const doc = id
        ? await User.findById(id).select('roleName additionalPermissions permissions').lean()
        : null;
    const user = doc
        ? { ...doc, _id: doc._id, id: doc._id }
        : { _id: session.createdBy, id: session.createdBy };
    tickerUserCache.set(id, user);
    return user;
}

async function tickOnce() {
    if (running) return;
    running = true;
    try {
        const sessions = await AssistedCaptureSession.find({
            $or: [
                {
                    $and: [
                        {
                            $or: [
                                { 'autoCollection.status': 'running' },
                                {
                                    'autoCollection.status': 'paused_owner',
                                    'autoCollection.pauseReason': 'agent_offline',
                                },
                            ],
                        },
                        { 'autoCollection.stopRequested': { $ne: true } },
                        {
                            $or: [
                                { 'autoCollection.ownerStoppedAt': null },
                                { 'autoCollection.ownerStoppedAt': { $exists: false } },
                            ],
                        },
                        { status: { $nin: ['cancelled'] } },
                    ],
                },
                {
                    $and: [
                        { status: { $in: ['completed', 'expired', 'failed'] } },
                        { 'autoCollection.stopRequested': { $ne: true } },
                        {
                            $or: [
                                { 'autoCollection.ownerStoppedAt': null },
                                { 'autoCollection.ownerStoppedAt': { $exists: false } },
                            ],
                        },
                        { 'autoCollection.status': { $in: ['running', 'completed', 'failed'] } },
                    ],
                },
                {
                    'autoProcessing.status': { $nin: ['paused_owner', 'stopped'] },
                    'autoCollection.stopRequested': { $ne: true },
                    $or: [
                        { 'autoProcessing.enabled': true },
                        { 'autoProcessing.ownerWorkflowEnabled': true },
                        { 'autoProcessing.status': 'running' },
                    ],
                },
            ],
        })
            .select('_id companyId createdBy status autoCollection.status autoCollection.pauseReason autoCollection.stopRequested autoCollection.ownerStoppedAt autoProcessing.status autoProcessing.enabled autoProcessing.ownerWorkflowEnabled')
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
            const user = await tickerUser(s);
            await companyScopeAls.run({ companyId }, async () => {
                try {
                    const ownerStopped = Boolean(s.autoCollection?.ownerStoppedAt)
                        || s.autoCollection?.stopRequested === true;
                    const waitingAgent = s.autoCollection?.status === 'running'
                        || (s.autoCollection?.status === 'paused_owner'
                            && s.autoCollection?.pauseReason === 'agent_offline');
                    const needsSleepReclaim = ['completed', 'expired', 'failed'].includes(s.status)
                        && s.autoCollection?.pauseReason !== 'DISCOVERY_AGENT_OFFLINE';
                    if (!ownerStopped && (waitingAgent || needsSleepReclaim)) {
                        await autoCol.tickAutoCollection({ companyId, user, sessionId });
                    }
                } catch (e) {
                    logger.warn(`[SLS-Runtime] AC tick ${sessionId}: ${e?.message || e}`);
                }
                try {
                    const ownerStopped = Boolean(s.autoCollection?.ownerStoppedAt)
                        || s.autoCollection?.stopRequested === true;
                    const mayAp = !ownerStopped
                        && s.autoProcessing
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
