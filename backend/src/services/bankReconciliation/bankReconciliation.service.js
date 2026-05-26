import crypto from 'crypto';
import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { BankStatementImport } from '../../models/bankStatementImport.model.js';
import { BankStatementLine } from '../../models/bankStatementLine.model.js';
import { BankReconciliation } from '../../models/bankReconciliation.model.js';
import { CashBankAccount } from '../../models/cashBankAccount.model.js';
import { LedgerEntry } from '../../models/ledgerEntry.model.js';
import { getFYFromDate } from '../../utils/fyUtils.js';
import { parseStatementFile } from './parseStatement.js';
import { fetchBookLines } from './bookLines.service.js';
import { suggestMatches, DEFAULT_MATCH_CONFIG, DATE_TOLERANCE_PRESETS } from './matchingEngine.js';
import { fileContentHash, lineFingerprint, findDuplicateLines } from './duplicateDetection.js';
import { logBankReconAudit } from './bankReconAudit.service.js';

export { DATE_TOLERANCE_PRESETS, DEFAULT_MATCH_CONFIG };

function resolveDateTolerance(matchConfig = {}) {
    const preset = matchConfig.dateTolerancePreset;
    if (preset && DATE_TOLERANCE_PRESETS[preset] != null) {
        return { ...DEFAULT_MATCH_CONFIG, ...matchConfig, dateToleranceDays: DATE_TOLERANCE_PRESETS[preset] };
    }
    if (matchConfig.dateToleranceDays != null) {
        return { ...DEFAULT_MATCH_CONFIG, ...matchConfig };
    }
    return { ...DEFAULT_MATCH_CONFIG, ...matchConfig };
}

export async function importStatement({
    buffer,
    fileName,
    cashBankAccountId,
    financialYear,
    userId,
    skipDuplicateRows = false,
}) {
    const cb = await CashBankAccount.findById(cashBankAccountId);
    if (!cb) throw new ApiError(httpStatus.NOT_FOUND, 'Bank account not found');
    if (cb.accountType !== 'Bank') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Select a Bank type cash/bank account');
    }

    const fileHash = fileContentHash(buffer);
    const priorSameFile = await BankStatementImport.findOne({
        cashBankAccountId,
        fileHash,
        status: 'Completed',
    }).lean();
    if (priorSameFile) {
        await logBankReconAudit({
            action: 'ImportDuplicateWarning',
            cashBankAccountId,
            userId,
            payload: { fileName, fileHash, priorImportId: priorSameFile._id },
            reason: 'Same file hash already imported for this bank account',
        });
        throw new ApiError(
            httpStatus.CONFLICT,
            `This file was already imported on ${new Date(priorSameFile.createdAt).toLocaleDateString('en-IN')} (${priorSameFile.fileName}). Use a different export or delete the prior batch.`,
        );
    }

    const { lines, fileType } = await parseStatementFile(buffer, fileName);
    if (!lines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'No valid rows parsed from file');

    const { duplicates, warnings } = await findDuplicateLines(BankStatementLine, cashBankAccountId, lines);
    if (duplicates.length && !skipDuplicateRows) {
        throw new ApiError(
            httpStatus.CONFLICT,
            `Duplicate statement lines detected (${duplicates.length}). Re-import with skipDuplicateRows=true to import only new lines.`,
        );
    }

    const fy = financialYear || getFYFromDate(lines[0].txnDate);
    const dates = lines.map((l) => l.txnDate).filter(Boolean);
    const dateFrom = new Date(Math.min(...dates.map((d) => d.getTime())));
    const dateTo = new Date(Math.max(...dates.map((d) => d.getTime())));

    const imp = await BankStatementImport.create({
        cashBankAccountId,
        financialYear: fy,
        fileName,
        fileHash,
        fileType,
        importedBy: userId,
        rowCount: 0,
        status: 'Processing',
        duplicateFileWarning: false,
        dateFrom,
        dateTo,
    });

    const dupFp = new Set(duplicates.map((d) => lineFingerprint({
        cashBankAccountId,
        txnDate: d.line.txnDate,
        amount: d.line.amount,
        drCr: d.line.drCr,
        narration: d.line.narration,
        utrRef: d.line.utrRef,
        chequeNo: d.line.chequeNo,
    })));

    const docs = [];
    for (const l of lines) {
        const fp = lineFingerprint({
            cashBankAccountId,
            txnDate: l.txnDate,
            amount: l.amount,
            drCr: l.drCr,
            narration: l.narration,
            utrRef: l.utrRef,
            chequeNo: l.chequeNo,
        });
        if (skipDuplicateRows && dupFp.has(fp)) continue;

        docs.push({
            importId: imp._id,
            cashBankAccountId,
            ...l,
            sourceFileName: fileName,
            lineFingerprint: fp,
            matchStatus: dupFp.has(fp) ? 'Duplicate' : 'Unmatched',
            duplicateOf: dupFp.has(fp) ? duplicates.find((d) => lineFingerprint({
                cashBankAccountId,
                txnDate: d.line.txnDate,
                amount: d.line.amount,
                drCr: d.line.drCr,
                narration: d.line.narration,
                utrRef: d.line.utrRef,
                chequeNo: d.line.chequeNo,
            }) === fp)?.existingId : null,
        });
    }

    if (!docs.length) {
        imp.status = 'Failed';
        imp.errorMessage = 'All rows were duplicates';
        await imp.save();
        throw new ApiError(httpStatus.BAD_REQUEST, 'No new lines to import (all duplicates)');
    }

    await BankStatementLine.insertMany(docs);
    imp.rowCount = docs.length;
    imp.status = 'Completed';
    if (warnings.length) imp.duplicateFileWarning = true;
    await imp.save();

    await logBankReconAudit({
        action: 'Import',
        cashBankAccountId,
        importId: imp._id,
        userId,
        payload: { fileName, fileHash, rowCount: docs.length, warnings },
    });

    return { import: imp, rowCount: docs.length, warnings, skippedDuplicates: lines.length - docs.length };
}

export async function listImports({ cashBankAccountId, limit = 50 }) {
    const q = {};
    if (cashBankAccountId) q.cashBankAccountId = cashBankAccountId;
    return BankStatementImport.find(q).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function deleteImportBatch(importId, userId) {
    const imp = await BankStatementImport.findById(importId);
    if (!imp) throw new ApiError(httpStatus.NOT_FOUND, 'Import batch not found');

    const reconciled = await BankStatementLine.countDocuments({
        importId,
        matchStatus: 'Reconciled',
    });
    if (reconciled > 0) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Cannot delete batch: ${reconciled} line(s) already reconciled. Undo reconciliations first.`,
        );
    }

    await BankStatementLine.deleteMany({ importId });
    await imp.deleteOne();

    await logBankReconAudit({
        action: 'DeleteImport',
        cashBankAccountId: imp.cashBankAccountId,
        importId,
        userId,
        previousState: { fileName: imp.fileName, rowCount: imp.rowCount },
    });

    return { deleted: true };
}

export async function getWorkspace({
    cashBankAccountId,
    importId,
    from,
    to,
    financialYear,
    matchConfig,
}) {
    const config = resolveDateTolerance(matchConfig);
    const bookLines = await fetchBookLines({ cashBankAccountId, from, to, financialYear });

    const bankFilter = { cashBankAccountId };
    if (importId) bankFilter.importId = importId;
    if (from || to) {
        bankFilter.txnDate = {};
        if (from) bankFilter.txnDate.$gte = new Date(from);
        if (to) bankFilter.txnDate.$lte = new Date(to);
    }

    const bankLines = await BankStatementLine.find(bankFilter).sort({ txnDate: -1 }).limit(2000).lean();
    const suggestions = suggestMatches(bookLines, bankLines, config);

    for (const s of suggestions.filter((x) => !x.isCombo && x.matchKind === 'Auto')) {
        await BankStatementLine.updateOne(
            { _id: s.bankLineId, matchStatus: { $in: ['Unmatched', 'Possible', 'Suggested'] } },
            { $set: { matchStatus: 'AutoMatched' } },
        );
    }
    for (const s of suggestions.filter((x) => !x.isCombo && x.matchKind === 'Possible')) {
        await BankStatementLine.updateOne(
            { _id: s.bankLineId, matchStatus: 'Unmatched' },
            { $set: { matchStatus: 'Suggested' } },
        );
    }

    const refreshedBank = await BankStatementLine.find(bankFilter).sort({ txnDate: -1 }).limit(2000).lean();

    const approved = await BankReconciliation.find({
        cashBankAccountId,
        status: 'Approved',
        isUndone: false,
    })
        .sort({ reconciliationDate: -1 })
        .limit(500)
        .lean();

    return { bookLines, bankLines, suggestions, config, reconciled: approved };
}

export async function runMatching(params) {
    const ws = await getWorkspace(params);
    for (const s of ws.suggestions.filter((x) => !x.isCombo && x.matchKind === 'Auto')) {
        await BankStatementLine.updateOne(
            { _id: s.bankLineId, matchStatus: { $in: ['Unmatched', 'Possible', 'Suggested'] } },
            { $set: { matchStatus: 'AutoMatched' } },
        );
        await logBankReconAudit({
            action: 'AutoMatch',
            cashBankAccountId: params.cashBankAccountId,
            bankLineId: s.bankLineId,
            userId: params.userId,
            payload: { bookRefId: s.bookRefId, confidence: s.confidence },
        });
    }
    for (const s of ws.suggestions.filter((x) => !x.isCombo && x.matchKind === 'Possible')) {
        await BankStatementLine.updateOne(
            { _id: s.bankLineId, matchStatus: 'Unmatched' },
            { $set: { matchStatus: 'Suggested' } },
        );
    }
    return getWorkspace(params);
}

async function sumAllocatedForBank(bankLineId, excludeId = null) {
    const q = { bankLineId, status: 'Approved', isUndone: false };
    if (excludeId) q._id = { $ne: excludeId };
    const rows = await BankReconciliation.find(q).select('allocatedAmount').lean();
    return rows.reduce((s, r) => s + (r.allocatedAmount || 0), 0);
}

async function sumAllocatedForBook(bookRefId, excludeId = null) {
    const q = { bookRefId, status: 'Approved', isUndone: false };
    if (excludeId) q._id = { $ne: excludeId };
    const rows = await BankReconciliation.find(q).select('allocatedAmount').lean();
    return rows.reduce((s, r) => s + (r.allocatedAmount || 0), 0);
}

export async function approveMatches({ pairs, userId, remarks = '', groupId }) {
    if (!Array.isArray(pairs) || !pairs.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'pairs[] is required');
    }

    const gid = groupId || crypto.randomUUID();
    const results = [];
    const bankAlloc = {};

    for (const p of pairs) {
        const {
            bankLineId,
            bookRefId,
            matchKind = 'Manual',
            confidence = 100,
            allocatedAmount,
            matchPriority = 0,
            matchReasons = [],
            dateDifferenceDays = 0,
            narrationSimilarity = 0,
            remarks: r,
        } = p;

        const bankLine = await BankStatementLine.findById(bankLineId);
        if (!bankLine) throw new ApiError(httpStatus.NOT_FOUND, `Bank line ${bankLineId} not found`);
        if (['Reconciled', 'Duplicate'].includes(bankLine.matchStatus)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Bank line already reconciled or duplicate');
        }

        const entry = await LedgerEntry.findById(bookRefId);
        if (!entry) throw new ApiError(httpStatus.NOT_FOUND, 'Book entry not found');

        const alloc = allocatedAmount != null ? Number(allocatedAmount) : bankLine.amount;
        if (alloc <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'allocatedAmount must be positive');

        const priorBank = await sumAllocatedForBank(bankLineId);
        bankAlloc[bankLineId] = (bankAlloc[bankLineId] || 0) + alloc;
        if (priorBank + bankAlloc[bankLineId] > bankLine.amount + 0.01) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Total allocated exceeds bank line amount');
        }

        const alreadyBook = await sumAllocatedForBook(bookRefId);
        if (alreadyBook + alloc > entry.amount + 0.01) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Allocated amount exceeds open book entry amount');
        }

        const dup = await BankReconciliation.findOne({
            bankLineId,
            bookRefId,
            status: 'Approved',
            isUndone: false,
        });
        if (dup) throw new ApiError(httpStatus.CONFLICT, 'Duplicate reconciliation for this pair');

        const rec = await BankReconciliation.create({
            bankLineId,
            cashBankAccountId: bankLine.cashBankAccountId,
            bookRefId,
            bookType: 'LedgerEntry',
            voucherId: entry.voucherId,
            voucherNo: entry.voucherNo,
            matchKind,
            matchPriority,
            matchReasons,
            confidence,
            allocatedAmount: alloc,
            dateDifferenceDays,
            narrationSimilarity,
            bankTxnDate: bankLine.txnDate,
            bookVoucherDate: entry.date,
            reconciliationDate: new Date(),
            groupId: gid,
            status: 'Approved',
            remarks: r || remarks,
            approvedBy: userId,
            approvedAt: new Date(),
            createdBy: userId,
        });

        results.push(rec);
    }

    for (const bankLineId of Object.keys(bankAlloc)) {
        const bankLine = await BankStatementLine.findById(bankLineId);
        const total = await sumAllocatedForBank(bankLineId);
        if (Math.abs(total - bankLine.amount) <= 0.01) {
            bankLine.matchStatus = 'Reconciled';
            bankLine.reconciledAt = new Date();
            bankLine.reconciledBy = userId;
            await bankLine.save();
        }
    }

    await logBankReconAudit({
        action: 'Approve',
        cashBankAccountId: results[0]?.cashBankAccountId,
        userId,
        payload: { groupId: gid, pairCount: pairs.length },
        newState: results.map((r) => ({ id: r._id, bankLineId: r.bankLineId, bookRefId: r.bookRefId })),
    });

    return results;
}

export async function approveComboMatch({ bankLineId, allocations, userId, remarks, matchKind = 'Manual', confidence = 70 }) {
    const pairs = allocations.map((a) => ({
        bankLineId,
        bookRefId: a.bookRefId,
        allocatedAmount: a.amount,
        matchKind,
        confidence,
        matchReasons: ['one_to_many_manual'],
    }));
    return approveMatches({ pairs, userId, remarks });
}

export async function rejectSuggestion({ bankLineId, userId }) {
    const line = await BankStatementLine.findById(bankLineId);
    if (!line) throw new ApiError(httpStatus.NOT_FOUND, 'Bank line not found');
    if (line.matchStatus === 'Reconciled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot reject reconciled line');
    }
    line.matchStatus = 'Rejected';
    await line.save();
    await BankReconciliation.updateMany({ bankLineId, status: 'Pending' }, { status: 'Rejected' });
    await logBankReconAudit({ action: 'Reject', cashBankAccountId: line.cashBankAccountId, bankLineId, userId });
    return line;
}

export async function ignoreBankLine(bankLineId, userId) {
    const line = await BankStatementLine.findById(bankLineId);
    if (!line) throw new ApiError(httpStatus.NOT_FOUND, 'Bank line not found');
    line.matchStatus = 'Ignored';
    await line.save();
    if (userId) {
        await logBankReconAudit({ action: 'Ignore', cashBankAccountId: line.cashBankAccountId, bankLineId, userId });
    }
    return line;
}

export async function markBankCharge(bankLineId, userId) {
    const line = await BankStatementLine.findById(bankLineId);
    if (!line) throw new ApiError(httpStatus.NOT_FOUND, 'Bank line not found');
    line.matchStatus = 'BankCharge';
    await line.save();
    if (userId) {
        await logBankReconAudit({ action: 'BankCharge', cashBankAccountId: line.cashBankAccountId, bankLineId, userId });
    }
    return line;
}

export async function undoReconciliation(reconciliationId, userId, reason = '') {
    const rec = await BankReconciliation.findById(reconciliationId);
    if (!rec) throw new ApiError(httpStatus.NOT_FOUND, 'Reconciliation not found');
    if (rec.isUndone || rec.status !== 'Approved') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot undo this reconciliation');
    }

    const prev = rec.toObject();
    rec.status = 'Undone';
    rec.isUndone = true;
    rec.undoneAt = new Date();
    rec.undoneBy = userId;
    rec.undoReason = reason || '';
    await rec.save();

    const bankLine = await BankStatementLine.findById(rec.bankLineId);
    if (bankLine) {
        const remaining = await sumAllocatedForBank(rec.bankLineId);
        if (remaining < bankLine.amount - 0.01) {
            bankLine.matchStatus = 'Unmatched';
            bankLine.reconciledAt = null;
            bankLine.reconciledBy = null;
            await bankLine.save();
        }
    }

    await logBankReconAudit({
        action: 'Undo',
        cashBankAccountId: rec.cashBankAccountId,
        bankLineId: rec.bankLineId,
        reconciliationId: rec._id,
        userId,
        previousState: prev,
        reason,
    });

    return rec;
}

export async function manualLink({ bankLineId, bookRefId, userId, remarks, confidence = 100, allocatedAmount }) {
    return approveMatches({
        pairs: [{
            bankLineId,
            bookRefId,
            matchKind: 'Manual',
            confidence,
            allocatedAmount,
            matchReasons: ['manual_link'],
        }],
        userId,
        remarks,
    });
}

export async function listImportLines(importId, { page = 1, limit = 100, matchStatus }) {
    const q = { importId };
    if (matchStatus) q.matchStatus = matchStatus;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        BankStatementLine.find(q).sort({ txnDate: -1 }).skip(skip).limit(limit).lean(),
        BankStatementLine.countDocuments(q),
    ]);
    return { data, meta: { total, page, limit } };
}

export async function listReconciled({ cashBankAccountId, from, to, limit = 500 }) {
    const q = { cashBankAccountId, status: 'Approved', isUndone: false };
    if (from || to) {
        q.reconciliationDate = {};
        if (from) q.reconciliationDate.$gte = new Date(from);
        if (to) q.reconciliationDate.$lte = new Date(to);
    }
    return BankReconciliation.find(q).sort({ reconciliationDate: -1 }).limit(limit).lean();
}
