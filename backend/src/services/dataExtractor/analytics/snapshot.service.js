import { AiAnalyticsSnapshot } from '../../../models/aiAnalyticsSnapshot.model.js';
import { ensureModelIndexes } from '../../../utils/ensureModelIndexes.js';
import { getExecutiveSummary } from './aggregate.service.js';
import { fingerprint } from './filters.util.js';
import { getAnalyticsSettings, settingsFingerprint } from './settings.service.js';

async function ensureAnalyticsSnapshotStore() {
    await ensureModelIndexes(AiAnalyticsSnapshot);
}

export async function getOrRefreshExecutiveSnapshot(companyId, filters, user, { force = false } = {}) {
    await ensureAnalyticsSnapshotStore();
    const settings = await getAnalyticsSettings(companyId);
    const fp = `${fingerprint(filters)}:${settingsFingerprint(settings)}`;
    if (!force) {
        const existing = await AiAnalyticsSnapshot.findOne({
            companyId, dashboardType: 'executive', filterFingerprint: fp, status: 'READY', isDeleted: { $ne: true },
        }).sort({ generatedAt: -1 }).lean();
        if (existing && existing.generatedAt && (Date.now() - new Date(existing.generatedAt).getTime()) < (settings.refreshIntervalSeconds || 120) * 1000) {
            return {
                fromCache: true,
                generatedAt: existing.generatedAt,
                dataThrough: existing.dataThrough,
                metrics: existing.metrics,
                dimensions: existing.dimensions,
                filterFingerprint: existing.filterFingerprint,
                readOnly: true,
            };
        }
    }
    const live = await getExecutiveSummary(companyId, filters, user);
    const snap = await AiAnalyticsSnapshot.create({
        companyId,
        dashboardType: 'executive',
        dateRange: filters.date || {},
        filterFingerprint: fp,
        metrics: live.metrics,
        dimensions: live.dimensions || {},
        sourceRevisionFingerprint: settingsFingerprint(settings),
        generatedAt: new Date(),
        dataThrough: new Date(),
        status: 'READY',
        createdBy: user?._id || user?.id || null,
    });
    return {
        fromCache: false,
        generatedAt: snap.generatedAt,
        dataThrough: snap.dataThrough,
        metrics: snap.metrics,
        dimensions: snap.dimensions,
        filterFingerprint: snap.filterFingerprint,
        readOnly: true,
        liveMeta: { notes: live.notes },
    };
}