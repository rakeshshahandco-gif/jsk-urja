import { RISK, BLOCK_DEPLOYMENT_CODES } from '../config.js';

export function createHarness({ category, live = false } = {}) {
    const results = [];

    function push(entry) {
        results.push({
            category,
            ...entry,
            at: new Date().toISOString(),
        });
        const icon = entry.status === 'PASS' ? 'PASS' : entry.status === 'SKIP' ? 'SKIP' : 'FAIL';
        const risk = entry.risk ? ` [${entry.risk}]` : '';
        console.log(`${icon} — [${category}] ${entry.name}${risk}${entry.detail ? `: ${entry.detail}` : ''}`);
    }

    function pass(name, detail = '', extra = {}) {
        push({ name, status: 'PASS', detail, risk: RISK.LOW, ...extra });
    }

    function skip(name, detail = '', extra = {}) {
        push({ name, status: 'SKIP', detail, risk: RISK.LOW, ...extra });
    }

    function fail(name, detail = '', { risk = RISK.HIGH, code = null, ...extra } = {}) {
        const block = code && BLOCK_DEPLOYMENT_CODES.includes(code);
        push({
            name,
            status: 'FAIL',
            detail,
            risk: block ? RISK.BLOCK_DEPLOYMENT : risk,
            code,
            ...extra,
        });
    }

    function expect(cond, name, detailPass = '', failOpts = {}) {
        if (cond) pass(name, detailPass);
        else fail(name, failOpts.detail || 'assertion failed', failOpts);
    }

    return {
        live,
        results,
        pass,
        skip,
        fail,
        expect,
    };
}

export function summarize(allResults) {
    const passed = allResults.filter((r) => r.status === 'PASS').length;
    const failed = allResults.filter((r) => r.status === 'FAIL');
    const skipped = allResults.filter((r) => r.status === 'SKIP').length;
    const warnings = allResults.filter((r) => r.status === 'PASS' && r.risk === RISK.MEDIUM);

    let riskLevel = RISK.LOW;
    if (failed.some((f) => f.risk === RISK.BLOCK_DEPLOYMENT)) riskLevel = RISK.BLOCK_DEPLOYMENT;
    else if (failed.some((f) => f.risk === RISK.HIGH)) riskLevel = RISK.HIGH;
    else if (failed.some((f) => f.risk === RISK.MEDIUM) || warnings.length) riskLevel = RISK.MEDIUM;

    const blockDeployment = riskLevel === RISK.BLOCK_DEPLOYMENT
        || failed.some((f) => BLOCK_DEPLOYMENT_CODES.includes(f.code));

    return {
        passed,
        failed: failed.length,
        skipped,
        warnings: warnings.length,
        riskLevel,
        blockDeployment,
        failures: failed,
    };
}
