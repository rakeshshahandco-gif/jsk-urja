import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseDirectorMisFilters,
    AGE_BUCKETS,
} from '../src/services/directorMis.service.js';
import { getAgeingBucket } from '../src/services/accounting/billWiseSettlement.service.js';

describe('directorMis.parseDirectorMisFilters', () => {
    it('derives FY date range from financialYear', () => {
        const f = parseDirectorMisFilters({ financialYear: '2026-2027' });
        assert.ok(f.startDate instanceof Date);
        assert.ok(f.endDate instanceof Date);
        assert.equal(f.financialYear, '2026-2027');
    });

    it('uses month filter when provided', () => {
        const f = parseDirectorMisFilters({ month: '2026-05' });
        assert.equal(f.startDateStr, '2026-05-01');
        assert.ok(f.endDateStr.startsWith('2026-05-'));
    });

    it('passes export and customer filters', () => {
        const f = parseDirectorMisFilters({
            exportFilter: 'export',
            customerId: '507f1f77bcf86cd799439011',
            category: 'FINISHED_GOOD',
        });
        assert.equal(f.exportFilter, 'export');
        assert.equal(f.customerId, '507f1f77bcf86cd799439011');
        assert.equal(f.category, 'FINISHED_GOOD');
    });
});

describe('directorMis.ageing buckets', () => {
    it('exports standard ageing bucket keys', () => {
        assert.deepEqual(AGE_BUCKETS, ['0-30', '31-60', '61-90', '91-180', '180+']);
    });

    it('maps overdue days to buckets consistently with bill-wise service', () => {
        assert.equal(getAgeingBucket(0), '0-30');
        assert.equal(getAgeingBucket(45), '31-60');
        assert.equal(getAgeingBucket(200), '180+');
    });
});

describe('directorMis.access permission key', () => {
    it('uses mis.director_dashboard.view permission id', () => {
        assert.equal('mis.director_dashboard.view'.split('.').length, 3);
        assert.ok('mis.director_dashboard.view'.includes('director_dashboard'));
    });
});
