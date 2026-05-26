import crypto from 'crypto';
import httpStatus from 'http-status';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Gstr2bData } from '../models/gstr2bData.model.js';
import { GstrImportBatch } from '../models/gstrImportBatch.model.js';
import { ApiError } from '../utils/ApiError.js';
import {
    DEFAULT_GST_MATCH_CONFIG,
    classifyGstMatchStatus,
    getMonthDateRange,
    isRcmRecord,
    normalizeInvoiceRef,
    scoreGstPair,
} from './gstReconciliation/gstReconEngine.js';
import { parseGstrFile } from './gstReconciliation/parseGstrPortal.js';
import { logGstReconAudit } from './gstReconciliation/gstReconAudit.service.js';

export { DEFAULT_GST_MATCH_CONFIG };

function fileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function booksPurchaseFilter(financialYear, month) {
    const { startDate, endDate } = getMonthDateRange(financialYear, month);
    return {
        financialYear,
        invoiceDate: { $gte: startDate, $lte: endDate },
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    };
}

/**
 * Import GSTR-2A/2B records (JSON array or pre-parsed).
 */
export async function importGstrData(records, financialYear, month, source, userId, options = {}) {
    const { fileName = '', fileHash: hashIn, importBatchId = null, allowDuplicateFile = false } = options;

    if (hashIn && !allowDuplicateFile) {
        const dup = await GstrImportBatch.findOne({ financialYear, month, source, fileHash: hashIn }).lean();
        if (dup) {
            await logGstReconAudit({
                action: 'ImportDuplicateWarning',
                financialYear,
                month,
                source,
                userId,
                importBatchId: dup._id,
                reason: 'Duplicate file hash',
            });
            throw new ApiError(
                httpStatus.CONFLICT,
                `This file was already imported for ${month}/${financialYear} (${dup.fileName}).`,
            );
        }
    }

    // Build upsert operations for all valid records in one bulkWrite call.
    // This replaces N×2 individual Atlas roundtrips with a single network call.
    const results = { total: records.length, created: 0, updated: 0, skipped: 0 };
    const bulkOps = [];

    for (const rec of records) {
        if (!rec.supplierGstin || !rec.invoiceNumber) {
            results.skipped++;
            continue;
        }
        bulkOps.push({
            updateOne: {
                filter: {
                    financialYear,
                    month,
                    source,
                    supplierGstin: String(rec.supplierGstin).trim().toUpperCase(),
                    invoiceNumber: String(rec.invoiceNumber).trim(),
                },
                update: {
                    $set: {
                        financialYear,
                        month,
                        source,
                        supplierGstin: String(rec.supplierGstin).trim().toUpperCase(),
                        invoiceNumber: String(rec.invoiceNumber).trim(),
                        invoiceDate: new Date(rec.invoiceDate),
                        supplierName: rec.supplierName || '',
                        invoiceType: rec.invoiceType || 'R',
                        taxableValue: Number(rec.taxableValue || 0),
                        igst: Number(rec.igst || 0),
                        cgst: Number(rec.cgst || 0),
                        sgst: Number(rec.sgst || 0),
                        cess: Number(rec.cess || 0),
                        totalTax: Number(rec.totalTax || 0),
                        invoiceValue: Number(rec.invoiceValue || 0),
                        itcAvailable: rec.itcAvailable || 'Yes',
                        isReverseCharge: isRcmRecord(rec),
                        importBatchId,
                        updatedBy: userId,
                    },
                },
                upsert: true,
            },
        });
    }

    if (bulkOps.length) {
        const bulkResult = await Gstr2bData.bulkWrite(bulkOps, { ordered: false });
        results.created = bulkResult.upsertedCount || 0;
        results.updated = bulkResult.modifiedCount || 0;
    }

    await logGstReconAudit({
        action: 'Import',
        financialYear,
        month,
        source,
        userId,
        importBatchId,
        payload: { ...results, fileName },
    });
    return results;
}

export async function importGstrFromFile({ buffer, fileName, financialYear, month, source, userId }) {
    let records = [];
    let fileType = 'json';
    let sheetSummary = [];
    let parseErrors = [];
    let parseTotalSkipped = 0;

    if (fileName.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
        records = Array.isArray(parsed) ? parsed : [parsed];
        fileType = 'json';
    } else {
        const parsed = await parseGstrFile(buffer, fileName);
        records = parsed.records;
        fileType = parsed.fileType;
        sheetSummary = parsed.sheetSummary || [];
        parseErrors = parsed.errors || [];
        parseTotalSkipped = parsed.totalSkipped || 0;

        if (!records.length) {
            // Build a descriptive error from sheet-level diagnostics
            let detail = 'No valid rows parsed from file.';
            if (fileType === 'unknown') {
                detail = `Unsupported file format. Please upload an Excel (.xlsx) or CSV file downloaded from the GST portal.`;
            } else if (sheetSummary.length === 0) {
                detail = 'The file appears to be empty or corrupt.';
            } else {
                const reasons = sheetSummary
                    .filter((s) => !s.headerDetected)
                    .map((s) => `Sheet "${s.sheetName}": ${s.reason || 'Header not detected'}`)
                    .join('; ');
                if (reasons) {
                    detail = `Header row could not be detected. ${reasons}. Ensure the file is a standard GST portal GSTR-2B download.`;
                } else {
                    const allSkipped = sheetSummary.every((s) => s.parsed === 0);
                    if (allSkipped) detail = 'All rows were skipped — check that the file contains valid invoice data (non-empty GSTIN/invoice number/date columns).';
                }
            }
            throw new ApiError(httpStatus.BAD_REQUEST, detail);
        }
    }

    const hash = fileHash(buffer);

    // ── Duplicate-file guard ──────────────────────────────────────────────────
    // Check BEFORE creating the batch so we don't create a ghost batch that
    // immediately blocks its own import on the inner importGstrData call.
    // Only block on successfully Completed batches; Failed batches are retryable.
    const existingBatch = await GstrImportBatch.findOne({
        financialYear,
        month,
        source,
        fileHash: hash,
        status: 'Completed',
    }).lean();
    if (existingBatch) {
        await logGstReconAudit({
            action: 'ImportDuplicateWarning',
            financialYear,
            month,
            source,
            userId,
            importBatchId: existingBatch._id,
            reason: 'Duplicate file hash',
        });
        throw new ApiError(
            httpStatus.CONFLICT,
            `This file was already imported successfully for ${month}/${financialYear} (${existingBatch.fileName}).`,
        );
    }

    // Remove any leftover Failed batch for this file so the import starts clean
    await GstrImportBatch.deleteMany({ financialYear, month, source, fileHash: hash, status: 'Failed' });

    const batch = await GstrImportBatch.create({
        financialYear,
        month,
        source,
        fileName,
        fileHash: hash,
        fileType,
        importedBy: userId,
        rowCount: records.length,
        status: 'Completed',
    });

    try {
        // allowDuplicateFile=true — dedup already handled above; skip inner check
        const results = await importGstrData(records, financialYear, month, source, userId, {
            fileName,
            importBatchId: batch._id,
            allowDuplicateFile: true,
        });
        batch.rowCount = records.length;
        batch.created = results.created;
        batch.updated = results.updated;
        batch.skipped = results.skipped;
        batch.status = 'Completed';
        await batch.save();
        return {
            batch,
            ...results,
            sheetSummary,
            parseErrors: parseErrors.slice(0, 50),
            totalParsed: records.length,
            totalSkipped: parseTotalSkipped + results.skipped,
        };
    } catch (e) {
        batch.status = 'Failed';
        batch.errorMessage = e.message;
        await batch.save();
        throw e;
    }
}

export async function listImportBatches({ financialYear, month, source, limit = 50 }) {
    const q = {};
    if (financialYear) q.financialYear = financialYear;
    if (month) q.month = month;
    if (source) q.source = source;
    return GstrImportBatch.find(q).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * GSTIN-wise summary (books vs portal for period).
 */
export async function reconcileGstinWise(financialYear, month, source) {
    const purchases = await PurchaseInvoice.aggregate([
        { $match: booksPurchaseFilter(financialYear, month) },
        {
            $group: {
                _id: '$supplierGstin',
                supplierName: { $first: '$supplierName' },
                booksCount: { $sum: 1 },
                booksTaxableValue: { $sum: '$totalTaxableAmount' },
                booksIgst: { $sum: '$totalIgst' },
                booksCgst: { $sum: '$totalCgst' },
                booksSgst: { $sum: '$totalSgst' },
                booksTotalGst: { $sum: '$totalTax' },
                booksRcmCount: { $sum: { $cond: ['$reverseCharge', 1, 0] } },
                booksRcmGst: { $sum: { $cond: ['$reverseCharge', '$totalTax', 0] } },
            },
        },
    ]);

    const portalData = await Gstr2bData.aggregate([
        { $match: { financialYear, month, source } },
        {
            $group: {
                _id: '$supplierGstin',
                supplierName: { $first: '$supplierName' },
                portalCount: { $sum: 1 },
                portalTaxableValue: { $sum: '$taxableValue' },
                portalIgst: { $sum: '$igst' },
                portalCgst: { $sum: '$cgst' },
                portalSgst: { $sum: '$sgst' },
                portalTotalGst: { $sum: '$totalTax' },
                portalRcmCount: { $sum: { $cond: ['$isReverseCharge', 1, 0] } },
                portalRcmGst: { $sum: { $cond: ['$isReverseCharge', '$totalTax', 0] } },
            },
        },
    ]);

    const combinedMap = new Map();

    const emptySide = () => ({
        count: 0,
        taxableValue: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        totalGst: 0,
        rcmCount: 0,
        rcmGst: 0,
    });

    purchases.forEach((p) => {
        if (!p._id) return;
        combinedMap.set(p._id, {
            gstin: p._id,
            supplierName: p.supplierName,
            books: {
                count: p.booksCount,
                taxableValue: p.booksTaxableValue,
                igst: p.booksIgst,
                cgst: p.booksCgst,
                sgst: p.booksSgst,
                totalGst: p.booksTotalGst,
                rcmCount: p.booksRcmCount,
                rcmGst: p.booksRcmGst,
            },
            portal: emptySide(),
            difference: { taxableValue: p.booksTaxableValue, totalGst: p.booksTotalGst },
        });
    });

    portalData.forEach((p) => {
        if (!p._id) return;
        if (combinedMap.has(p._id)) {
            const entry = combinedMap.get(p._id);
            entry.portal = {
                count: p.portalCount,
                taxableValue: p.portalTaxableValue,
                igst: p.portalIgst,
                cgst: p.portalCgst,
                sgst: p.portalSgst,
                totalGst: p.portalTotalGst,
                rcmCount: p.portalRcmCount,
                rcmGst: p.portalRcmGst,
            };
            entry.difference = {
                taxableValue: entry.books.taxableValue - p.portalTaxableValue,
                totalGst: entry.books.totalGst - p.portalTotalGst,
            };
        } else {
            combinedMap.set(p._id, {
                gstin: p._id,
                supplierName: p.supplierName,
                books: emptySide(),
                portal: {
                    count: p.portalCount,
                    taxableValue: p.portalTaxableValue,
                    igst: p.portalIgst,
                    cgst: p.portalCgst,
                    sgst: p.portalSgst,
                    totalGst: p.portalTotalGst,
                    rcmCount: p.portalRcmCount,
                    rcmGst: p.portalRcmGst,
                },
                difference: { taxableValue: -p.portalTaxableValue, totalGst: -p.portalTotalGst },
            });
        }
    });

    return Array.from(combinedMap.values()).map((row) => {
        let status = 'Matched';
        if (row.books.count > 0 && row.portal.count === 0) status = 'Books Only';
        else if (row.books.count === 0 && row.portal.count > 0) status = '2B Only';
        else if (Math.abs(row.difference.totalGst) > DEFAULT_GST_MATCH_CONFIG.taxTolerance) status = 'Difference';
        return { ...row, status };
    });
}

/**
 * Bill-to-bill reconciliation with scoring metadata.
 */
export async function reconcileBillToBill(financialYear, month, source, matchConfig = {}, options = {}) {
    const { persistStatus = true } = options;
    const config = { ...DEFAULT_GST_MATCH_CONFIG, ...matchConfig };
    const { startDate, endDate } = getMonthDateRange(financialYear, month);

    const booksInvoices = await PurchaseInvoice.find({
        ...booksPurchaseFilter(financialYear, month),
        invoiceDate: { $gte: startDate, $lte: endDate },
    }).lean();

    const portalInvoices = await Gstr2bData.find({ financialYear, month, source }).lean();

    const results = [];
    const matchedPortalIds = new Set();

    for (const bInv of booksInvoices) {
        const bNum = normalizeInvoiceRef(bInv.supplierInvoiceNo);
        let best = null;
        let bestScore = 0;

        for (const p of portalInvoices) {
            if (matchedPortalIds.has(String(p._id))) continue;
            if (p.supplierGstin !== bInv.supplierGstin) continue;
            if (normalizeInvoiceRef(p.invoiceNumber) !== bNum) continue;

            const scored = scoreGstPair(
                {
                    supplierGstin: bInv.supplierGstin,
                    supplierInvoiceNo: bInv.supplierInvoiceNo,
                    invoiceDate: bInv.invoiceDate,
                    totalTaxableAmount: bInv.totalTaxableAmount,
                    totalTax: bInv.totalTax,
                },
                p,
                config,
            );
            if (scored.score > bestScore) {
                bestScore = scored.score;
                best = { portal: p, scored };
            }
        }

        if (best) {
            matchedPortalIds.add(String(best.portal._id));
            const pMatch = best.portal;
            const status = classifyGstMatchStatus(bInv, pMatch, config);
            const row = buildBillRow(bInv, pMatch, status, best.scored);
            row.purchaseId = bInv._id;
            row.portalId = pMatch._id;
            row.isRcm = Boolean(bInv.reverseCharge || pMatch.isReverseCharge);
            results.push(row);

            if (persistStatus) {
                await Gstr2bData.updateOne(
                    { _id: pMatch._id },
                    { reconciliationStatus: status, matchingPurchaseId: bInv._id },
                );
            }
        } else {
            results.push({
                ...buildBillRow(bInv, null, 'Books Only', null),
                purchaseId: bInv._id,
                isRcm: Boolean(bInv.reverseCharge),
            });
        }
    }

    for (const p of portalInvoices) {
        if (matchedPortalIds.has(String(p._id))) continue;
        results.push({
            ...buildBillRow(null, p, '2B Only', null),
            portalId: p._id,
            isRcm: Boolean(p.isReverseCharge),
        });
        if (persistStatus) {
            await Gstr2bData.updateOne({ _id: p._id }, { reconciliationStatus: '2B Only', matchingPurchaseId: null });
        }
    }

    if (persistStatus) {
        await logGstReconAudit({
            action: 'Reconcile',
            financialYear,
            month,
            source,
            payload: { rowCount: results.length },
        });
    }

    return results;
}

function buildBillRow(bInv, pMatch, status, scored) {
    return {
        status,
        confidence: scored?.score ?? 0,
        matchReasons: scored?.reasons ?? [],
        dateDifferenceDays: scored?.days ?? 0,
        gstin: bInv?.supplierGstin || pMatch?.supplierGstin,
        supplierName: bInv?.supplierName || pMatch?.supplierName,
        books: bInv
            ? {
                billNo: bInv.supplierInvoiceNo,
                billDate: bInv.invoiceDate,
                taxableValue: bInv.totalTaxableAmount,
                igst: bInv.totalIgst,
                cgst: bInv.totalCgst,
                sgst: bInv.totalSgst,
                totalGst: bInv.totalTax,
                invoiceValue: bInv.grandTotal,
                reverseCharge: bInv.reverseCharge,
            }
            : null,
        portal: pMatch
            ? {
                billNo: pMatch.invoiceNumber,
                billDate: pMatch.invoiceDate,
                taxableValue: pMatch.taxableValue,
                igst: pMatch.igst,
                cgst: pMatch.cgst,
                sgst: pMatch.sgst,
                totalGst: pMatch.totalTax,
                invoiceValue: pMatch.invoiceValue,
                itcAvailable: pMatch.itcAvailable,
                isReverseCharge: pMatch.isReverseCharge,
            }
            : null,
        difference: {
            taxableValue: (bInv?.totalTaxableAmount || 0) - (pMatch?.taxableValue || 0),
            totalGst: (bInv?.totalTax || 0) - (pMatch?.totalTax || 0),
        },
    };
}

export async function getRcmSummary(financialYear, month, source) {
    const rows = await reconcileBillToBill(financialYear, month, source, {}, { persistStatus: false });
    const summary = {
        booksRcmGst: 0,
        portalRcmGst: 0,
        matchedRcmGst: 0,
        booksOnlyRcmGst: 0,
        portalOnlyRcmGst: 0,
        booksRcmCount: 0,
        portalRcmCount: 0,
    };

    rows.forEach((row) => {
        if (!row.isRcm) return;
        const bTax = row.books?.totalGst || 0;
        const pTax = row.portal?.totalGst || 0;
        if (row.books?.reverseCharge || row.isRcm) {
            summary.booksRcmGst += bTax;
            summary.booksRcmCount += row.books ? 1 : 0;
        }
        if (row.portal?.isReverseCharge) {
            summary.portalRcmGst += pTax;
            summary.portalRcmCount += row.portal ? 1 : 0;
        }
        if (row.status === 'Fully Matched' || row.status === 'Matched with Rounding') {
            summary.matchedRcmGst += pTax;
        } else if (row.status === 'Books Only') {
            summary.booksOnlyRcmGst += bTax;
        } else if (row.status === '2B Only') {
            summary.portalOnlyRcmGst += pTax;
        }
    });

    return summary;
}

export async function manualOverrideStatus({ portalId, status, remarks, userId }) {
    const doc = await Gstr2bData.findByIdAndUpdate(
        portalId,
        { manualStatus: status, reconciliationStatus: status, remarks, updatedBy: userId },
        { new: true },
    );
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Portal record not found');
    await logGstReconAudit({
        action: 'ManualOverride',
        financialYear: doc.financialYear,
        month: doc.month,
        source: doc.source,
        userId,
        payload: { portalId, status, remarks },
    });
    return doc;
}
