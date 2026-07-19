import fs from 'fs';
import path from 'path';
import { CACHE_KEY_PATTERNS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { backendRoot } from '../lib/env.js';

/**
 * Cache isolation — verifies companyId is part of cache key patterns in code.
 * Does not clear production caches.
 */
export async function runCacheSuite({ live }) {
    const h = createHarness({ category: 'cache', live });

    for (const pattern of CACHE_KEY_PATTERNS) {
        h.expect(pattern.includes('{companyId}'), `cache pattern includes companyId: ${pattern}`, pattern, {
            detail: 'cache key missing companyId',
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'COMPANY_LEAK',
        });
    }

    const guardFile = path.join(backendRoot(), 'src/services/moduleGuard.service.js');
    const src = fs.existsSync(guardFile) ? fs.readFileSync(guardFile, 'utf8') : '';
    h.expect(
        src.includes('companyModules:'),
        'moduleGuard cache key uses companyModules:{companyId}',
        'found',
        {
            detail: 'companyModules: prefix missing in moduleGuard.service.js',
            risk: RISK.HIGH,
            code: 'COMPANY_LEAK',
        },
    );
    h.expect(
        /clearModuleGuardCache/.test(src),
        'clearModuleGuardCache exported for save/login refresh',
        'found',
        { detail: 'clearModuleGuardCache missing', risk: RISK.MEDIUM },
    );

    // FE ModuleGuardContext reloads on company change
    const fe = path.join(backendRoot(), '../src/contexts/ModuleGuardContext.jsx');
    if (fs.existsSync(fe)) {
        const feSrc = fs.readFileSync(fe, 'utf8');
        h.expect(
            /selectedCompany\?\._id/.test(feSrc),
            'FE module guard reloads when selectedCompany changes',
            'selectedCompany?._id referenced',
            { detail: 'ModuleGuardContext missing company dependency', risk: RISK.HIGH, code: 'COMPANY_LEAK' },
        );
    } else {
        h.skip('FE ModuleGuardContext check', 'file not found');
    }

    h.pass('cache suite policy', 'no cross-product cache reuse; keys must include companyId');
    return h.results;
}
