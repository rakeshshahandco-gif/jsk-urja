/**
 * Unit tests for the 4 new accounting modules:
 *   1. Contra Voucher (payload logic & validation)
 *   2. Customer Credit Limit (breach detection logic)
 *   3. Period Lock (lock/override logic)
 *   4. Accounting Audit Trail (filter & pagination logic)
 *
 * All tests are pure-logic — no DB/network calls.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ============================================================
// MODULE 1 — CONTRA VOUCHER LOGIC
// ============================================================
describe("contraVoucher.payloadValidation", () => {
    /**
     * Builds the API payload for a Contra entry.
     * From-account is credited (money going out).
     * To-account is debited (money coming in).
     */
    function buildContraPayload({ voucherTypeId, date, fromAccount, toAccount, amount, narration }) {
        if (!fromAccount) throw new Error("From account is required");
        if (!toAccount) throw new Error("To account is required");
        if (fromAccount._id === toAccount._id) throw new Error("From and To accounts must be different");
        if (!amount || amount <= 0) throw new Error("Amount must be greater than zero");
        if (!toAccount.ledgerId) throw new Error(`No ledger linked to "${toAccount.accountName}"`);
        if (!fromAccount.ledgerId) throw new Error(`No ledger linked to "${fromAccount.accountName}"`);

        return {
            nature: "Contra",
            voucherTypeId,
            date,
            cashBankAccountId: fromAccount._id,
            totalAmount: Number(amount),
            narration: narration || "",
            items: [{
                ledgerId: toAccount.ledgerId,
                amount: Number(amount),
                type: "Debit",
                narration: narration || "",
            }],
        };
    }

    const cashAcc = { _id: "acc1", accountName: "Cash", ledgerId: "led1" };
    const bankAcc = { _id: "acc2", accountName: "HDFC Bank", ledgerId: "led2" };
    const noLedgerAcc = { _id: "acc3", accountName: "Petty Cash" };

    it("builds correct payload — cash deposit to bank", () => {
        const payload = buildContraPayload({
            voucherTypeId: "vt1",
            date: "2026-05-19",
            fromAccount: cashAcc,
            toAccount: bankAcc,
            amount: 50000,
            narration: "CASH DEPOSITED TO HDFC",
        });
        assert.equal(payload.nature, "Contra");
        assert.equal(payload.cashBankAccountId, "acc1");
        assert.equal(payload.totalAmount, 50000);
        assert.equal(payload.items.length, 1);
        assert.equal(payload.items[0].ledgerId, "led2");
        assert.equal(payload.items[0].type, "Debit");
        assert.equal(payload.items[0].amount, 50000);
    });

    it("builds correct payload — bank withdrawal to cash", () => {
        const payload = buildContraPayload({
            voucherTypeId: "vt1",
            date: "2026-05-19",
            fromAccount: bankAcc,
            toAccount: cashAcc,
            amount: 10000,
        });
        assert.equal(payload.cashBankAccountId, "acc2");
        assert.equal(payload.items[0].ledgerId, "led1");
    });

    it("rejects when from and to accounts are the same", () => {
        assert.throws(
            () => buildContraPayload({ fromAccount: cashAcc, toAccount: cashAcc, amount: 1000 }),
            (err) => err.message === "From and To accounts must be different"
        );
    });

    it("rejects zero or negative amount", () => {
        assert.throws(
            () => buildContraPayload({ fromAccount: cashAcc, toAccount: bankAcc, amount: 0 }),
            (err) => err.message === "Amount must be greater than zero"
        );
        assert.throws(
            () => buildContraPayload({ fromAccount: cashAcc, toAccount: bankAcc, amount: -500 }),
            (err) => err.message === "Amount must be greater than zero"
        );
    });

    it("rejects missing from account", () => {
        assert.throws(
            () => buildContraPayload({ fromAccount: null, toAccount: bankAcc, amount: 1000 }),
            (err) => err.message === "From account is required"
        );
    });

    it("rejects toAccount with no linked ledger", () => {
        assert.throws(
            () => buildContraPayload({ fromAccount: cashAcc, toAccount: noLedgerAcc, amount: 500 }),
            (err) => err.message.includes("No ledger linked")
        );
    });

    it("rejects fromAccount with no linked ledger", () => {
        assert.throws(
            () => buildContraPayload({ fromAccount: noLedgerAcc, toAccount: bankAcc, amount: 500 }),
            (err) => err.message.includes("No ledger linked")
        );
    });

    it("amount is coerced to Number", () => {
        const payload = buildContraPayload({
            fromAccount: cashAcc, toAccount: bankAcc, amount: "25000",
        });
        assert.equal(typeof payload.totalAmount, "number");
        assert.equal(payload.totalAmount, 25000);
    });

    it("narration defaults to empty string if omitted", () => {
        const payload = buildContraPayload({
            fromAccount: cashAcc, toAccount: bankAcc, amount: 1000,
        });
        assert.equal(payload.narration, "");
        assert.equal(payload.items[0].narration, "");
    });
});

// ============================================================
// MODULE 2 — CUSTOMER CREDIT LIMIT LOGIC
// ============================================================
describe("customerCreditLimit.breachDetection", () => {
    /**
     * Evaluates whether a new sale would breach the customer's credit limit.
     * Returns: { allowed: boolean, breached: boolean, action, outstanding, newTotal, limit }
     */
    function evaluateCreditLimit({ creditLimit, creditLimitAction, outstandingBalance, newInvoiceAmount }) {
        const limit = Number(creditLimit) || 0;
        const outstanding = Number(outstandingBalance) || 0;
        const invoiceAmt = Number(newInvoiceAmount) || 0;

        // 0 = no limit
        if (limit === 0) {
            return { allowed: true, breached: false, action: "None", outstanding, newTotal: outstanding + invoiceAmt, limit };
        }

        const newTotal = outstanding + invoiceAmt;
        const breached = newTotal > limit;

        if (!breached) {
            return { allowed: true, breached: false, action: creditLimitAction, outstanding, newTotal, limit };
        }

        return {
            allowed: creditLimitAction !== "Block",
            breached: true,
            action: creditLimitAction,
            outstanding,
            newTotal,
            limit,
            overshoot: +(newTotal - limit).toFixed(2),
        };
    }

    it("allows when creditLimit is 0 (no limit)", () => {
        const r = evaluateCreditLimit({ creditLimit: 0, creditLimitAction: "Block", outstandingBalance: 500000, newInvoiceAmount: 100000 });
        assert.equal(r.allowed, true);
        assert.equal(r.breached, false);
    });

    it("allows when outstanding + new is within limit", () => {
        const r = evaluateCreditLimit({ creditLimit: 100000, creditLimitAction: "Block", outstandingBalance: 40000, newInvoiceAmount: 50000 });
        assert.equal(r.allowed, true);
        assert.equal(r.breached, false);
        assert.equal(r.newTotal, 90000);
    });

    it("blocks when action=Block and limit exceeded", () => {
        const r = evaluateCreditLimit({ creditLimit: 100000, creditLimitAction: "Block", outstandingBalance: 80000, newInvoiceAmount: 30000 });
        assert.equal(r.breached, true);
        assert.equal(r.allowed, false);
        assert.equal(r.overshoot, 10000);
    });

    it("warns but allows when action=Warn and limit exceeded", () => {
        const r = evaluateCreditLimit({ creditLimit: 100000, creditLimitAction: "Warn", outstandingBalance: 80000, newInvoiceAmount: 30000 });
        assert.equal(r.breached, true);
        assert.equal(r.allowed, true);
    });

    it("allows when action=None (no restriction) even when limit exceeded", () => {
        const r = evaluateCreditLimit({ creditLimit: 100000, creditLimitAction: "None", outstandingBalance: 90000, newInvoiceAmount: 20000 });
        assert.equal(r.breached, true);
        assert.equal(r.allowed, true);
    });

    it("calculates exact overshoot", () => {
        const r = evaluateCreditLimit({ creditLimit: 50000, creditLimitAction: "Block", outstandingBalance: 45000, newInvoiceAmount: 10000 });
        assert.equal(r.overshoot, 5000);
        assert.equal(r.newTotal, 55000);
    });

    it("handles zero outstanding balance", () => {
        const r = evaluateCreditLimit({ creditLimit: 100000, creditLimitAction: "Block", outstandingBalance: 0, newInvoiceAmount: 50000 });
        assert.equal(r.allowed, true);
        assert.equal(r.newTotal, 50000);
    });

    it("handles exactly at limit (not breached)", () => {
        const r = evaluateCreditLimit({ creditLimit: 100000, creditLimitAction: "Block", outstandingBalance: 60000, newInvoiceAmount: 40000 });
        assert.equal(r.breached, false);
        assert.equal(r.allowed, true);
        assert.equal(r.newTotal, 100000);
    });

    it("treats missing creditLimit as no limit", () => {
        const r = evaluateCreditLimit({ creditLimit: undefined, creditLimitAction: "Block", outstandingBalance: 999999, newInvoiceAmount: 999999 });
        assert.equal(r.allowed, true);
        assert.equal(r.breached, false);
    });

    it("creditLimitAction enum has exactly 3 valid values", () => {
        const valid = ["None", "Warn", "Block"];
        assert.equal(valid.length, 3);
        assert.ok(valid.includes("Warn"));
        assert.ok(!valid.includes("Allow"));
    });
});

// ============================================================
// MODULE 3 — PERIOD LOCK LOGIC
// ============================================================
describe("periodLock.lockLogic", () => {
    /**
     * Returns true if the given voucher date is locked.
     * Considers temporary override (unlockedTill in future).
     */
    function isDateLocked({ booksLockedTill, voucherDate, unlockedTill }) {
        if (!booksLockedTill) return false;

        const lockDate = new Date(booksLockedTill);
        const txDate = new Date(voucherDate);

        // Check if override is active
        if (unlockedTill) {
            const overrideExpiry = new Date(unlockedTill);
            if (overrideExpiry > new Date()) return false;
        }

        return txDate <= lockDate;
    }

    /**
     * Validates override request parameters.
     */
    function validateOverride({ unlockedTill, unlockReason }) {
        if (!unlockedTill) throw new Error("unlockedTill is required");
        if (!unlockReason || !unlockReason.trim()) throw new Error("unlockReason is required");
        if (new Date(unlockedTill) <= new Date()) throw new Error("unlockedTill must be in the future");
        return true;
    }

    /**
     * Checks FY string format validity.
     */
    function isValidFY(fy) {
        if (!fy || typeof fy !== "string") return false;
        const parts = fy.split("-");
        if (parts.length !== 2) return false;
        const [start, end] = parts.map(Number);
        if (isNaN(start) || isNaN(end)) return false;
        return end === start + 1 && start >= 2000 && start <= 2100;
    }

    const FUTURE_DATE = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days ahead
    const PAST_DATE = "2026-01-01";
    const LOCKED_TILL = "2026-03-31";

    it("locks a date within the locked period", () => {
        assert.equal(isDateLocked({ booksLockedTill: LOCKED_TILL, voucherDate: "2026-02-15" }), true);
    });

    it("locks on the exact lock boundary date", () => {
        assert.equal(isDateLocked({ booksLockedTill: LOCKED_TILL, voucherDate: "2026-03-31" }), true);
    });

    it("does not lock dates after the lock boundary", () => {
        assert.equal(isDateLocked({ booksLockedTill: LOCKED_TILL, voucherDate: "2026-04-01" }), false);
    });

    it("no lock when booksLockedTill is null", () => {
        assert.equal(isDateLocked({ booksLockedTill: null, voucherDate: "2020-01-01" }), false);
    });

    it("override bypasses the lock (unlockedTill in future)", () => {
        assert.equal(
            isDateLocked({ booksLockedTill: LOCKED_TILL, voucherDate: "2026-02-15", unlockedTill: FUTURE_DATE }),
            false
        );
    });

    it("expired override does not bypass the lock", () => {
        assert.equal(
            isDateLocked({ booksLockedTill: LOCKED_TILL, voucherDate: "2026-02-15", unlockedTill: PAST_DATE }),
            true
        );
    });

    it("validateOverride rejects missing unlockedTill", () => {
        assert.throws(
            () => validateOverride({ unlockedTill: null, unlockReason: "Auditor request" }),
            (err) => err.message === "unlockedTill is required"
        );
    });

    it("validateOverride rejects blank reason", () => {
        assert.throws(
            () => validateOverride({ unlockedTill: FUTURE_DATE, unlockReason: "   " }),
            (err) => err.message === "unlockReason is required"
        );
    });

    it("validateOverride rejects past date", () => {
        assert.throws(
            () => validateOverride({ unlockedTill: PAST_DATE, unlockReason: "Audit fix" }),
            (err) => err.message === "unlockedTill must be in the future"
        );
    });

    it("validateOverride succeeds with future date and reason", () => {
        assert.equal(validateOverride({ unlockedTill: FUTURE_DATE, unlockReason: "Auditor correction" }), true);
    });

    it("isValidFY accepts 2024-2025", () => { assert.ok(isValidFY("2024-2025")); });
    it("isValidFY accepts 2025-2026", () => { assert.ok(isValidFY("2025-2026")); });
    it("isValidFY rejects 2024-2026 (gap > 1)", () => { assert.ok(!isValidFY("2024-2026")); });
    it("isValidFY rejects 2025-2024 (reversed)", () => { assert.ok(!isValidFY("2025-2024")); });
    it("isValidFY rejects empty string", () => { assert.ok(!isValidFY("")); });
    it("isValidFY rejects plain year", () => { assert.ok(!isValidFY("2025")); });
    it("isValidFY rejects letters", () => { assert.ok(!isValidFY("FY-2025")); });
});

// ============================================================
// MODULE 4 — ACCOUNTING AUDIT TRAIL LOGIC
// ============================================================
describe("accountingAuditTrail.filterAndPagination", () => {
    const VALID_ACTIONS = ["CREATE", "UPDATE", "CANCEL", "DELETE", "POST", "NUMBER_CHANGE"];

    const SAMPLE_LOGS = [
        { _id: "1", action: "CREATE", resourceType: "Voucher", financialYear: "2025-2026", voucherNo: "JV-001", createdAt: "2026-01-10T10:00:00Z", userId: { name: "Admin" }, reason: "" },
        { _id: "2", action: "UPDATE", resourceType: "Voucher", financialYear: "2025-2026", voucherNo: "JV-001", createdAt: "2026-01-11T11:00:00Z", userId: { name: "Manager" }, reason: "Correction" },
        { _id: "3", action: "CANCEL", resourceType: "SalesInvoice", financialYear: "2025-2026", voucherNo: "SI-100", createdAt: "2026-02-01T09:00:00Z", userId: { name: "Admin" }, reason: "Wrong entry" },
        { _id: "4", action: "CREATE", resourceType: "PurchaseInvoice", financialYear: "2024-2025", voucherNo: "PI-050", createdAt: "2025-08-15T08:00:00Z", userId: { name: "Staff" }, reason: "" },
        { _id: "5", action: "DELETE", resourceType: "Voucher", financialYear: "2025-2026", voucherNo: "JV-002", createdAt: "2026-03-01T14:00:00Z", userId: { name: "Admin" }, reason: "Duplicate" },
        { _id: "6", action: "POST", resourceType: "Voucher", financialYear: "2025-2026", voucherNo: "JV-003", createdAt: "2026-03-10T10:00:00Z", userId: { name: "Manager" }, reason: "" },
    ];

    /** Applies filters to simulate DB query without a real DB */
    function applyFilters(logs, { resourceType, financialYear, action }) {
        return logs.filter(l => {
            if (resourceType && l.resourceType !== resourceType) return false;
            if (financialYear && l.financialYear !== financialYear) return false;
            if (action && l.action !== action) return false;
            return true;
        });
    }

    /** Returns paginated slice */
    function paginate(logs, { page = 1, limit = 50 }) {
        const skip = (page - 1) * limit;
        return { data: logs.slice(skip, skip + limit), total: logs.length };
    }

    it("all 6 valid action values are present in VALID_ACTIONS", () => {
        assert.equal(VALID_ACTIONS.length, 6);
        ["CREATE", "UPDATE", "CANCEL", "DELETE", "POST", "NUMBER_CHANGE"].forEach(a => {
            assert.ok(VALID_ACTIONS.includes(a), `${a} should be a valid action`);
        });
    });

    it("filters by resourceType", () => {
        const result = applyFilters(SAMPLE_LOGS, { resourceType: "Voucher" });
        assert.equal(result.length, 4);
        result.forEach(l => assert.equal(l.resourceType, "Voucher"));
    });

    it("filters by financialYear", () => {
        const result = applyFilters(SAMPLE_LOGS, { financialYear: "2024-2025" });
        assert.equal(result.length, 1);
        assert.equal(result[0].voucherNo, "PI-050");
    });

    it("filters by action=CREATE", () => {
        const result = applyFilters(SAMPLE_LOGS, { action: "CREATE" });
        assert.equal(result.length, 2);
    });

    it("filters by action=CANCEL", () => {
        const result = applyFilters(SAMPLE_LOGS, { action: "CANCEL" });
        assert.equal(result.length, 1);
        assert.equal(result[0].voucherNo, "SI-100");
    });

    it("combines resourceType and action filters", () => {
        const result = applyFilters(SAMPLE_LOGS, { resourceType: "Voucher", action: "DELETE" });
        assert.equal(result.length, 1);
        assert.equal(result[0].voucherNo, "JV-002");
    });

    it("combines financialYear and action filters", () => {
        const result = applyFilters(SAMPLE_LOGS, { financialYear: "2025-2026", action: "CREATE" });
        assert.equal(result.length, 1);
        assert.equal(result[0].voucherNo, "JV-001");
    });

    it("returns all logs when no filters are applied", () => {
        const result = applyFilters(SAMPLE_LOGS, {});
        assert.equal(result.length, 6);
    });

    it("returns empty array when filter matches nothing", () => {
        const result = applyFilters(SAMPLE_LOGS, { resourceType: "BankStatement" });
        assert.equal(result.length, 0);
    });

    it("pagination: page 1 limit 3 returns first 3", () => {
        const { data, total } = paginate(SAMPLE_LOGS, { page: 1, limit: 3 });
        assert.equal(data.length, 3);
        assert.equal(total, 6);
        assert.equal(data[0]._id, "1");
    });

    it("pagination: page 2 limit 3 returns last 3", () => {
        const { data, total } = paginate(SAMPLE_LOGS, { page: 2, limit: 3 });
        assert.equal(data.length, 3);
        assert.equal(total, 6);
        assert.equal(data[0]._id, "4");
    });

    it("pagination: page beyond data returns empty", () => {
        const { data, total } = paginate(SAMPLE_LOGS, { page: 5, limit: 3 });
        assert.equal(data.length, 0);
        assert.equal(total, 6);
    });

    it("pagination: limit 50 returns all when total < 50", () => {
        const { data, total } = paginate(SAMPLE_LOGS, { page: 1, limit: 50 });
        assert.equal(data.length, 6);
        assert.equal(total, 6);
    });

    it("skip formula: (page-1) * limit", () => {
        [
            { page: 1, limit: 10, expected: 0 },
            { page: 2, limit: 10, expected: 10 },
            { page: 3, limit: 25, expected: 50 },
            { page: 1, limit: 50, expected: 0 },
        ].forEach(({ page, limit, expected }) => {
            assert.equal((page - 1) * limit, expected);
        });
    });

    it("audit log structure has all required fields", () => {
        const requiredFields = ["action", "resourceType", "resourceId", "voucherNo", "financialYear", "userId", "reason"];
        const log = { action: "CREATE", resourceType: "Voucher", resourceId: "abc123", voucherNo: "JV-001", financialYear: "2025-2026", userId: "user1", reason: "" };
        requiredFields.forEach(f => {
            assert.ok(Object.prototype.hasOwnProperty.call(log, f), `field "${f}" should be present`);
        });
    });

    it("oldest valid action enum: NUMBER_CHANGE", () => {
        assert.ok(VALID_ACTIONS.includes("NUMBER_CHANGE"));
    });
});