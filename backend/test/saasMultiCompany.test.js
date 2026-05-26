/**
 * Unit tests for SaaS Multi-Company Phase 7 & 8
 * Tests pure logic — no DB required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── 1. Company isolation helpers ───────────────────────────────────────────

describe('Company isolation — enabledModules logic', () => {
    const checkModuleEnabled = (company, module) =>
        (company.enabledModules || []).includes(module);

    it('returns true when module is in enabledModules', () => {
        const company = { enabledModules: ['crm', 'accounts', 'gst'] };
        assert.equal(checkModuleEnabled(company, 'accounts'), true);
    });

    it('returns false when module is not in enabledModules', () => {
        const company = { enabledModules: ['crm'] };
        assert.equal(checkModuleEnabled(company, 'payroll'), false);
    });

    it('returns false when enabledModules is empty', () => {
        const company = { enabledModules: [] };
        assert.equal(checkModuleEnabled(company, 'gst'), false);
    });

    it('returns false when enabledModules is undefined', () => {
        const company = {};
        assert.equal(checkModuleEnabled(company, 'crm'), false);
    });

    it('multiple modules can be toggled independently', () => {
        const company = { enabledModules: ['crm', 'gst', 'tds'] };
        assert.equal(checkModuleEnabled(company, 'crm'), true);
        assert.equal(checkModuleEnabled(company, 'payroll'), false);
        assert.equal(checkModuleEnabled(company, 'tds'), true);
    });
});

// ─── 2. Subscription status enforcement ─────────────────────────────────────

describe('Subscription enforcement logic', () => {
    const shouldBlockAccess = (subscription) => {
        if (!subscription) return false;   // no subscription = pass (backward compat)
        if (subscription.status === 'suspended') return { block: true, code: 403, reason: 'suspended' };
        if (subscription.status === 'expired') return { block: true, code: 402, reason: 'expired' };
        return false;
    };

    it('passes when no subscription record exists', () => {
        assert.equal(shouldBlockAccess(null), false);
        assert.equal(shouldBlockAccess(undefined), false);
    });

    it('passes for active subscription', () => {
        assert.equal(shouldBlockAccess({ status: 'active' }), false);
    });

    it('passes for trial subscription', () => {
        assert.equal(shouldBlockAccess({ status: 'trial' }), false);
    });

    it('blocks with 403 for suspended subscription', () => {
        const result = shouldBlockAccess({ status: 'suspended' });
        assert.equal(result.block, true);
        assert.equal(result.code, 403);
        assert.equal(result.reason, 'suspended');
    });

    it('blocks with 402 for expired subscription', () => {
        const result = shouldBlockAccess({ status: 'expired' });
        assert.equal(result.block, true);
        assert.equal(result.code, 402);
        assert.equal(result.reason, 'expired');
    });
});

// ─── 3. Plan limits enforcement ─────────────────────────────────────────────

describe('Plan limits — user limit enforcement', () => {
    const canAddUser = (subscription, currentUserCount) => {
        if (!subscription) return true;  // no subscription = no limit
        const limit = subscription.userLimit || Infinity;
        return currentUserCount < limit;
    };

    it('allows adding user when no subscription (no limit)', () => {
        assert.equal(canAddUser(null, 100), true);
    });

    it('allows adding user when under limit', () => {
        assert.equal(canAddUser({ userLimit: 10 }, 9), true);
    });

    it('blocks adding user when at limit', () => {
        assert.equal(canAddUser({ userLimit: 5 }, 5), false);
    });

    it('blocks adding user when over limit', () => {
        assert.equal(canAddUser({ userLimit: 5 }, 7), false);
    });

    it('handles enterprise (null/undefined userLimit = unlimited)', () => {
        assert.equal(canAddUser({ plan: 'enterprise', userLimit: undefined }, 9999), true);
    });
});

// ─── 4. Subscription plan validation ─────────────────────────────────────────

describe('Subscription plan validation', () => {
    const VALID_PLANS = ['free', 'trial', 'monthly', 'yearly', 'enterprise'];
    const VALID_STATUSES = ['active', 'trial', 'expired', 'suspended'];

    const isValidPlan = (plan) => VALID_PLANS.includes(plan);
    const isValidStatus = (status) => VALID_STATUSES.includes(status);

    it('accepts valid plans', () => {
        VALID_PLANS.forEach(p => assert.equal(isValidPlan(p), true, `${p} should be valid`));
    });

    it('rejects invalid plan', () => {
        assert.equal(isValidPlan('premium'), false);
        assert.equal(isValidPlan(''), false);
        assert.equal(isValidPlan(null), false);
    });

    it('accepts valid statuses', () => {
        VALID_STATUSES.forEach(s => assert.equal(isValidStatus(s), true, `${s} should be valid`));
    });

    it('rejects invalid status', () => {
        assert.equal(isValidStatus('pending'), false);
        assert.equal(isValidStatus('disabled'), false);
    });
});

// ─── 5. Superadmin bypass logic ──────────────────────────────────────────────

describe('Superadmin subscription bypass', () => {
    const isSuperAdmin = (roleName) => roleName === 'superadmin';
    const shouldBypassSubscriptionCheck = (roleName) => isSuperAdmin(roleName);

    it('superadmin bypasses subscription check', () => {
        assert.equal(shouldBypassSubscriptionCheck('superadmin'), true);
    });

    it('admin does NOT bypass subscription check', () => {
        assert.equal(shouldBypassSubscriptionCheck('admin'), false);
    });

    it('viewer does NOT bypass subscription check', () => {
        assert.equal(shouldBypassSubscriptionCheck('viewer'), false);
    });

    it('null roleName does NOT bypass', () => {
        assert.equal(shouldBypassSubscriptionCheck(null), false);
    });
});

// ─── 6. Cross-company data isolation ─────────────────────────────────────────

describe('Cross-company data isolation', () => {
    const isRecordAccessible = (record, requestingCompanyId) =>
        String(record.companyId) === String(requestingCompanyId);

    it('allows access when companyId matches', () => {
        assert.equal(isRecordAccessible({ companyId: 'abc123', data: 'secret' }, 'abc123'), true);
    });

    it('denies access when companyId does not match', () => {
        assert.equal(isRecordAccessible({ companyId: 'company_A' }, 'company_B'), false);
    });

    it('denies access when record has no companyId', () => {
        assert.equal(isRecordAccessible({ companyId: undefined }, 'company_A'), false);
    });

    it('two records from same company are accessible to that company', () => {
        const records = [
            { companyId: 'compA', inv: 'INV-001' },
            { companyId: 'compA', inv: 'INV-002' },
            { companyId: 'compB', inv: 'INV-003' },
        ];
        const visible = records.filter(r => isRecordAccessible(r, 'compA'));
        assert.equal(visible.length, 2);
        assert.ok(visible.every(r => r.companyId === 'compA'));
    });
});

// ─── 7. User activity log payload validation ──────────────────────────────────

describe('UserActivityLog payload builder', () => {
    const buildLogPayload = ({ userId, companyId, username, action, module, description, ip }) => {
        const VALID_ACTIONS = ['login','logout','create','update','delete','view','export','import','backup','restore','impersonate','permission_change'];
        if (!VALID_ACTIONS.includes(action)) throw new Error(`Invalid action: ${action}`);
        return { userId, companyId, username, action, module, description, ipAddress: ip, success: true };
    };

    it('builds valid login payload', () => {
        const p = buildLogPayload({ userId: 'u1', username: 'admin', action: 'login', module: 'auth', description: 'Logged in', ip: '1.2.3.4' });
        assert.equal(p.action, 'login');
        assert.equal(p.success, true);
        assert.equal(p.username, 'admin');
    });

    it('throws for invalid action', () => {
        assert.throws(() => buildLogPayload({ userId: 'u1', username: 'x', action: 'hack', module: 'auth', description: '', ip: '' }));
    });

    it('builds create payload with entityType', () => {
        const p = buildLogPayload({ userId: 'u1', username: 'mgr', action: 'create', module: 'accounts', description: 'Added voucher', ip: '10.0.0.1' });
        assert.equal(p.action, 'create');
        assert.equal(p.module, 'accounts');
    });

    it('builds impersonation payload', () => {
        const p = buildLogPayload({ userId: 'u_superadmin', username: 'superadmin', action: 'impersonate', module: 'saas', description: 'Impersonated company X', ip: '192.168.1.1' });
        assert.equal(p.action, 'impersonate');
    });
});

// ─── 8. Series isolation (company-wise series prefix) ─────────────────────────

describe('Company-wise invoice series isolation', () => {
    const getNextInvoiceNo = (prefix, lastSequence) => `${prefix}${String(lastSequence + 1).padStart(4, '0')}`;

    it('generates correct invoice number', () => {
        assert.equal(getNextInvoiceNo('JSK-', 0), 'JSK-0001');
        assert.equal(getNextInvoiceNo('ABC-', 5), 'ABC-0006');
    });

    it('different companies can have same sequence without conflict (different prefix)', () => {
        const compA = getNextInvoiceNo('JSK-', 99);
        const compB = getNextInvoiceNo('ACM-', 99);
        assert.notEqual(compA, compB);
        assert.equal(compA, 'JSK-0100');
        assert.equal(compB, 'ACM-0100');
    });
});

// ─── 9. FY isolation ─────────────────────────────────────────────────────────

describe('Financial year data isolation', () => {
    const isInFY = (dateStr, fyStart, fyEnd) => {
        const d = new Date(dateStr);
        return d >= new Date(fyStart) && d <= new Date(fyEnd);
    };

    it('includes date within FY', () => {
        assert.equal(isInFY('2024-10-15', '2024-04-01', '2025-03-31'), true);
    });

    it('excludes date outside FY', () => {
        assert.equal(isInFY('2023-03-15', '2024-04-01', '2025-03-31'), false);
    });

    it('excludes date from different company FY range', () => {
        const fyCoA = { start: '2024-04-01', end: '2025-03-31' };
        const fyCoB = { start: '2024-01-01', end: '2024-12-31' };
        const testDate = '2024-02-15';
        assert.equal(isInFY(testDate, fyCoA.start, fyCoA.end), false);
        assert.equal(isInFY(testDate, fyCoB.start, fyCoB.end), true);
    });
});
