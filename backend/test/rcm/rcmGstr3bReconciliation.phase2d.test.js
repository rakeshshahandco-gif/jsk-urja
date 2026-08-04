/**
 * Phase 2D — RCM GSTR-3B reconciliation gates (unit).
 * Run: node --test backend/test/rcm/rcmGstr3bReconciliation.phase2d.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildInclusionIdempotencyKey,
} from '../../src/services/rcmGstr3bReconciliation.service.js';
import {
    RCM_PERMISSION_IDS,
    RCM_RETURN_WORKFLOW,
    RCM_LIABILITY_RETURN_STATUS,
    RCM_MANUAL_ADJ_OPTIONS,
    PHASE_2D_BANNER,
} from '../../src/config/rcmAccountingDesign.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RCM Phase 2D GSTR-3B reconciliation', () => {
    it('builds stable inclusion idempotency keys', () => {
        const a = buildInclusionIdempotencyKey({
            companyId: 'c1',
            returnPeriod: '2026-07',
            reconciliationVersion: 2,
            liabilityIds: ['b', 'a'],
            itcReleaseIds: ['x'],
        });
        const b = buildInclusionIdempotencyKey({
            companyId: 'c1',
            returnPeriod: '2026-07',
            reconciliationVersion: 2,
            liabilityIds: ['a', 'b'],
            itcReleaseIds: ['x'],
        });
        assert.equal(a, b);
        assert.match(a, /RCM_GSTR3B_INCLUSION\|2026-07\|v2/);
    });

    it('exposes workflow and manual adjustment options', () => {
        assert.equal(RCM_RETURN_WORKFLOW.APPROVED, 'APPROVED');
        assert.equal(RCM_LIABILITY_RETURN_STATUS.INCLUDED_IN_RETURN, 'INCLUDED_IN_RETURN');
        assert.equal(RCM_MANUAL_ADJ_OPTIONS.KEEP_MANUAL, 'KEEP_MANUAL');
        assert.match(PHASE_2D_BANNER, /PREVIEW ONLY/);
    });

    it('wires Phase 2D permissions and routes', () => {
        assert.equal(RCM_PERMISSION_IDS.includeInGstr3b, 'gst.rcm.include_in_gstr3b');
        assert.equal(RCM_PERMISSION_IDS.lockPeriod, 'gst.rcm.lock_period');
        assert.equal(RCM_PERMISSION_IDS.createAmendment, 'gst.rcm.create_amendment');
        const routes = fs.readFileSync(path.join(__dirname, '../../src/routes/v1/rcm.routes.js'), 'utf8');
        assert.match(routes, /gstr3b-reconciliation/);
        assert.match(routes, /include_in_gstr3b/);
        assert.match(routes, /lock_period/);
        const gst = fs.readFileSync(path.join(__dirname, '../../src/services/gstReport.service.js'), 'utf8');
        assert.match(gst, /manualAdjustments\.rcmLiability/);
        assert.match(gst, /rcmPhase2/);
    });
});
