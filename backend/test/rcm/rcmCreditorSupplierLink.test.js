/**
 * Sync Master / creditor supplier link tests (no posting).
 * Run: node --test backend/test/rcm/rcmCreditorSupplierLink.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Creditor Sync Master / GSTIN UI source', () => {
    it('ensure-for-ledger links by ledgerId and rejects name-only sync in LedgerForm', () => {
        const ctrl = fs.readFileSync(
            path.join(__dirname, '../../src/controllers/supplier.controller.js'),
            'utf8',
        );
        assert.match(ctrl, /ensureSupplierForLedger/);
        assert.match(ctrl, /getSuppliersByLedgerId/);
        assert.match(ctrl, /ledgerId/);
        assert.match(ctrl, /ambiguous/);
        assert.doesNotMatch(ctrl, /Never match by name only[\s\S]{0,40}supplierName\.toLowerCase/);

        const form = fs.readFileSync(
            path.join(__dirname, '../../../src/features/accounts/components/LedgerForm.jsx'),
            'utf8',
        );
        assert.match(form, /ensureSupplierForLedger/);
        assert.match(form, /getSuppliersByLedgerId/);
        assert.match(form, /CreditorSupplierTaxProfilePanel/);
        assert.match(form, /Hidden for Unregistered/);
        assert.doesNotMatch(form, /supplierName\.toLowerCase\(\)\.trim\(\) === form\.name/);

        const panel = fs.readFileSync(
            path.join(__dirname, '../../../src/features/accounts/components/CreditorSupplierTaxProfilePanel.jsx'),
            'utf8',
        );
        assert.match(panel, /Default RCM Treatment/);
        assert.match(panel, /Default RCM Categories/);
        assert.match(panel, /Rent \/ Property Profile/);
        assert.match(panel, /Transport \/ GTA Profile/);
        assert.match(panel, /Hidden — not required/);
    });

    it('routes register by-ledger and ensure-for-ledger before :id', () => {
        const routes = fs.readFileSync(
            path.join(__dirname, '../../src/routes/v1/supplier.routes.js'),
            'utf8',
        );
        const byLedger = routes.indexOf("'/by-ledger/:ledgerId'");
        const ensure = routes.indexOf("'/ensure-for-ledger'");
        const idRoute = routes.indexOf("'/:'");
        assert.ok(byLedger > 0 && ensure > 0);
        assert.ok(byLedger < idRoute || idRoute < 0 || routes.indexOf("router.route('/:id')") > byLedger);
    });
});

describe('Transport mapping non-GTA', () => {
    it('courier and local transport do not map to GTA service type', async () => {
        const {
            mapTransportSupplierTypeToServiceType,
        } = await import('../../src/config/rcmCanonicalEnums.js');
        assert.equal(mapTransportSupplierTypeToServiceType('Courier Agency'), 'Courier');
        assert.equal(
            mapTransportSupplierTypeToServiceType('Local Transporter — No Consignment Note'),
            'Local Transport',
        );
        assert.notEqual(mapTransportSupplierTypeToServiceType('Courier Agency'), 'GTA');
        assert.notEqual(
            mapTransportSupplierTypeToServiceType('Local Transporter — No Consignment Note'),
            'GTA with consignment note',
        );
    });
});
