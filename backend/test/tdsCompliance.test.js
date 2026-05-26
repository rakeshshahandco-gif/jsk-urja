import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTdsDecision } from '../src/services/tdsDecisionEngine.service.js';
import { resolveLowerDeductionRate, listActiveLowerDeductionCertificates } from '../src/utils/tdsLowerDeduction.util.js';
import { isValidPan, normalizePan } from '../src/constants/tds.constants.js';

const master194J = {
    sectionCode: '194J',
    thresholdAmount: 30000,
    singleBillThreshold: 30000,
    thresholdCalculationMethod: 'Both',
    rateIndividualHuf: 10,
    rateOthers: 10,
    autoDeductTds: true,
    panMissingRate: 20,
};

const ledger194J = {
    tdsApplicable: true,
    tdsSection: '194J',
    tdsRateSource: 'auto',
    effectiveDeducteeConstitution: 'Individual',
    tdsPanAssumedAvailable: true,
    tdsPanStatus: 'Valid',
};

describe('tdsCompliance.computeTdsDecision', () => {
    it('194J no TDS until FY aggregate exceeds threshold', () => {
        const d1 = computeTdsDecision({
            ledger: ledger194J,
            master: master194J,
            cumulativeBefore: 0,
            currentBase: 20000,
            supplierPan: 'ABCDE1234F',
            settings: {},
        });
        assert.equal(d1.tdsApplicable, false);

        const d2 = computeTdsDecision({
            ledger: ledger194J,
            master: master194J,
            cumulativeBefore: 20000,
            currentBase: 10000,
            supplierPan: 'ABCDE1234F',
            settings: {},
        });
        assert.equal(d2.tdsApplicable, false);
    });

    it('194J ExcessOnly TDS on excess above threshold', () => {
        const master = { ...master194J, thresholdDeductMode: 'ExcessOnly' };
        const d3 = computeTdsDecision({
            ledger: ledger194J,
            master,
            cumulativeBefore: 30000,
            currentBase: 15000,
            supplierPan: 'ABCDE1234F',
            settings: {},
        });
        assert.equal(d3.tdsApplicable, true);
        assert.equal(d3.taxableAmount, 15000);
        assert.equal(d3.tdsAmount, 1500);
    });

    it('194J FullAfterCrossing catch-up on cumulative base', () => {
        const master = { ...master194J, thresholdDeductMode: 'FullAfterCrossing' };
        const d3 = computeTdsDecision({
            ledger: ledger194J,
            master,
            cumulativeBefore: 20000,
            currentBase: 25000,
            supplierPan: 'ABCDE1234F',
            settings: {},
            cumulativeTdsDeductedBefore: 0,
        });
        assert.equal(d3.tdsApplicable, true);
        assert.equal(d3.taxableAmount, 45000);
        assert.equal(d3.tdsAmount, 4500);
    });

    it('194C single bill threshold triggers TDS', () => {
        const master = {
            sectionCode: '194C',
            thresholdAmount: 100000,
            singleBillThreshold: 30000,
            thresholdCalculationMethod: 'Both',
            rateOthers: 2,
            autoDeductTds: true,
        };
        const ledger = {
            ...ledger194J,
            tdsSection: '194C',
            effectiveDeducteeConstitution: 'Private Limited Company',
        };
        const d = computeTdsDecision({
            ledger,
            master,
            cumulativeBefore: 0,
            currentBase: 50000,
            supplierPan: 'ABCDE1234F',
            settings: {},
        });
        assert.equal(d.tdsApplicable, true);
        assert.equal(d.tdsAmount, 1000);
    });

    it('no PAN applies 206AA higher rate', () => {
        const d = computeTdsDecision({
            ledger: { ...ledger194J, tdsPanAssumedAvailable: false },
            master: master194J,
            cumulativeBefore: 30000,
            currentBase: 20000,
            supplierPan: '',
            settings: { panAbsentRate: 20 },
        });
        assert.equal(d.tdsApplicable, true);
        assert.equal(d.tdsRate, 20);
    });

    it('invalid PAN format', () => {
        assert.equal(isValidPan(normalizePan('INVALID')), false);
    });
});

describe('tdsCompliance.lowerDeduction', () => {
    it('uses certificate rate when valid', () => {
        const rate = resolveLowerDeductionRate({
            section: '194J',
            paymentDate: new Date('2026-06-15'),
            certificates: [
                {
                    section: '194J',
                    rate: 2,
                    validFrom: new Date('2026-04-01'),
                    validTo: new Date('2027-03-31'),
                    active: true,
                },
            ],
            legacyPercent: 0,
        });
        assert.equal(rate, 2);
    });

    it('reverts after certificate expiry', () => {
        const rate = resolveLowerDeductionRate({
            section: '194J',
            paymentDate: new Date('2028-01-01'),
            certificates: [
                {
                    section: '194J',
                    rate: 2,
                    validFrom: new Date('2026-04-01'),
                    validTo: new Date('2027-03-31'),
                    active: true,
                },
            ],
            legacyPercent: 0,
        });
        assert.equal(rate, null);
    });

    it('lists active certificates only', () => {
        const active = listActiveLowerDeductionCertificates(
            [
                { section: '194C', rate: 1, validFrom: new Date('2026-04-01'), validTo: new Date('2027-03-31'), active: true },
                { section: '194J', rate: 2, validFrom: new Date('2020-01-01'), validTo: new Date('2021-01-01'), active: true },
            ],
            new Date('2026-08-01'),
        );
        assert.equal(active.length, 1);
    });
});
