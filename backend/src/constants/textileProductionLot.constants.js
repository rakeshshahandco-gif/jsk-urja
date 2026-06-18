/** Textile / Handloom production demo — stage name matchers (Phase 10). */
export const TEXTILE_INDUSTRY_CODES = ['TEXTILE'];

export const TEXTILE_STAGE_MATCHERS = {
    GREY_FABRIC: ['grey fabric', 'grey'],
    DYEING: ['dyeing'],
    PRINTING: ['printing'],
    FINISHING: ['finishing'],
    INSPECTION: ['inspection'],
    FINISHED_FABRIC: ['finished fabric', 'finished goods', 'finished'],
};

export function findTextileStageIndex(stages = [], matcherKey) {
    const patterns = TEXTILE_STAGE_MATCHERS[matcherKey] || [];
    return stages.findIndex((s) => {
        const name = String(s.stageName || '').toLowerCase();
        return patterns.some((p) => name.includes(p));
    });
}

export function isTextileStageName(stageName, matcherKey) {
    const patterns = TEXTILE_STAGE_MATCHERS[matcherKey] || [];
    const name = String(stageName || '').toLowerCase();
    return patterns.some((p) => name.includes(p));
}
