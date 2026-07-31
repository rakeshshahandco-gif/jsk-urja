/**
 * Controlled Test Mode ? hard caps for the first local SerpAPI+Places implementation.
 */

export const CONTROLLED_TEST_DEFAULTS = {
    enabled: true,
    maxResults: 10,
    maxWebsites: 10,
    maxPagesPerWebsite: 3,
    maxSerpApiPages: 1,
};

export function getControlledTestConfig(settings = null) {
    const raw = settings?.sourceConnectors?.controlledTestMode || {};
    const enabled = raw.enabled !== false;
    return {
        enabled,
        maxResults: Math.min(
            CONTROLLED_TEST_DEFAULTS.maxResults,
            Math.max(1, Number(raw.maxResults) || CONTROLLED_TEST_DEFAULTS.maxResults),
        ),
        maxWebsites: Math.min(
            CONTROLLED_TEST_DEFAULTS.maxWebsites,
            Math.max(1, Number(raw.maxWebsites) || CONTROLLED_TEST_DEFAULTS.maxWebsites),
        ),
        maxPagesPerWebsite: Math.min(
            CONTROLLED_TEST_DEFAULTS.maxPagesPerWebsite,
            Math.max(1, Number(raw.maxPagesPerWebsite) || CONTROLLED_TEST_DEFAULTS.maxPagesPerWebsite),
        ),
        maxSerpApiPages: Math.min(
            CONTROLLED_TEST_DEFAULTS.maxSerpApiPages,
            Math.max(1, Number(raw.maxSerpApiPages) || CONTROLLED_TEST_DEFAULTS.maxSerpApiPages),
        ),
        bannerMessage: 'Controlled Test Mode is active. Maximum 10 results will be processed.',
    };
}

export function applyControlledResultCap(requestedMax, settings) {
    const ctlCfg = getControlledTestConfig(settings);
    const settingsCap = Math.min(
        Number(settings?.maxResultsPerSearch) || ctlCfg.maxResults,
        ctlCfg.maxResults,
    );
    const requested = Math.max(1, Number(requestedMax) || ctlCfg.maxResults);
    if (!ctlCfg.enabled) {
        return Math.min(settingsCap || 10, requested, 10);
    }
    return Math.min(ctlCfg.maxResults, settingsCap, requested);
}
