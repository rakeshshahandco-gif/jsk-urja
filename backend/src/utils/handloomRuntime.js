/**
 * Product-runtime gate for Handloom / Textile-only modules.
 * Uses APPLICATION_KEY / INDUSTRY_TYPE (and optional ENABLE_HANDLOOM_MODULES).
 * Does not read Mongo URIs or secrets.
 */

function normKey(raw = '') {
    return String(raw || '').trim().toLowerCase();
}

function normIndustry(raw = '') {
    return String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/**
 * True when this process should register Handloom-only routes/models.
 * JSK_URJA / electronics → false. Handloom / textile identity → true.
 */
export function isHandloomRuntimeEnabled() {
    const flag = normKey(process.env.ENABLE_HANDLOOM_MODULES);
    if (flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on') {
        return true;
    }
    if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'off') {
        return false;
    }

    const appKey = normKey(process.env.APPLICATION_KEY || process.env.LOCAL_APP_KEY);
    const industry = normIndustry(process.env.INDUSTRY_TYPE || process.env.LOCAL_INDUSTRY_TYPE);

    // JSK / electronics product identity → Handloom OFF
    if (
        appKey.startsWith('jsk')
        || industry.includes('ELECTRONICS')
        || industry === 'JSK_URJA'
        || industry === 'JSK_URJA_ELECTRONICS'
    ) {
        return false;
    }

    // Explicit Handloom / textile product identity → ON
    if (
        appKey.startsWith('handloom')
        || industry.includes('HANDLOOM')
        || industry === 'TEXTILE'
        || industry === 'TEXTILE_HANDLOOM'
        || industry.includes('TEXTILE')
    ) {
        return true;
    }

    // Default OFF so JSK (and unknown electronics-like) startups do not load Textile models.
    // Handloom deploys should set APPLICATION_KEY=handloom-local and/or INDUSTRY_TYPE=HANDLOOM_TEXTILE
    // (or ENABLE_HANDLOOM_MODULES=true).
    return false;
}

export default isHandloomRuntimeEnabled;
