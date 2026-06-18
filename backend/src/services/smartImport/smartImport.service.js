import ExcelJS from 'exceljs';
import { SmartImportBatch } from '../../models/smartImportBatch.model.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { AccountGroup } from '../../models/accountGroup.model.js';
import { Supplier } from '../../models/supplier.model.js';
import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseGstrFile } from '../gstReconciliation/parseGstrPortal.js';
import { resolveSupplierFromExtract, buildPendingSupplierPayload } from '../scanEntry/masterMatch.service.js';
import { autoMapDraft } from '../scanEntry/mapping.service.js';
import { logImportHistory } from '../importCenter/importHistory.service.js';

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

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cellText(cell) {
    if (!cell || cell.value == null) return '';
    if (typeof cell.value === 'object' && cell.value.text) return String(cell.value.text).trim();
    if (typeof cell.value === 'object' && cell.value.result != null) return String(cell.value.result).trim();
    return String(cell.value).trim();
}

async function loadWorkbook(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return wb;
}

function sheetToRows(ws) {
    const rows = [];
    ws.eachRow((row, rowNumber) => {
        const cells = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cells[colNumber - 1] = cellText(cell);
        });
        rows.push({ rowNumber, cells });
    });
    return rows;
}

function detectHeaderRow(rows, aliases) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const line = rows[i].cells.map((c) => String(c || '').toLowerCase().trim()).join(' ');
        const hits = aliases.filter((a) => line.includes(a));
        if (hits.length >= 2) return { headerIndex: i, headers: rows[i].cells };
    }
    return { headerIndex: 0, headers: rows[0]?.cells || [] };
}

function mapHeaders(headers, fieldAliases) {
    const map = {};
    const norm = headers.map((h) => String(h || '').toLowerCase().replace(/[₹()]/g, '').trim());
    for (const [field, aliases] of Object.entries(fieldAliases)) {
        const idx = norm.findIndex((h) => aliases.some((a) => h.includes(a)));
        if (idx >= 0) map[field] = idx;
    }
    return map;
}

async function findIndirectExpensesGroup() {
    return AccountGroup.findOne({ name: { $regex: /indirect expenses/i } }).lean();
}

async function ensureLedgerByName(name, groupName, type, userId, ledgerMap) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    if (ledgerMap.has(key)) return ledgerMap.get(key);
    let ledger = await AccountLedger.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
        status: { $ne: 'Inactive' },
    });
    if (!ledger && groupName) {
        const group = await AccountGroup.findOne({ name: { $regex: new RegExp(escapeRegex(groupName), 'i') } });
        if (group) {
            ledger = await AccountLedger.create({
                name: name.trim(),
                printName: name.trim(),
                type: type || 'Expense',
                underGroup: group._id,
                groupName: group.name,
                status: 'Active',
                createdBy: userId,
            });
        }
    }
    if (ledger) ledgerMap.set(key, ledger);
    return ledger;
}

export async function parseTallyLedgerMaster(buffer, fileName, financialYear, userId, companyId) {
    const wb = await loadWorkbook(buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new ApiError(400, 'Empty workbook');
    const rows = sheetToRows(ws);
    const { headerIndex, headers } = detectHeaderRow(rows, ['ledger', 'name', 'group', 'gstin']);
    const colMap = mapHeaders(headers, {
        ledgerName: ['ledger name', 'name', 'ledger'],
        underGroup: ['under', 'group', 'parent'],
        gstin: ['gstin', 'gst'],
        pan: ['pan'],
        openingBalance: ['opening', 'balance'],
        address: ['address'],
        state: ['state'],
    });

    const ledgerMap = new Map();
    const importRows = [];
    let rowNum = 0;
    for (let i = headerIndex + 1; i < rows.length; i++) {
        const cells = rows[i].cells;
        const ledgerName = cells[colMap.ledgerName] || cells[0];
        if (!ledgerName) continue;
        rowNum += 1;
        const errors = [];
        const warnings = [];
        const gstin = String(cells[colMap.gstin] || '').trim().toUpperCase();
        const raw = {
            ledgerName,
            underGroup: cells[colMap.underGroup] || 'Sundry Creditors',
            gstin,
            pan: cells[colMap.pan] || '',
            openingBalance: Number(cells[colMap.openingBalance]) || 0,
            address: cells[colMap.address] || '',
            state: cells[colMap.state] || '',
        };
        let willCreateLedger = false;
        const existing = await AccountLedger.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(ledgerName)}$`, 'i') },
        }).lean();
        if (!existing) {
            willCreateLedger = true;
            warnings.push('Ledger will be created on approve');
        }
        importRows.push({
            rowNumber: rowNum,
            raw,
            mapped: { ledgerId: existing?._id || null },
            errors,
            warnings,
            willCreateLedger,
            isValid: errors.length === 0,
        });
    }

    const batch = await SmartImportBatch.create({
        companyId,
        financialYear,
        importType: 'tally_ledger_master',
        fileName,
        status: 'validated',
        rows: importRows,
        validCount: importRows.filter((r) => r.isValid).length,
        errorCount: importRows.filter((r) => !r.isValid).length,
        createdBy: userId,
    });
    return { batch, rows: importRows };
}

export async function parseTallyDayBook(buffer, fileName, financialYear, userId, companyId) {
    const wb = await loadWorkbook(buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new ApiError(400, 'Empty workbook');
    const rows = sheetToRows(ws);
    const { headerIndex, headers } = detectHeaderRow(rows, ['date', 'debit', 'credit', 'amount']);
    const colMap = mapHeaders(headers, {
        date: ['date'],
        voucherType: ['voucher type', 'type'],
        voucherNo: ['voucher no', 'vch no'],
        debitLedger: ['debit'],
        creditLedger: ['credit'],
        amount: ['amount'],
        narration: ['narration', 'particulars'],
        partyName: ['party', 'ledger name'],
    });

    const importRows = [];
    let rowNum = 0;
    for (let i = headerIndex + 1; i < rows.length; i++) {
        const cells = rows[i].cells;
        const amount = Number(cells[colMap.amount]) || 0;
        const debit = cells[colMap.debitLedger] || '';
        const credit = cells[colMap.creditLedger] || '';
        if (!debit && !credit && !amount) continue;
        rowNum += 1;
        const errors = [];
        if (!amount) errors.push('Amount is required');
        if (!debit && !credit) errors.push('Debit or credit ledger required');
        const raw = {
            date: cells[colMap.date],
            voucherType: cells[colMap.voucherType] || 'Journal',
            voucherNo: cells[colMap.voucherNo] || '',
            debitLedger: debit,
            creditLedger: credit,
            amount,
            narration: cells[colMap.narration] || '',
            partyName: cells[colMap.partyName] || '',
        };
        importRows.push({
            rowNumber: rowNum,
            raw,
            mapped: {},
            errors,
            warnings: [],
            willCreateLedger: false,
            isValid: errors.length === 0,
        });
    }

    const batch = await SmartImportBatch.create({
        companyId,
        financialYear,
        importType: 'tally_day_book',
        fileName,
        status: 'validated',
        columnMapping: colMap,
        rows: importRows,
        validCount: importRows.filter((r) => r.isValid).length,
        errorCount: importRows.filter((r) => !r.isValid).length,
        createdBy: userId,
    });
    return { batch, rows: importRows };
}

export async function parseGstr2bItc(buffer, fileName, financialYear, userId, companyId) {
    const parsed = await parseGstrFile(buffer, fileName);
    const records = parsed?.records || [];
    const importRows = [];
    let rowNum = 0;
    for (const rec of records) {
        rowNum += 1;
        const errors = [];
        if (!rec.supplierGstin && !rec.supplierName) errors.push('Supplier GSTIN or name required');
        if (!rec.invoiceNumber) errors.push('Invoice number required');
        const raw = {
            supplierGstin: rec.supplierGstin || '',
            supplierName: rec.supplierName || '',
            invoiceNumber: rec.invoiceNumber || '',
            invoiceDate: rec.invoiceDate,
            taxableValue: rec.taxableValue || 0,
            cgst: rec.cgst || 0,
            sgst: rec.sgst || 0,
            igst: rec.igst || 0,
            cess: rec.cess || 0,
            invoiceValue: rec.invoiceValue || rec.totalValue || 0,
            itcAvailable: rec.itcAvailable || 'Yes',
            stockEffect: false,
        };
        importRows.push({
            rowNumber: rowNum,
            raw,
            mapped: {},
            errors,
            warnings: ['No stock update from GSTR-2B — item-wise bill required for stock'],
            willCreateLedger: false,
            isValid: errors.length === 0,
        });
    }

    const batch = await SmartImportBatch.create({
        companyId,
        financialYear,
        importType: 'gstr2b_itc',
        fileName,
        status: 'validated',
        rows: importRows,
        validCount: importRows.filter((r) => r.isValid).length,
        errorCount: importRows.filter((r) => !r.isValid).length,
        createdBy: userId,
    });
    return { batch, rows: importRows, parseMeta: { totalSkipped: parsed?.totalSkipped, errors: parsed?.errors } };
}

export async function uploadSmartImport({ buffer, fileName, importType, financialYear, userId, companyId, dryRun = false }) {
    let result;
    if (importType === 'tally_ledger_master') {
        result = await parseTallyLedgerMaster(buffer, fileName, financialYear, userId, companyId);
    } else if (importType === 'tally_day_book') {
        result = await parseTallyDayBook(buffer, fileName, financialYear, userId, companyId);
    } else if (importType === 'gstr2b_itc') {
        result = await parseGstr2bItc(buffer, fileName, financialYear, userId, companyId);
    } else {
        throw new ApiError(400, `Unsupported import type: ${importType}`);
    }
    if (result?.batch) {
        if (dryRun) {
            result.batch.dryRun = true;
            result.batch.status = 'dry_run';
            await result.batch.save();
        }
        await logImportHistory({
            companyId,
            financialYear,
            importType,
            sourceModule: 'smart_import',
            batchId: result.batch._id,
            fileName,
            recordsTotal: result.batch.rows?.length || 0,
            recordsSuccess: result.batch.validCount || 0,
            recordsFailed: result.batch.errorCount || 0,
            status: dryRun ? 'dry_run' : 'validated',
            dryRun,
            userId,
        });
    }
    return result;
}

export async function approveSmartImportBatch(batchId, rowNumbers, userId) {
    const batch = await SmartImportBatch.findById(batchId);
    if (!batch) throw new ApiError(404, 'Batch not found');
    if (batch.status === 'posted') throw new ApiError(400, 'Batch already posted');
    if (batch.dryRun || batch.status === 'dry_run') {
        return {
            batch,
            dryRun: true,
            postedCount: 0,
            postErrors: [],
            message: 'Dry run batch — no posting. Re-upload without dry run to post.',
        };
    }

    const selected = batch.rows.filter((r) => r.isValid && (!rowNumbers?.length || rowNumbers.includes(r.rowNumber)));
    const ledgerMap = new Map();
    let postedCount = 0;
    const postErrors = [];

    for (const row of selected) {
        try {
            if (batch.importType === 'tally_ledger_master') {
                const { ledgerName, underGroup, gstin, pan, address, state, openingBalance } = row.raw;
                const group = await AccountGroup.findOne({ name: { $regex: new RegExp(escapeRegex(underGroup || 'Sundry Creditors'), 'i') } });
                let ledger = await AccountLedger.findOne({ name: { $regex: new RegExp(`^${escapeRegex(ledgerName)}$`, 'i') } });
                if (!ledger && group) {
                    ledger = await AccountLedger.create({
                        name: ledgerName.trim(),
                        printName: ledgerName.trim(),
                        type: group.type || 'Liability',
                        underGroup: group._id,
                        groupName: group.name,
                        gstin: gstin || '',
                        pan: pan || '',
                        address: address || '',
                        state: state || '',
                        openingBalance: openingBalance || 0,
                        status: 'Active',
                        createdBy: userId,
                    });
                }
                if (gstin && ledger) {
                    let supplier = await Supplier.findOne({ gstNumber: gstin, isDeleted: { $ne: true } });
                    if (!supplier) {
                        supplier = await Supplier.create({
                            supplierCode: `SUP-GSTR-${Date.now()}`,
                            supplierName: ledgerName,
                            gstNumber: gstin,
                            panNumber: pan || '',
                            state: state || '',
                            address: address || '',
                            ledgerId: ledger._id,
                            isActive: true,
                            createdBy: userId,
                            remarks: 'Created from Tally Ledger Master import',
                        });
                    }
                }
                row.postedRefId = ledger?._id;
                postedCount += 1;
            } else if (batch.importType === 'gstr2b_itc') {
                const ex = {
                    supplierGstin: row.raw.supplierGstin,
                    supplierName: row.raw.supplierName,
                    supplierInvoiceNo: row.raw.invoiceNumber,
                    invoiceDate: row.raw.invoiceDate,
                    taxableAmount: row.raw.taxableValue,
                    cgst: row.raw.cgst,
                    sgst: row.raw.sgst,
                    igst: row.raw.igst,
                    cess: row.raw.cess,
                    grandTotal: row.raw.invoiceValue,
                    gstType: row.raw.igst > 0 ? 'IGST' : 'CGST / SGST',
                    items: [],
                    _gstr2bImport: true,
                    _noStock: true,
                };
                const resolved = await resolveSupplierFromExtract(ex, batch.companyId);
                const pendingMasters = [];
                if (!resolved.supplier) {
                    pendingMasters.push(buildPendingSupplierPayload(ex, batch.companyId, batch.financialYear));
                }
                const draft = await ScanEntryDraft.create({
                    companyId: batch.companyId,
                    financialYear: batch.financialYear,
                    moduleType: 'purchase_invoice',
                    originalFileName: `GSTR-2B-${row.raw.invoiceNumber}`,
                    fileType: 'gstr2b',
                    status: 'needs_review',
                    uploadedBy: userId,
                    extractedData: ex,
                    mappedSupplierId: resolved.supplier?._id || null,
                    pendingMasters,
                    userRemarks: 'GSTR-2B ITC import — accounting draft only, no stock',
                });
                await autoMapDraft(draft._id);
                row.postedRefId = draft._id;
                postedCount += 1;
            } else if (batch.importType === 'tally_day_book') {
                const ex = {
                    billDate: parseExcelDate(row.raw.date) || new Date(),
                    grandTotal: Number(row.raw.amount) || 0,
                    narration: row.raw.narration || row.raw.partyName || '',
                    vendorName: row.raw.partyName || row.raw.debitLedger || row.raw.creditLedger || '',
                    voucherTypeLabel: row.raw.voucherType || 'Journal',
                    externalVoucherNo: row.raw.voucherNo || '',
                    debitLedger: row.raw.debitLedger,
                    creditLedger: row.raw.creditLedger,
                    _tallyDayBook: true,
                };
                const draft = await ScanEntryDraft.create({
                    companyId: batch.companyId,
                    financialYear: batch.financialYear,
                    moduleType: 'expense_bill',
                    originalFileName: `Tally-${row.raw.voucherNo || row.rowNumber}`,
                    fileType: 'tally',
                    status: 'needs_review',
                    uploadedBy: userId,
                    extractedData: ex,
                    userRemarks: 'Tally Day Book import — confirm ledgers and post from review',
                });
                row.postedRefId = draft._id;
                postedCount += 1;
            }
        } catch (err) {
            row.postError = err.message || 'Post failed';
            postErrors.push({ rowNumber: row.rowNumber, error: row.postError });
        }
    }

    batch.rows = batch.rows.map((r) => {
        const updated = selected.find((s) => s.rowNumber === r.rowNumber);
        return updated || r;
    });
    batch.postedCount = postedCount;
    batch.postedBy = userId;
    batch.status = postErrors.length ? 'failed' : 'posted';
    await batch.save();

    await logImportHistory({
        companyId: batch.companyId,
        financialYear: batch.financialYear,
        importType: batch.importType,
        sourceModule: 'smart_import',
        batchId: batch._id,
        fileName: batch.fileName,
        recordsTotal: selected.length,
        recordsSuccess: postedCount,
        recordsFailed: postErrors.length,
        status: batch.status,
        dryRun: false,
        failedRows: postErrors.map((e) => ({ rowNumber: e.rowNumber, reason: e.error })),
        errorSummary: postErrors.length ? `${postErrors.length} row(s) failed` : '',
        userId,
    });

    return { batch, postedCount, postErrors, ledgersCreated: batch.importType === 'tally_ledger_master' ? postedCount : 0 };
}
