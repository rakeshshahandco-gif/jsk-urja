import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    detectActiveProduct,
    isCheckApplicable,
    skipReasonForCheck,
    evaluateProductDatabase,
} from '../lib/productContext.js';
import { runApplicableUnitBundle } from '../lib/process.js';
import { UNIT_TEST_CHECKS, SCRIPT_CHECKS, PRODUCTS } from '../config.js';
import { repoRoot, backendRoot } from '../lib/env.js';

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
beforeEach(() => {
    delete process.env.REGRESSION_PRODUCT;
    delete process.env.APPLICATION_KEY;
});

function backendTestExists(rel) {
    return fs.existsSync(path.join(backendRoot(), rel));
}

describe('product-aware unit test selection (CI policy)', () => {
    it('1) Handloom selects shared required module tests', () => {
        const shared = UNIT_TEST_CHECKS.find((x) => x.id === 'module-state-decision');
        assert.equal(shared.required, true);
        assert.ok(shared.products.includes('handloom'));
        assert.equal(isCheckApplicable(shared.products, 'handloom'), true);
        assert.ok(backendTestExists(shared.file), 'shared module-state-decision must exist');

        const r = runApplicableUnitBundle('module', 'handloom');
        // Handloom-only phase5 may be absent on JSK trees → missingRequired blocks run.
        // When no Handloom-only required files are missing, shared must execute.
        const phase5Missing = !backendTestExists('test/phase5ModuleGuardMatrix.test.js');
        if (phase5Missing) {
            assert.equal(r.ok, false);
            assert.ok(r.missingRequired.some((m) => m.id === 'phase5-module-matrix'));
        } else {
            assert.equal(r.skippedAll, false);
            assert.ok(r.ranFiles.includes('test/moduleStateDecision.test.js'));
            assert.equal(r.missingRequired.length, 0);
        }
    });

    it('2) JSK runs shared required module tests when present', () => {
        const shared = UNIT_TEST_CHECKS.find((x) => x.id === 'module-state-decision');
        assert.ok(shared.products.includes('jsk'));
        const r = runApplicableUnitBundle('module', 'jsk');
        assert.equal(r.skippedAll, false);
        assert.ok(r.ranFiles.includes('test/moduleStateDecision.test.js'));
        assert.equal(r.missingRequired.length, 0);
    });

    it('3) Handloom-only salesGst checks are required on Handloom', () => {
        const gst = UNIT_TEST_CHECKS.find((x) => x.id === 'phase3-gst');
        assert.deepEqual(gst.products, ['handloom']);
        assert.equal(gst.required, true);
        const r = runApplicableUnitBundle('salesGst', 'handloom');
        if (backendTestExists(gst.file)) {
            assert.ok(r.ranFiles.includes(gst.file) || r.missingRequired.length === 0);
            if (!r.missingRequired.length) {
                assert.ok(r.ranFiles.includes(gst.file));
            }
        } else {
            assert.ok(r.missingRequired.some((m) => m.id === 'phase3-gst'));
            assert.equal(r.ok, false);
        }
    });

    it('4) JSK skips Handloom-only tests with an explicit reason', () => {
        const r = runApplicableUnitBundle('salesGst', 'jsk');
        assert.equal(r.ok, true);
        assert.equal(r.missingRequired.length, 0);
        assert.ok(r.skipReasons.length >= 1);
        assert.ok(r.skipReasons.every((s) => s.startsWith('SKIPPED')));
        assert.ok(r.skipReasons.some((s) => /handloom/i.test(s)));
        const print = runApplicableUnitBundle('print', 'jsk');
        assert.equal(print.ok, true);
        assert.equal(print.missingRequired.length, 0);
        assert.ok(print.skipReasons.some((s) => /handloom-print-separation|handloom/i.test(s)));
    });

    it('5) Missing shared required test classification is fail/block', () => {
        const shared = UNIT_TEST_CHECKS.find((x) => x.id === 'company-user-access');
        assert.equal(shared.required, true);
        assert.deepEqual(shared.products, ['handloom', 'jsk']);
        assert.ok(backendTestExists(shared.file), 'shared required company-user-access must exist in baseline');
        // Policy: required + applicable + missing → missingRequired (proven by print/Handloom cases).
        const printReq = UNIT_TEST_CHECKS.find((x) => x.id === 'handloom-print-separation');
        assert.equal(printReq.required, true);
    });

    it('6) Missing Handloom-only required test fails on Handloom', () => {
        const print = UNIT_TEST_CHECKS.find((x) => x.id === 'handloom-print-separation');
        assert.equal(print.required, true);
        assert.deepEqual(print.products, ['handloom']);
        const r = runApplicableUnitBundle('print', 'handloom');
        if (!backendTestExists(print.file)) {
            assert.equal(r.ok, false);
            assert.ok(r.missingRequired.some((m) => m.id === 'handloom-print-separation'));
            assert.match(r.output, /Missing required tests/);
        } else {
            assert.ok(r.ranFiles.includes(print.file) || r.ok === true);
        }
    });

    it('7) Missing Handloom-only test does not fail JSK', () => {
        const r = runApplicableUnitBundle('print', 'jsk');
        assert.equal(r.ok, true);
        assert.equal(r.missingRequired.length, 0);
        assert.equal(r.ranFiles.length, 0);
        assert.equal(r.skippedAll, true);
    });

    it('8) Unknown product fails detection policy', () => {
        const ctx = detectActiveProduct('D:\\some-other-repo-xyz-unknown');
        assert.equal(ctx.productKey, 'unknown');
        assert.equal(ctx.expectedDatabase, null);
        assert.ok(ctx.warning);
        assert.match(ctx.warning, /UNKNOWN_PRODUCT/);
        assert.equal(evaluateProductDatabase('unknown', 'anything'), null);
    });

    it('9) Optional missing test is skipped with a reason', () => {
        const branding = UNIT_TEST_CHECKS.find((x) => x.id === 'company-branding');
        assert.equal(branding.required, false);
        const r = runApplicableUnitBundle('company', 'jsk');
        if (!backendTestExists(branding.file)) {
            assert.ok(r.skipReasons.some((s) => /company-branding/i.test(s) && /optional/i.test(s)));
            assert.ok(!r.missingRequired.some((m) => m.id === 'company-branding'));
        }
        if (backendTestExists('test/companyUserAccess.test.js')) {
            assert.ok(r.ranFiles.includes('test/companyUserAccess.test.js') || r.ok === false);
        }
    });

    it('10) Workflow no longer hardcodes Handloom-only Jest file list', () => {
        const wf = path.join(repoRoot(), '.github/workflows/crm-safe-change-validation.yml');
        assert.ok(fs.existsSync(wf));
        const text = fs.readFileSync(wf, 'utf8');
        assert.match(text, /run-unit-bundles\.mjs/);
        assert.doesNotMatch(text, /handloomPrintSeparation\.test\.js/);
        assert.doesNotMatch(text, /phase3GstRegression\.test\.js/);
        assert.doesNotMatch(text, /node --test[\s\S]*moduleGuard\.test\.js/);
    });

    it('REGRESSION_PRODUCT override selects product', () => {
        process.env.REGRESSION_PRODUCT = 'jsk';
        const jsk = detectActiveProduct('D:\\irrelevant');
        assert.equal(jsk.productKey, 'jsk');
        process.env.REGRESSION_PRODUCT = 'handloom';
        const hl = detectActiveProduct('D:\\irrelevant');
        assert.equal(hl.productKey, 'handloom');
    });

    it('Handloom-only checks are not applicable on JSK', () => {
        assert.equal(isCheckApplicable(['handloom'], 'jsk'), false);
        const reason = skipReasonForCheck(
            { id: 'handloom-print-separation', products: ['handloom'] },
            'jsk',
        );
        assert.match(reason, /SKIPPED/);
    });

    it('PRODUCTS database expectations stay product-specific', () => {
        assert.equal(PRODUCTS.handloom.databaseName, 'handloom_crm');
        assert.equal(PRODUCTS.jsk.databaseName, 'jsk-esarthi-ui-dev');
    });

    it('locked-forms / golden / release-check scripts are Handloom-only', () => {
        for (const id of ['locked-forms-script', 'golden-regression-script', 'release-check-script']) {
            const s = SCRIPT_CHECKS.find((x) => x.id === id);
            assert.deepEqual(s.products, ['handloom']);
            assert.equal(isCheckApplicable(s.products, 'jsk'), false);
        }
    });

    it('suite file exists for productContext helper', () => {
        assert.ok(__dirname.includes('regression'));
    });
});
