import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { PettyCashSettings } from '../models/pettyCashSettings.model.js';
import { PettyCashEntry } from '../models/pettyCashEntry.model.js';
import { PettyCashImportBatch } from '../models/pettyCashImportBatch.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { ApiError } from '../utils/ApiError.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextVoucherNo } from '../utils/voucherUtils.js';
import { postLedgerEntry } from '../utils/ledgerDispatcher.js';
import { autoLinkCashBankLedger } from '../utils/ledgerLinking.utils.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const TEMPLATE_HEADERS = [
    'Sr No',
    'Date',
    'Account Head',
    'Narration',
    'Payment',
    'Receipt',
    'Balance',
    'Voucher No',
    'Bill No',
    'Remarks',
];

function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const s = String(val).trim();
    if (!s) return null;
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmy) {
        const dd = parseInt(dmy[1], 10);
        const mm = parseInt(dmy[2], 10) - 1;
        let yy = parseInt(dmy[3], 10);
        if (yy < 100) yy += 2000;
        const d = new Date(yy, mm, dd);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

function cellText(cell) {
    if (!cell || cell.value == null) return '';
    if (typeof cell.value === 'object' && cell.value.text) return String(cell.value.text).trim();
    if (typeof cell.value === 'object' && cell.value.result != null) return String(cell.value.result).trim();
    return String(cell.value).trim();
}

export async function getExpenseIncomeLedgers() {
    const ledgers = await AccountLedger.find({
        status: { $ne: 'Inactive' },
        $or: [
            { type: { $in: ['Expense', 'Income'] } },
            { groupName: { $regex: /expense|income/i } },
        ],
    })
        .select('name type groupName')
        .sort({ name: 1 });
    return ledgers;
}

/** All active expense ledgers for template export / petty cash payments. */
export async function getExpenseLedgers() {
    const ledgers = await AccountLedger.find({
        status: { $ne: 'Inactive' },
        $or: [
            { type: 'Expense' },
            { groupName: { $regex: /expense/i } },
        ],
    })
        .select('name type groupName')
        .sort({ groupName: 1, name: 1 });
    return ledgers;
}

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findIndirectExpensesGroup() {
    return AccountGroup.findOne({
        name: { $regex: /^indirect expenses$/i },
        isActive: { $ne: false },
    });
}

/**
 * Resolve expense ledger by name; create under Indirect Expenses when missing.
 */
export async function ensureExpenseLedger(accountHead, userId, ledgerMap) {
    const name = String(accountHead || '').trim();
    if (!name) throw new ApiError(400, 'Account Head is required');

    const key = name.toLowerCase();
    if (ledgerMap?.has(key)) return ledgerMap.get(key);

    let existing = await AccountLedger.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
        status: { $ne: 'Inactive' },
    });
    if (existing) {
        ledgerMap?.set(key, existing);
        return existing;
    }

    const group = await findIndirectExpensesGroup();
    if (!group) {
        throw new ApiError(400, 'Indirect Expenses group not found. Initialize Account Master first.');
    }

    existing = await AccountLedger.create({
        name,
        printName: name,
        type: 'Expense',
        underGroup: group._id,
        groupName: group.name,
        status: 'Active',
        createdBy: userId,
    });
    ledgerMap?.set(key, existing);
    return existing;
}

export async function getSettings(financialYear) {
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    let doc = await PettyCashSettings.findOne({ financialYear });
    if (!doc) {
        doc = await PettyCashSettings.create({ financialYear, openingBalance: 0 });
    }
    return doc;
}

export function assertPettyCashReadyToPost(settings) {
    if (!settings?.pettyCashLedgerId) {
        throw new ApiError(
            400,
            'Petty Cash Settings not configured. Go to Accounts → Petty Cash → Settings, select PETTY CASH ledger and Cash/Bank account, then Save.',
        );
    }
}

export async function saveSettings(financialYear, body, userId) {
    const doc = await getSettings(financialYear);
    if (body.openingBalance != null) doc.openingBalance = r2(body.openingBalance);
    if (body.pettyCashLedgerId !== undefined) doc.pettyCashLedgerId = body.pettyCashLedgerId || null;
    if (body.pettyCashCashBankAccountId !== undefined) doc.pettyCashCashBankAccountId = body.pettyCashCashBankAccountId || null;
    if (body.replenishmentCashBankAccountId !== undefined) doc.replenishmentCashBankAccountId = body.replenishmentCashBankAccountId || null;
    if (body.isActive != null) doc.isActive = !!body.isActive;
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

async function resolveLedgerByAccountHead(accountHead, ledgerMap) {
    const key = String(accountHead || '').trim().toLowerCase();
    if (!key) return null;
    return ledgerMap.get(key) || null;
}

async function buildLedgerMap() {
    const ledgers = await getExpenseIncomeLedgers();
    const map = new Map();
    for (const l of ledgers) {
        map.set(String(l.name).trim().toLowerCase(), l);
    }
    return map;
}

function parseNewLedgerNamesFromWorkbook(wb) {
    const ws = wb.getWorksheet('New Ledgers');
    if (!ws) return [];
    const names = [];
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const sr = cellText(row.getCell(1));
        const name = cellText(row.getCell(2)) || sr;
        if (!name || /^sr\s*no|new ledger name|note/i.test(name)) return;
        names.push(name.trim());
    });
    return [...new Set(names.filter(Boolean))];
}

function findMainTemplateSheet(wb) {
    return (
        wb.getWorksheet('Petty Cash Template')
        || wb.worksheets.find((s) => !['Ledgers', 'Expense Ledgers', 'New Ledgers', 'Instructions'].includes(s.name))
        || wb.worksheets[0]
    );
}

export async function computeRunningBalances(financialYear) {
    const settings = await getSettings(financialYear);
    const entries = await PettyCashEntry.find({
        financialYear,
        status: { $in: ['draft', 'posted'] },
    }).sort({ date: 1, createdAt: 1 });

    let bal = r2(settings.openingBalance);
    for (const e of entries) {
        bal = r2(bal + (e.receipt || 0) - (e.payment || 0));
        e.balance = bal;
        await e.save();
    }
    return { openingBalance: settings.openingBalance, closingBalance: bal, count: entries.length };
}

async function assertVoucherNoUnique(externalVoucherNo, financialYear, excludeId) {
    if (!externalVoucherNo) return;
    const q = { financialYear, externalVoucherNo: String(externalVoucherNo).trim(), status: { $ne: 'cancelled' } };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await PettyCashEntry.findOne(q);
    if (exists) throw new ApiError(400, `Voucher No "${externalVoucherNo}" already exists for this financial year`);
}

async function postPaymentToAccounting(entry, settings, userId, session) {
    const amount = r2(entry.payment);
    if (amount <= 0) throw new ApiError(400, 'Payment amount must be greater than zero');

    if (!settings.pettyCashLedgerId) {
        throw new ApiError(400, 'Configure Petty Cash ledger in Petty Cash Settings before posting');
    }
    if (!entry.ledgerId) throw new ApiError(400, 'Account Head / ledger is required');

    let pettyCashLedgerId = settings.pettyCashLedgerId;
    let cashBankAccountId = settings.pettyCashCashBankAccountId;
    if (cashBankAccountId) {
        pettyCashLedgerId = await autoLinkCashBankLedger(cashBankAccountId, session);
    }

    const vType =
        (await VoucherType.findOne({ nature: 'Expense', isActive: { $ne: false } }).session(session)) ||
        (await VoucherType.findOne({ isActive: { $ne: false } }).session(session));
    if (!vType) throw new ApiError(400, 'No expense voucher type configured');

    const date = entry.date;
    const fy = entry.financialYear;
    const voucherNo = entry.externalVoucherNo?.trim() || (await getNextVoucherNo(vType._id, date, session));

    const [voucher] = await Voucher.create(
        [
            {
                voucherNo,
                voucherType: vType._id,
                voucherTypeName: vType.name,
                nature: 'Expense',
                expenseType: 'Petty Cash',
                date,
                financialYear: fy,
                cashBankAccountId: cashBankAccountId || null,
                totalAmount: amount,
                supplierBillNo: entry.billNo || '',
                narration: entry.narration || entry.remarks || 'Petty Cash expense',
                status: 'Confirmed',
                isSystemGenerated: true,
                paymentStatus: 'Paid',
                paidAmount: amount,
                items: [
                    {
                        ledgerId: entry.ledgerId,
                        ledgerName: entry.accountHead,
                        amount,
                        type: 'Debit',
                        narration: entry.narration || '',
                    },
                ],
                createdBy: userId,
            },
        ],
        { session },
    );

    await postLedgerEntry(
        {
            voucherId: voucher._id,
            voucherNo,
            date,
            ledgerId: pettyCashLedgerId,
            amount,
            type: 'Credit',
            cashBankAccountId: cashBankAccountId || null,
            narration: entry.narration || 'Petty Cash payment',
            financialYear: fy,
        },
        session,
    );

    await postLedgerEntry(
        {
            voucherId: voucher._id,
            voucherNo,
            date,
            ledgerId: entry.ledgerId,
            amount,
            type: 'Debit',
            narration: entry.narration || entry.accountHead,
            financialYear: fy,
        },
        session,
    );

    return voucher;
}

async function postReceiptToAccounting(entry, settings, userId, session) {
    const amount = r2(entry.receipt);
    if (amount <= 0) throw new ApiError(400, 'Receipt amount must be greater than zero');

    if (!settings.pettyCashLedgerId) {
        throw new ApiError(400, 'Configure Petty Cash ledger in Petty Cash Settings before posting');
    }
    const cashBankAccountId = settings.replenishmentCashBankAccountId || settings.pettyCashCashBankAccountId;
    if (!cashBankAccountId) {
        throw new ApiError(400, 'Configure replenishment Cash/Bank account in Petty Cash Settings');
    }

    const pettyCashLedgerId = settings.pettyCashLedgerId;
    const bankLedgerId = await autoLinkCashBankLedger(cashBankAccountId, session);

    const vType =
        (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session)) ||
        (await VoucherType.findOne({ isActive: { $ne: false } }).session(session));
    if (!vType) throw new ApiError(400, 'No journal voucher type configured');

    const date = entry.date;
    const fy = entry.financialYear;
    const voucherNo = entry.externalVoucherNo?.trim() || (await getNextVoucherNo(vType._id, date, session));

    const [voucher] = await Voucher.create(
        [
            {
                voucherNo,
                voucherType: vType._id,
                voucherTypeName: vType.name,
                nature: 'Journal',
                date,
                financialYear: fy,
                totalAmount: amount,
                narration: entry.narration || entry.remarks || 'Petty Cash replenishment',
                status: 'Confirmed',
                isSystemGenerated: true,
                items: [
                    { ledgerId: pettyCashLedgerId, amount, type: 'Debit', narration: 'Petty Cash replenishment' },
                    { ledgerId: bankLedgerId, amount, type: 'Credit', narration: 'Petty Cash replenishment' },
                ],
                createdBy: userId,
            },
        ],
        { session },
    );

    await postLedgerEntry(
        {
            voucherId: voucher._id,
            voucherNo,
            date,
            ledgerId: pettyCashLedgerId,
            amount,
            type: 'Debit',
            narration: 'Petty Cash replenishment',
            financialYear: fy,
        },
        session,
    );

    await postLedgerEntry(
        {
            voucherId: voucher._id,
            voucherNo,
            date,
            ledgerId: bankLedgerId,
            amount,
            type: 'Credit',
            cashBankAccountId,
            narration: 'Petty Cash replenishment',
            financialYear: fy,
        },
        session,
    );

    return voucher;
}

export async function createEntry(body, userId, { postNow = true, skipBalanceRecalc = false } = {}) {
    const payment = r2(body.payment);
    const receipt = r2(body.receipt);
    if (payment > 0 && receipt > 0) throw new ApiError(400, 'Enter either Payment or Receipt, not both');
    if (payment <= 0 && receipt <= 0) throw new ApiError(400, 'Enter Payment or Receipt amount');

    const date = body.date ? new Date(body.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Invalid date');

    const financialYear = body.financialYear || getFYFromDate(date);
    const entryKind = receipt > 0 ? 'receipt' : 'payment';

    await assertVoucherNoUnique(body.externalVoucherNo, financialYear);

    let ledgerId = body.ledgerId || null;
    let accountHead = body.accountHead || '';
    if (entryKind === 'payment') {
        if (!ledgerId && accountHead) {
            const map = await buildLedgerMap();
            const ledger = await ensureExpenseLedger(accountHead, userId, map);
            ledgerId = ledger._id;
            accountHead = ledger.name;
        } else if (ledgerId && !accountHead) {
            const lg = await AccountLedger.findById(ledgerId).select('name');
            if (lg) accountHead = lg.name;
        }
        if (!ledgerId) throw new ApiError(400, 'Account Head is required for payment entries');
    }

    const entry = await PettyCashEntry.create({
        date,
        externalVoucherNo: String(body.externalVoucherNo || '').trim(),
        billNo: String(body.billNo || '').trim(),
        ledgerId,
        accountHead,
        narration: String(body.narration || '').trim(),
        payment,
        receipt,
        remarks: String(body.remarks || '').trim(),
        entryKind,
        financialYear,
        status: postNow ? 'posted' : 'draft',
        createdBy: userId,
        updatedBy: userId,
    });

    if (postNow) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const settings = await getSettings(financialYear);
            const voucher =
                entryKind === 'receipt'
                    ? await postReceiptToAccounting(entry, settings, userId, session)
                    : await postPaymentToAccounting(entry, settings, userId, session);
            entry.accountingVoucherId = voucher._id;
            entry.postedBy = userId;
            entry.postedAt = new Date();
            await entry.save({ session });
            await session.commitTransaction();
        } catch (err) {
            await session.abortTransaction();
            await PettyCashEntry.deleteOne({ _id: entry._id });
            throw err;
        } finally {
            session.endSession();
        }
    }

    if (!skipBalanceRecalc) {
        await computeRunningBalances(financialYear);
    }
    return entry;
}

export async function queryEntries(filter, options) {
    const q = {};
    if (filter.financialYear) q.financialYear = filter.financialYear;
    if (filter.status) q.status = filter.status;
    if (filter.entryKind) q.entryKind = filter.entryKind;
    if (filter.ledgerId) q.ledgerId = filter.ledgerId;
    if (filter.createdBy) q.createdBy = filter.createdBy;
    if (filter.fromDate || filter.toDate) {
        q.date = {};
        if (filter.fromDate) q.date.$gte = new Date(filter.fromDate);
        if (filter.toDate) q.date.$lte = new Date(filter.toDate);
    }
    if (filter.search) {
        const re = new RegExp(String(filter.search).trim(), 'i');
        q.$or = [{ externalVoucherNo: re }, { billNo: re }, { accountHead: re }, { narration: re }];
    }

    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 100;
    const skip = (page - 1) * limit;

    const [results, totalResults] = await Promise.all([
        PettyCashEntry.find(q).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
        PettyCashEntry.countDocuments(q),
    ]);

    return { results, page, limit, totalResults, totalPages: Math.ceil(totalResults / limit) };
}

export async function getEntryById(id) {
    const doc = await PettyCashEntry.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Petty cash entry not found');
    return doc;
}

export async function buildTemplateWorkbook(financialYear) {
    const expenseLedgers = await getExpenseLedgers();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'JSK CRM';
    wb.created = new Date();

    const instructions = wb.addWorksheet('Instructions');
    instructions.addRow(['Petty Cash Import — Instructions']);
    instructions.addRow([]);
    instructions.addRow(['1. Fill rows on "Petty Cash Template" sheet.']);
    instructions.addRow(['2. "Expense Ledgers" lists all existing expense ledgers from CRM (reference).']);
    instructions.addRow(['3. Use Account Head dropdown OR type a new name — missing ledgers are created under Indirect Expenses on import.']);
    instructions.addRow(['4. Add new ledger names on "New Ledgers" sheet — they appear in Account Head dropdown on Petty Cash Template.']);
    instructions.addRow(['5. Or type a new name directly in Account Head — still created under Indirect Expenses on import.']);
    instructions.addRow(['6. Upload file → Preview → Approve & Post.']);
    instructions.getColumn(1).width = 90;

    const expenseSheet = wb.addWorksheet('Expense Ledgers');
    expenseSheet.addRow(['Sr No', 'Ledger Name', 'Group Name', 'Type']);
    expenseSheet.getRow(1).font = { bold: true };
    expenseLedgers.forEach((l, i) => {
        expenseSheet.addRow([i + 1, l.name, l.groupName || '', l.type || 'Expense']);
    });
    expenseSheet.columns = [{ width: 8 }, { width: 36 }, { width: 28 }, { width: 12 }];

    const newLedgerSheet = wb.addWorksheet('New Ledgers');
    newLedgerSheet.addRow(['Sr No', 'New Ledger Name', 'Note']);
    newLedgerSheet.getRow(1).font = { bold: true };
    newLedgerSheet.addRow([1, '', 'Names in column B appear in Account Head dropdown after you enter them']);
    newLedgerSheet.columns = [{ width: 8 }, { width: 36 }, { width: 40 }];
    for (let r = 2; r <= 500; r++) {
        newLedgerSheet.getCell(r, 1).value = r === 2 ? 1 : { formula: `IF(B${r}="","",A${r - 1}+1)` };
    }

    const ledgerSheet = wb.addWorksheet('Ledgers', { state: 'hidden' });
    const maxDropdownRows = 500;
    expenseLedgers.forEach((l, i) => {
        ledgerSheet.getCell(i + 1, 1).value = l.name;
    });
    // Below CRM ledgers: mirror New Ledgers names in same column for a single dropdown range
    for (let r = expenseLedgers.length + 1; r <= maxDropdownRows; r++) {
        const newLedgerRow = r - expenseLedgers.length + 1;
        ledgerSheet.getCell(r, 1).value = {
            formula: `IF('New Ledgers'!B${newLedgerRow}="","",'New Ledgers'!B${newLedgerRow})`,
        };
    }

    const ws = wb.addWorksheet('Petty Cash Template');
    ws.addRow(TEMPLATE_HEADERS);
    ws.getRow(1).font = { bold: true };

    const sample = ws.addRow([1, new Date(), expenseLedgers[0]?.name || '', 'Sample narration', 0, 0, '', 'PC-001', '', '']);
    sample.getCell(2).numFmt = 'dd/mm/yyyy';

    for (let r = 2; r <= maxDropdownRows; r++) {
        ws.getCell(r, 2).numFmt = 'dd/mm/yyyy';
    }
    // One list validation for entire column — comma-joined dual ranges break Excel file integrity
    ws.dataValidations.add('C2:C500', {
        type: 'list',
        allowBlank: true,
        formulae: [`'Ledgers'!$A$1:$A$${maxDropdownRows}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'New Account Head',
        error: 'Not in list — will be created under Indirect Expenses when you import',
    });

    ws.columns = [
        { width: 8 },
        { width: 14 },
        { width: 28 },
        { width: 32 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 14 },
        { width: 14 },
        { width: 24 },
    ];

    return wb;
}

export async function generateExpenseLedgersExportBuffer() {
    const expenseLedgers = await getExpenseLedgers();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Expense Ledgers');
    ws.addRow(['Sr No', 'Ledger Name', 'Group Name', 'Type']);
    ws.getRow(1).font = { bold: true };
    expenseLedgers.forEach((l, i) => {
        ws.addRow([i + 1, l.name, l.groupName || '', l.type || 'Expense']);
    });
    ws.columns = [{ width: 8 }, { width: 36 }, { width: 28 }, { width: 12 }];
    return wb.xlsx.writeBuffer();
}

export async function generateTemplateBuffer(financialYear) {
    const wb = await buildTemplateWorkbook(financialYear);
    return wb.xlsx.writeBuffer();
}

function validateImportRow(row, ledgerMap, financialYear, seenVoucherNos, newLedgerNames = new Set()) {
    const errors = [];
    const warnings = [];
    const date = parseExcelDate(row.date);
    if (!date) errors.push('Invalid or missing Date');

    const fy = financialYear || (date ? getFYFromDate(date) : null);
    if (date && fy !== financialYear) {
        errors.push(`Date falls outside selected FY ${financialYear}`);
    }

    const payment = r2(row.payment);
    const receipt = r2(row.receipt);
    if (payment > 0 && receipt > 0) errors.push('Row has both Payment and Receipt — use only one');
    if (payment <= 0 && receipt <= 0) errors.push('Payment or Receipt required');

    let ledger = null;
    let willCreateLedger = false;
    if (payment > 0) {
        if (!row.accountHead) errors.push('Account Head required for payment rows');
        else {
            ledger = resolveLedgerByAccountHeadSync(row.accountHead, ledgerMap);
            if (!ledger) {
                willCreateLedger = true;
                warnings.push(`Ledger "${row.accountHead}" will be created under Indirect Expenses on post`);
            }
            if (newLedgerNames.has(String(row.accountHead).trim().toLowerCase()) && !ledger) {
                warnings.push('Listed on New Ledgers sheet');
            }
        }
    }

    const vno = String(row.externalVoucherNo || '').trim();
    if (vno) {
        if (seenVoucherNos.has(vno)) errors.push(`Duplicate Voucher No "${vno}" in file`);
        seenVoucherNos.add(vno);
    }

    if (!Number.isFinite(payment) || payment < 0) errors.push('Payment must be numeric');
    if (!Number.isFinite(receipt) || receipt < 0) errors.push('Receipt must be numeric');

    return {
        errors,
        warnings,
        willCreateLedger,
        isValid: errors.length === 0,
        parsed: {
            date,
            ledger,
            payment,
            receipt,
            entryKind: receipt > 0 ? 'receipt' : 'payment',
            financialYear: fy,
            willCreateLedger,
        },
    };
}

function resolveLedgerByAccountHeadSync(accountHead, ledgerMap) {
    const key = String(accountHead || '').trim().toLowerCase();
    if (!key) return null;
    return ledgerMap.get(key) || null;
}

export async function parseAndValidateImport(buffer, fileName, financialYear, userId) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = findMainTemplateSheet(wb);
    if (!ws) throw new ApiError(400, 'Excel file has no worksheets');

    const newLedgerNameList = parseNewLedgerNamesFromWorkbook(wb);
    const newLedgerNames = new Set(newLedgerNameList.map((n) => n.toLowerCase()));

    const ledgerMap = await buildLedgerMap();
    const seenVoucherNos = new Set();
    const existingVouchers = await PettyCashEntry.find({
        financialYear,
        status: { $ne: 'cancelled' },
        externalVoucherNo: { $ne: '' },
    }).select('externalVoucherNo');
    for (const e of existingVouchers) {
        if (e.externalVoucherNo) seenVoucherNos.add(String(e.externalVoucherNo).trim());
    }

    const rows = [];
    let rowNum = 0;
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = [
            cellText(row.getCell(1)),
            cellText(row.getCell(2)),
            cellText(row.getCell(3)),
            cellText(row.getCell(4)),
            cellText(row.getCell(5)),
            cellText(row.getCell(6)),
            cellText(row.getCell(7)),
            cellText(row.getCell(8)),
            cellText(row.getCell(9)),
            cellText(row.getCell(10)),
        ];
        if (values.every((v) => !v)) return;

        rowNum += 1;
        const payment = r2(parseFloat(values[4]) || 0);
        const receipt = r2(parseFloat(values[5]) || 0);
        const balance = r2(parseFloat(values[6]) || 0);

        const rowData = {
            rowNumber: rowNum,
            date: values[1],
            accountHead: values[2],
            narration: values[3],
            payment,
            receipt,
            balance,
            externalVoucherNo: values[7],
            billNo: values[8],
            remarks: values[9],
        };

        const validation = validateImportRow(rowData, ledgerMap, financialYear, seenVoucherNos, newLedgerNames);
        rows.push({
            ...rowData,
            errors: validation.errors,
            warnings: validation.warnings,
            willCreateLedger: validation.willCreateLedger,
            isValid: validation.isValid,
            _parsed: validation.parsed,
        });
    });

    const validCount = rows.filter((r) => r.isValid).length;
    const errorCount = rows.length - validCount;
    const newLedgerCount = rows.filter((r) => r.willCreateLedger).length;

    const batch = await PettyCashImportBatch.create({
        fileName: fileName || 'import.xlsx',
        financialYear,
        status: 'validated',
        rows: rows.map(({ _parsed, ...r }) => r),
        validCount,
        errorCount,
        createdBy: userId,
    });

    return { batch, rows, validCount, errorCount, newLedgerCount, newLedgerNamesFromSheet: newLedgerNameList };
}

export async function approveImportBatch(batchId, userId, options = {}) {
    const batch = await PettyCashImportBatch.findById(batchId);
    if (!batch) throw new ApiError(404, 'Import batch not found');
    if (batch.status === 'posted') throw new ApiError(400, 'Import batch already posted');

    const settings = await getSettings(batch.financialYear);
    assertPettyCashReadyToPost(settings);

    const selectedRows = Array.isArray(options.rowNumbers) && options.rowNumbers.length
        ? new Set(options.rowNumbers.map((n) => Number(n)))
        : null;

    const ledgerMap = await buildLedgerMap();
    let postedCount = 0;
    let ledgersCreated = 0;
    const postErrors = [];
    const createdLedgerNames = new Set();

    for (const row of batch.rows) {
        if (!row.isValid) continue;
        if (selectedRows && !selectedRows.has(row.rowNumber)) continue;
        try {
            let ledger = row.accountHead ? resolveLedgerByAccountHeadSync(row.accountHead, ledgerMap) : null;
            if (!ledger && row.accountHead && row.payment > 0) {
                const before = ledgerMap.has(String(row.accountHead).trim().toLowerCase());
                ledger = await ensureExpenseLedger(row.accountHead, userId, ledgerMap);
                if (!before && ledger) {
                    createdLedgerNames.add(ledger.name);
                    ledgersCreated += 1;
                }
            }
            await createEntry(
                {
                    date: parseExcelDate(row.date),
                    externalVoucherNo: row.externalVoucherNo,
                    billNo: row.billNo,
                    ledgerId: ledger?._id,
                    accountHead: ledger?.name || row.accountHead,
                    narration: row.narration,
                    payment: row.payment,
                    receipt: row.receipt,
                    remarks: row.remarks,
                    financialYear: batch.financialYear,
                },
                userId,
                { postNow: true, skipBalanceRecalc: true },
            );
            postedCount += 1;
        } catch (err) {
            postErrors.push({ rowNumber: row.rowNumber, message: err.message || 'Post failed' });
        }
    }

    if (postedCount > 0) {
        await computeRunningBalances(batch.financialYear);
    }

    if (selectedRows && postedCount === 0 && postErrors.length === 0) {
        throw new ApiError(400, 'No valid rows selected for posting');
    }

    batch.status = postErrors.length ? 'failed' : 'posted';
    batch.postedCount = postedCount;
    batch.postedBy = userId;
    if (postErrors.length) {
        batch.rows = batch.rows.map((r) => {
            const pe = postErrors.find((e) => e.rowNumber === r.rowNumber);
            if (!pe) return r;
            const plain = r.toObject?.() || r;
            return { ...plain, errors: [...(plain.errors || []), pe.message], isValid: false };
        });
    }
    await batch.save();

    return { batch, postedCount, postErrors, ledgersCreated, createdLedgerNames: [...createdLedgerNames] };
}

export async function getReport(filter) {
    const q = { status: { $in: ['posted', 'draft'] } };
    if (filter.financialYear) q.financialYear = filter.financialYear;
    if (filter.entryKind) q.entryKind = filter.entryKind;
    if (filter.ledgerId) q.ledgerId = filter.ledgerId;
    if (filter.createdBy) q.createdBy = filter.createdBy;
    if (filter.fromDate || filter.toDate) {
        q.date = {};
        if (filter.fromDate) q.date.$gte = new Date(filter.fromDate);
        if (filter.toDate) q.date.$lte = new Date(filter.toDate);
    }

    const settings = filter.financialYear ? await getSettings(filter.financialYear) : null;
    const entries = await PettyCashEntry.find(q).sort({ date: 1, createdAt: 1 });

    const reportType = filter.reportType || 'book';
    let rows = entries;

    if (reportType === 'account_head' && filter.ledgerId) {
        rows = entries.filter((e) => String(e.ledgerId) === String(filter.ledgerId));
    }

    if (reportType === 'missing_attachments') {
        const { VoucherAttachment } = await import('../models/voucherAttachment.model.js');
        const ids = entries.map((e) => e._id);
        const attached = await VoucherAttachment.distinct('voucherId', {
            voucherType: 'petty_cash',
            voucherId: { $in: ids },
            isDeleted: false,
        });
        const attachedSet = new Set(attached.map(String));
        rows = entries.filter((e) => e.entryKind === 'payment' && !attachedSet.has(String(e._id)));
    }

    if (reportType === 'voucher') {
        rows = [...entries].sort((a, b) =>
            String(a.externalVoucherNo || '').localeCompare(String(b.externalVoucherNo || '')),
        );
    }

    if (reportType === 'bill') {
        rows = entries.filter((e) => e.billNo);
        rows.sort((a, b) => String(a.billNo).localeCompare(String(b.billNo)));
    }

    if (reportType === 'daily') {
        const byDay = new Map();
        for (const e of entries) {
            const key = e.date ? new Date(e.date).toISOString().slice(0, 10) : 'unknown';
            const cur = byDay.get(key) || { date: key, payment: 0, receipt: 0, count: 0 };
            cur.payment = r2(cur.payment + (e.payment || 0));
            cur.receipt = r2(cur.receipt + (e.receipt || 0));
            cur.count += 1;
            byDay.set(key, cur);
        }
        rows = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    if (reportType === 'monthly') {
        const byMonth = new Map();
        for (const e of entries) {
            const d = e.date ? new Date(e.date) : null;
            const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'unknown';
            const cur = byMonth.get(key) || { month: key, payment: 0, receipt: 0, count: 0 };
            cur.payment = r2(cur.payment + (e.payment || 0));
            cur.receipt = r2(cur.receipt + (e.receipt || 0));
            cur.count += 1;
            byMonth.set(key, cur);
        }
        rows = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
    }

    const summary = {
        openingBalance: settings?.openingBalance || 0,
        totalPayment: r2(rows.reduce((s, e) => s + (e.payment || 0), 0)),
        totalReceipt: r2(rows.reduce((s, e) => s + (e.receipt || 0), 0)),
        closingBalance: rows.length ? rows[rows.length - 1].balance : settings?.openingBalance || 0,
        count: rows.length,
    };

    return { rows, summary, reportType };
}

export async function exportReportExcel(filter) {
    const { rows, summary } = await getReport(filter);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Petty Cash Report');
    ws.addRow(['Opening Balance', summary.openingBalance]);
    ws.addRow(['Total Receipt', summary.totalReceipt]);
    ws.addRow(['Total Payment', summary.totalPayment]);
    ws.addRow(['Closing Balance', summary.closingBalance]);
    ws.addRow([]);
    ws.addRow(['Date', 'Voucher No', 'Bill No', 'Account Head', 'Narration', 'Payment', 'Receipt', 'Balance', 'Remarks', 'Status']);
    for (const e of rows) {
        ws.addRow([
            e.date ? new Date(e.date).toLocaleDateString('en-IN') : '',
            e.externalVoucherNo,
            e.billNo,
            e.accountHead,
            e.narration,
            e.payment,
            e.receipt,
            e.balance,
            e.remarks,
            e.status,
        ]);
    }
    return wb.xlsx.writeBuffer();
}
