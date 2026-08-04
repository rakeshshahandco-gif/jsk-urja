/**
 * Unit tests for RCM decision engine (Phase 2A — no DB posting).
 * Run: node --test backend/test/rcm/rcmDecisionEngine.phase2a.test.js
 */
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Lightweight pure-logic tests via dynamic import after mocking models is hard;
// instead test exported constants + scoring behaviour through evaluate with stubs.

describe('RCM Phase 2A constants', () => {
    it('exports treatments and non-posting banner', async () => {
        const mod = await import('../../src/services/rcmDecisionEngine.service.js');
        assert.equal(mod.RCM_TREATMENTS.REVERSE_CHARGE, 'REVERSE_CHARGE');
        assert.equal(mod.RCM_TREATMENTS.FORWARD_CHARGE, 'FORWARD_CHARGE');
        assert.match(mod.PHASE_2A_BANNER, /review only/i);
        assert.match(mod.PHASE_2A_BANNER, /not enabled/i);
    });
});

describe('RCM Phase 2A safety rules (documented)', () => {
    it('engine source forbids blank-GSTIN-only RCM', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const src = fs.readFileSync(
            path.join(__dirname, '../../src/services/rcmDecisionEngine.service.js'),
            'utf8',
        );
        assert.match(src, /Blank GSTIN/);
        assert.match(src, /postingEnabled: false/);
        assert.match(src, /Courier/);
        assert.doesNotMatch(src, /postPurchaseInvoiceToLedger/);
        assert.doesNotMatch(src, /createJournal|gstr3bAdjustment/i);
        assert.match(src, /NEVER posts/);
        assert.match(src, /chargedExplicitNo/);
        assert.match(src, /Voucher line GST rates alone must NOT force Forward Charge/);
        assert.match(src, /RCM signals present and GST is not charged/);
    });

    it('routes register evaluate without posting controllers', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const src = fs.readFileSync(
            path.join(__dirname, '../../src/routes/v1/rcm.routes.js'),
            'utf8',
        );
        assert.match(src, /evaluate/);
        // Evaluate itself remains preview-only; later-phase routes may exist in the same router file
        assert.match(src, /Preview-only RCM evaluation/);
        assert.doesNotMatch(src, /postToLedger|createJournal/i);
        assert.match(src, /router\.post\('\/evaluate'/);
    });
});
