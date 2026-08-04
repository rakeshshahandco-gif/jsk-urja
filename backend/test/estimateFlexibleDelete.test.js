/**
 * Estimate-only flexible delete — focused contract tests (no DB posting).
 * Run: node --test backend/test/estimateFlexibleDelete.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controllerPath = path.join(__dirname, '../src/controllers/salesInvoice.controller.js');
const registryPath = path.join(__dirname, '../src/config/permissionRegistry.js');
const numberingPath = path.join(__dirname, '../src/utils/numberingUtils.js');

describe('Estimate flexible delete — helpers', () => {
    it('isVerifiedEstimateSeries only accepts series flags', async () => {
        const { isVerifiedEstimateSeries } = await import('../src/controllers/salesInvoice.controller.js');
        assert.equal(isVerifiedEstimateSeries(null), false);
        assert.equal(isVerifiedEstimateSeries({}), false);
        assert.equal(isVerifiedEstimateSeries({ seriesName: 'Estimate' }), false);
        assert.equal(isVerifiedEstimateSeries({ isEstimate: true }), true);
        assert.equal(isVerifiedEstimateSeries({ documentType: 'Estimate' }), true);
        assert.equal(isVerifiedEstimateSeries({ isEstimate: false, documentType: 'Tax Invoice' }), false);
    });

    it('assertSalesInvoiceAdminAction uses internal_sales.delete for Estimate', async () => {
        const { assertSalesInvoiceAdminAction } = await import('../src/controllers/salesInvoice.controller.js');
        const user = { role: { name: 'salesuser' }, permissions: [] };
        await assert.rejects(
            async () => assertSalesInvoiceAdminAction(user, 'delete', { isEstimate: true }),
            (err) => {
                assert.match(String(err.message || err), /sales\.internal_sales\.delete/);
                assert.equal(err.statusCode || err.status, 403);
                return true;
            },
        );
        await assert.rejects(
            async () => assertSalesInvoiceAdminAction(user, 'delete', { isEstimate: false }),
            (err) => {
                assert.match(String(err.message || err), /sales\.sales_invoices\.delete/);
                return true;
            },
        );
        // Admin bypass
        assert.doesNotThrow(() => assertSalesInvoiceAdminAction({ role: { name: 'admin' } }, 'delete', { isEstimate: true }));
        assert.doesNotThrow(() => assertSalesInvoiceAdminAction({ roleName: 'superadmin' }, 'delete', { isEstimate: false }));
    });
});

describe('Estimate flexible delete — source contracts', () => {
    const src = fs.readFileSync(controllerPath, 'utf8');
    const registry = fs.readFileSync(registryPath, 'utf8');
    const numbering = fs.readFileSync(numberingPath, 'utf8');

    it('skips latest-number check only for verified Estimate series', () => {
        assert.match(src, /isVerifiedEstimateSeries/);
        assert.match(src, /if \(inv\.seriesId && !isEstimateDoc\)/);
        assert.match(src, /Only the latest invoice in the series can be deleted/);
        assert.match(src, /sales\.internal_sales\.delete/);
        assert.match(src, /Later Estimate numbers remain unchanged/);
        assert.match(src, /laterNumberGapAllowed:\s*true/);
        assert.doesNotMatch(src, /if \(industry\s*===/);
    });

    it('permission registry exposes Estimate Delete under internal_sales', () => {
        assert.match(registry, /id:\s*'internal_sales'/);
        assert.match(registry, /Estimate Delete/);
    });

    it('does not alter numberingUtils globally for this phase', () => {
        assert.match(numbering, /getNextNumberFromSeries/);
        assert.match(numbering, /getLatestSequenceNumber/);
        // Soft-deleted excluded from max (gap-safe middle delete → next = max surviving + 1)
        assert.match(numbering, /isDeleted:\s*\{\s*\$ne:\s*true\s*\}/);
    });
});
