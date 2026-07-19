import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectActiveProduct, isCheckApplicable, skipReasonForCheck, evaluateProductDatabase } from '../lib/productContext.js';
import { runApplicableUnitBundle } from '../lib/process.js';
import { UNIT_TEST_CHECKS, SCRIPT_CHECKS, PRODUCTS } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const savedEnv = {};
before(() => {
    for (const k of ['REGRESSION_PRODUCT', 'APPLICATION_KEY']) {
        savedEnv[k] = process.env[k];
        delete process.env[k];
    }
});
after(() => {
    for (const k of Object.keys(savedEnv)) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
});

describe('product-aware regression selection', () => {
    it('detects JSK from jsk-deploy folder', () => {
        const ctx = detectActiveProduct('D:\\JSK-E-SARTHI-MASTER-jsk-deploy');
        assert.equal(ctx.productKey, 'jsk');
        assert.equal(ctx.expectedDatabase, 'jsk-esarthi-ui-dev');
        assert.equal(ctx.expectedFrontendPort, 4100);
        assert.equal(ctx.expectedBackendPort, 5100);
        assert.equal(ctx.expectedIdentity, 'jsk-local');
    });

    it('detects Handloom from master folder', () => {
        const ctx = detectActiveProduct('D:\\JSK-E-SARTHI-MASTER');
        assert.equal(ctx.productKey, 'handloom');
        assert.equal(ctx.expectedDatabase, 'handloom_crm');
        assert.equal(ctx.expectedFrontendPort, 4000);
        assert.equal(ctx.expectedBackendPort, 5000);
    });

    it('unknown product does not guess database', () => {
        const ctx = detectActiveProduct('D:\\some-other-repo');
        assert.equal(ctx.productKey, 'unknown');
        assert.equal(ctx.expectedDatabase, null);
        assert.ok(ctx.warning);
        assert.match(ctx.warning, /UNKNOWN_PRODUCT/);
        assert.match(ctx.warning, /not SAFE FOR DEPLOYMENT/);
        assert.equal(evaluateProductDatabase('unknown', 'anything'), null);
    });

    it('Handloom-only checks are not applicable on JSK', () => {
        assert.equal(isCheckApplicable(['handloom'], 'jsk'), false);
        assert.equal(isCheckApplicable(['handloom', 'jsk'], 'jsk'), true);
        const reason = skipReasonForCheck({ id: 'handloom-print-separation', products: ['handloom'] }, 'jsk');
        assert.match(reason, /SKIPPED/);
        assert.match(reason, /jsk/i);
    });

    it('JSK salesGst bundle skips Handloom-only files without failing', () => {
        const r = runApplicableUnitBundle('salesGst', 'jsk');
        assert.equal(r.ok, true);
        assert.equal(r.skippedAll, true);
        assert.ok(r.skipReasons.length >= 1);
        assert.equal(r.missingRequired.length, 0);
        assert.ok(r.skipReasons.every((s) => s.startsWith('SKIPPED')));
    });

    it('JSK print bundle skips Handloom-only files without failing', () => {
        const r = runApplicableUnitBundle('print', 'jsk');
        assert.equal(r.ok, true);
        assert.equal(r.skippedAll, true);
        assert.ok(r.skipReasons.some((s) => /handloom/i.test(s)));
        assert.ok(r.skipReasons.every((s) => s.startsWith('SKIPPED')));
    });

    it('Handloom runs required Handloom-only print suite metadata', () => {
        const printChecks = UNIT_TEST_CHECKS.filter((c) => c.bundle === 'print');
        assert.ok(printChecks.every((c) => c.products.includes('handloom') && c.required));
        assert.equal(isCheckApplicable(['handloom'], 'handloom'), true);
    });

    it('shared module suite still runs for JSK (not skip-all)', () => {
        const shared = UNIT_TEST_CHECKS.find((x) => x.id === 'module-state-decision');
        assert.equal(shared.required, true);
        assert.ok(shared.products.includes('jsk'));
        const moduleRun = runApplicableUnitBundle('module', 'jsk');
        assert.equal(moduleRun.skippedAll, false);
        assert.ok(moduleRun.ranFiles.includes('test/moduleStateDecision.test.js'));
    });

    it('shared module-state decision remains required for both products', () => {
        const c = UNIT_TEST_CHECKS.find((x) => x.id === 'module-state-decision');
        assert.deepEqual(c.products, ['handloom', 'jsk']);
        assert.equal(c.required, true);
    });

    it('locked-forms / golden / release-check scripts are Handloom-only', () => {
        for (const id of ['locked-forms-script', 'golden-regression-script', 'release-check-script']) {
            const s = SCRIPT_CHECKS.find((x) => x.id === id);
            assert.deepEqual(s.products, ['handloom']);
            assert.equal(isCheckApplicable(s.products, 'jsk'), false);
        }
        const runner = SCRIPT_CHECKS.find((x) => x.id === 'regression-runner');
        assert.ok(runner.products.includes('jsk'));
    });

    it('JSK database jsk-esarthi-ui-dev PASSes; handloom_crm is WRONG_DATABASE', () => {
        const ok = evaluateProductDatabase('jsk', 'jsk-esarthi-ui-dev');
        assert.equal(ok.ok, true);
        assert.equal(ok.code, null);
        const bad = evaluateProductDatabase('jsk', 'handloom_crm');
        assert.equal(bad.ok, false);
        assert.equal(bad.code, 'WRONG_DATABASE');
        const hlOk = evaluateProductDatabase('handloom', 'handloom_crm');
        assert.equal(hlOk.ok, true);
        const hlBad = evaluateProductDatabase('handloom', 'jsk-esarthi-ui-dev');
        assert.equal(hlBad.code, 'WRONG_DATABASE');
    });

    it('PRODUCTS database expectations stay product-specific', () => {
        assert.equal(PRODUCTS.handloom.databaseName, 'handloom_crm');
        assert.equal(PRODUCTS.jsk.databaseName, 'jsk-esarthi-ui-dev');
        assert.notEqual(PRODUCTS.handloom.databaseName, PRODUCTS.jsk.databaseName);
    });

    it('suite file exists for productContext helper', () => {
        assert.ok(__dirname.includes('regression'));
    });
});
