import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION } from './constants.js';

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

export function normalizeMarketingSettings(raw = {}) {
    const base = clone(DEFAULT_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        allowedCampaignTypes: Array.isArray(incoming.allowedCampaignTypes) && incoming.allowedCampaignTypes.length
            ? incoming.allowedCampaignTypes.map(String)
            : base.allowedCampaignTypes,
        allowedDraftChannels: Array.isArray(incoming.allowedDraftChannels) && incoming.allowedDraftChannels.length
            ? incoming.allowedDraftChannels.map(String)
            : base.allowedDraftChannels,
        minimumDaysBetweenCampaigns: Math.max(0, Number(incoming.minimumDaysBetweenCampaigns ?? base.minimumDaysBetweenCampaigns) || 0),
        sameCampaignCooldownDays: Math.max(0, Number(incoming.sameCampaignCooldownDays ?? base.sameCampaignCooldownDays) || 0),
        maximumCampaignsPer7Days: Math.max(0, Number(incoming.maximumCampaignsPer7Days ?? base.maximumCampaignsPer7Days) || 0),
        maximumCampaignsPer30Days: Math.max(0, Number(incoming.maximumCampaignsPer30Days ?? base.maximumCampaignsPer30Days) || 0),
        audiencePreviewLimit: Math.max(1, Number(incoming.audiencePreviewLimit ?? base.audiencePreviewLimit) || 200),
        maximumDraftAudience: Math.max(1, Number(incoming.maximumDraftAudience ?? base.maximumDraftAudience) || 5000),
        maximumExportRows: Math.max(1, Number(incoming.maximumExportRows ?? base.maximumExportRows) || 5000),
        previewConfirmThreshold: Math.max(1, Number(incoming.previewConfirmThreshold ?? base.previewConfirmThreshold) || 500),
        AIMessageDraftEnabled: incoming.AIMessageDraftEnabled === true,
        allowGenericContacts: incoming.allowGenericContacts === true,
        allowUnverifiedManualReview: incoming.allowUnverifiedManualReview !== false,
        requireVerifiedEmail: incoming.requireVerifiedEmail !== false,
        requireVerifiedPhone: incoming.requireVerifiedPhone !== false,
        optOutRequired: incoming.optOutRequired !== false,
        frequencyCheckRequired: incoming.frequencyCheckRequired !== false,
        finalApprovalRequired: incoming.finalApprovalRequired !== false,
        safeModeSuggestionDefaults: {
            ...base.safeModeSuggestionDefaults,
            ...(incoming.safeModeSuggestionDefaults || {}),
        },
    };
}

export async function getMarketingSettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizeMarketingSettings(doc?.aiLeadIntelligence?.marketingIntelligence || {});
}

export async function saveMarketingSettings(companyId, userId, payload = {}) {
    const normalized = normalizeMarketingSettings(payload);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { marketingIntelligence: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.marketingIntelligence = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export function settingsFingerprint(settings) {
    return `${settings.version || SETTINGS_VERSION}:${ENGINE_VERSION}:${settings.defaultLanguage}:${settings.minimumDaysBetweenCampaigns}`;
}
