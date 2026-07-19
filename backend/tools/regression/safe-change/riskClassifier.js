import { RISK } from '../config.js';

/**
 * Changed-file risk classifier (Phase 2.6).
 * HIGH cannot auto-downgrade to LOW.
 */

export const RISK_CATEGORIES = Object.freeze({
    AUTH: 'AUTH_USER_COMPANY_CONTEXT',
    MODULE_GUARD: 'MODULE_GUARD_ALLOCATION',
    SALES: 'SALES',
    PRINT: 'PRINT_PDF',
    DATABASE: 'DATABASE_MODEL',
    SHARED_CORE: 'SHARED_CORE',
    OTHER: 'OTHER',
});

const RULES = [
    {
        category: RISK_CATEGORIES.AUTH,
        risk: RISK.HIGH,
        suites: ['authentication', 'company-isolation', 'security', 'company-config'],
        patterns: [
            /auth\.controller/i,
            /auth\.middleware/i,
            /user\.model/i,
            /login/i,
            /CompanyContext/i,
            /companyUserAccess/i,
            /userCompanyContext/i,
            /devActiveContext/i,
            /platformAccess/i,
            /permissions/i,
            /LocalDevContextBadge/i,
            /CompanySwitcher/i,
        ],
    },
    {
        category: RISK_CATEGORIES.MODULE_GUARD,
        risk: RISK.HIGH,
        suites: ['module-state', 'company-isolation', 'cache', 'security'],
        patterns: [
            /moduleGuard/i,
            /moduleState/i,
            /moduleAccessDecision/i,
            /moduleAllocation/i,
            /ModuleGuardContext/i,
            /CompanyModuleAllocation/i,
            /menuModuleMap/i,
        ],
    },
    {
        category: RISK_CATEGORIES.SALES,
        risk: RISK.HIGH,
        suites: ['sales', 'print', 'security', 'company-isolation', 'build'],
        patterns: [
            /salesOrder/i,
            /salesInvoice/i,
            /sales-order/i,
            /sales-invoice/i,
            /\/sales\//i,
            /features\/sales/i,
            /gst/i,
            /freight/i,
            /roundOff/i,
        ],
    },
    {
        category: RISK_CATEGORIES.PRINT,
        risk: RISK.HIGH,
        suites: ['print', 'sales', 'company-isolation', 'build'],
        patterns: [
            /printFormat/i,
            /print-format/i,
            /pdf\.service/i,
            /\/print\//i,
            /goldenReference/i,
            /formPrintLock/i,
            /CustomerPrint/i,
        ],
    },
    {
        category: RISK_CATEGORIES.DATABASE,
        risk: RISK.HIGH,
        suites: ['database-safety', 'company-isolation', 'build'],
        patterns: [
            /\.model\.js$/i,
            /migrate/i,
            /migration/i,
            /backfill/i,
            /schema/i,
        ],
    },
    {
        category: RISK_CATEGORIES.SHARED_CORE,
        risk: RISK.HIGH,
        suites: ['authentication', 'company-isolation', 'module-state', 'security', 'build'],
        patterns: [
            /apiClient/i,
            /App\.jsx$/i,
            /routes\/v1\/index/i,
            /companyScope/i,
            /middlewares\//i,
            /contexts\/Company/i,
        ],
    },
];

function classifyFile(filePath) {
    const hits = [];
    for (const rule of RULES) {
        if (rule.patterns.some((re) => re.test(filePath))) {
            hits.push(rule);
        }
    }
    if (!hits.length) {
        return {
            file: filePath,
            category: RISK_CATEGORIES.OTHER,
            risk: RISK.LOW,
            suites: ['environment', 'cache'],
        };
    }
    // Highest risk wins
    const order = [RISK.BLOCK_DEPLOYMENT, RISK.HIGH, RISK.MEDIUM, RISK.LOW];
    hits.sort((a, b) => order.indexOf(a.risk) - order.indexOf(b.risk));
    const top = hits[0];
    const suites = [...new Set(hits.flatMap((h) => h.suites))];
    return {
        file: filePath,
        category: top.category,
        risk: top.risk,
        categories: [...new Set(hits.map((h) => h.category))],
        suites,
    };
}

export function classifyChanges(changedFiles = []) {
    const files = (changedFiles || [])
        .filter((f) => f && !f.startsWith('backend/tools/regression/reports/'))
        .filter((f) => !/\.whatsapp-auth\//i.test(f));

    const perFile = files.map(classifyFile);
    const categories = [...new Set(perFile.map((p) => p.category))];
    const suites = [...new Set(perFile.flatMap((p) => p.suites || []))];

    let overallRisk = RISK.LOW;
    const order = [RISK.LOW, RISK.MEDIUM, RISK.HIGH, RISK.BLOCK_DEPLOYMENT];
    for (const p of perFile) {
        if (order.indexOf(p.risk) > order.indexOf(overallRisk)) overallRisk = p.risk;
    }

    // Recommended regression level
    let recommendedLevel = 'fast';
    if (overallRisk === RISK.HIGH || overallRisk === RISK.BLOCK_DEPLOYMENT) {
        recommendedLevel = 'release';
    } else if (overallRisk === RISK.MEDIUM || suites.includes('sales') || suites.includes('print')) {
        recommendedLevel = 'full';
    }

    return {
        overallRisk,
        recommendedLevel,
        categories,
        suites,
        perFile,
        fileCount: files.length,
    };
}
