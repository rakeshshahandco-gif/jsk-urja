import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Gstr2bData } from '../models/gstr2bData.model.js';
import mongoose from 'mongoose';

/**
 * Import GSTR-2A/2B data into the system
 */
export async function importGstrData(records, financialYear, month, source, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const results = {
            total: records.length,
            created: 0,
            updated: 0,
            skipped: 0
        };

        for (const rec of records) {
            if (!rec.supplierGstin || !rec.invoiceNumber) {
                results.skipped++;
                continue;
            }

            const query = {
                supplierGstin: rec.supplierGstin,
                invoiceNumber: rec.invoiceNumber,
                invoiceDate: new Date(rec.invoiceDate)
            };

            const updateData = {
                financialYear,
                month,
                source,
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
                updatedBy: userId
            };

            const existing = await Gstr2bData.findOneAndUpdate(query, updateData, { upsert: true, new: true, session });
            if (existing.createdAt.getTime() === existing.updatedAt.getTime()) {
                results.created++;
            } else {
                results.updated++;
            }
        }

        await session.commitTransaction();
        return results;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}

/**
 * Mode 1: GSTIN-wise Reconciliation
 * Aggregates Books vs 2B by Supplier
 */
export async function reconcileGstinWise(financialYear, month, source) {
    // 1. Get Purchase Data for period
    const purchases = await PurchaseInvoice.aggregate([
        { $match: { financialYear, isDeleted: { $ne: true }, status: { $ne: 'Cancelled' } } },
        // Add month filtering if possible, or filter by date
        {
            $group: {
                _id: "$supplierGstin",
                supplierName: { $first: "$supplierName" },
                booksCount: { $sum: 1 },
                booksTaxableValue: { $sum: "$totalTaxableAmount" },
                booksIgst: { $sum: "$totalIgst" },
                booksCgst: { $sum: "$totalCgst" },
                booksSgst: { $sum: "$totalSgst" },
                booksTotalGst: { $sum: "$totalTax" }
            }
        }
    ]);

    // 2. Get 2B Data for period
    const portalData = await Gstr2bData.aggregate([
        { $match: { financialYear, month, source } },
        {
            $group: {
                _id: "$supplierGstin",
                supplierName: { $first: "$supplierName" },
                portalCount: { $sum: 1 },
                portalTaxableValue: { $sum: "$taxableValue" },
                portalIgst: { $sum: "$igst" },
                portalCgst: { $sum: "$cgst" },
                portalSgst: { $sum: "$sgst" },
                portalTotalGst: { $sum: "$totalTax" }
            }
        }
    ]);

    // 3. Merge results
    const combinedMap = new Map();

    purchases.forEach(p => {
        combinedMap.set(p._id, {
            gstin: p._id,
            supplierName: p.supplierName,
            books: {
                count: p.booksCount,
                taxableValue: p.booksTaxableValue,
                igst: p.booksIgst,
                cgst: p.booksCgst,
                sgst: p.booksSgst,
                totalGst: p.booksTotalGst
            },
            portal: { count: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, totalGst: 0 },
            difference: { taxableValue: p.booksTaxableValue, totalGst: p.booksTotalGst }
        });
    });

    portalData.forEach(p => {
        if (combinedMap.has(p._id)) {
            const entry = combinedMap.get(p._id);
            entry.portal = {
                count: p.portalCount,
                taxableValue: p.portalTaxableValue,
                igst: p.portalIgst,
                cgst: p.portalCgst,
                sgst: p.portalSgst,
                totalGst: p.portalTotalGst
            };
            entry.difference = {
                taxableValue: entry.books.taxableValue - p.portalTaxableValue,
                totalGst: entry.books.totalGst - p.portalTotalGst
            };
        } else {
            combinedMap.set(p._id, {
                gstin: p._id,
                supplierName: p.supplierName,
                books: { count: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, totalGst: 0 },
                portal: {
                    count: p.portalCount,
                    taxableValue: p.portalTaxableValue,
                    igst: p.portalIgst,
                    cgst: p.portalCgst,
                    sgst: p.portalSgst,
                    totalGst: p.portalTotalGst
                },
                difference: { taxableValue: -p.portalTaxableValue, totalGst: -p.portalTotalGst }
            });
        }
    });

    return Array.from(combinedMap.values()).map(row => {
        let status = 'Matched';
        if (row.books.count > 0 && row.portal.count === 0) status = 'Books Only';
        else if (row.books.count === 0 && row.portal.count > 0) status = '2B Only';
        else if (Math.abs(row.difference.totalGst) > 2) status = 'Difference';
        return { ...row, status };
    });
}

/**
 * Mode 2: Bill-to-bill Reconciliation
 * Match each invoice one by one
 */
export async function reconcileBillToBill(financialYear, month, source, tolerance = 2) {
    // Get date range for month
    const yr = month >= '04' ? financialYear.split('-')[0] : financialYear.split('-')[1];
    const startDate = new Date(yr, parseInt(month) - 1, 1);
    const endDate = new Date(yr, parseInt(month), 0, 23, 59, 59);

    // 1. Get Books Data
    const booksInvoices = await PurchaseInvoice.find({
        invoiceDate: { $gte: startDate, $lte: endDate },
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' }
    }).lean();

    // 2. Get Portal Data
    const portalInvoices = await Gstr2bData.find({
        financialYear, month, source
    }).lean();

    const results = [];
    const matchedPortalIds = new Set();

    // Try matching books to portal
    for (const bInv of booksInvoices) {
        // Normalizing bill number for better matching (remove non-alphanumeric)
        const bNum = (bInv.supplierInvoiceNo || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        
        // Find match in portal
        const pMatch = portalInvoices.find(p => {
            if (matchedPortalIds.has(p._id.toString())) return false;
            if (p.supplierGstin !== bInv.supplierGstin) return false;
            
            const pNum = p.invoiceNumber.replace(/[^a-z0-9]/gi, '').toLowerCase();
            return pNum === bNum;
        });

        if (pMatch) {
            matchedPortalIds.add(pMatch._id.toString());
            const diffTax = Math.abs((bInv.totalTax || 0) - (pMatch.totalTax || 0));
            const diffTaxable = Math.abs((bInv.totalTaxableAmount || 0) - (pMatch.taxableValue || 0));
            
            let status = 'Fully Matched';
            if (diffTax > tolerance || diffTaxable > tolerance) status = 'Mismatch';
            else if (diffTax > 0 || diffTaxable > 0) status = 'Matched with Rounding';

            results.push({
                status,
                gstin: bInv.supplierGstin,
                supplierName: bInv.supplierName,
                books: {
                    billNo: bInv.supplierInvoiceNo,
                    billDate: bInv.invoiceDate,
                    taxableValue: bInv.totalTaxableAmount,
                    igst: bInv.totalIgst,
                    cgst: bInv.totalCgst,
                    sgst: bInv.totalSgst,
                    totalGst: bInv.totalTax,
                    invoiceValue: bInv.grandTotal
                },
                portal: {
                    billNo: pMatch.invoiceNumber,
                    billDate: pMatch.invoiceDate,
                    taxableValue: pMatch.taxableValue,
                    igst: pMatch.igst,
                    cgst: pMatch.cgst,
                    sgst: pMatch.sgst,
                    totalGst: pMatch.totalTax,
                    invoiceValue: pMatch.invoiceValue
                },
                difference: {
                    taxableValue: bInv.totalTaxableAmount - pMatch.taxableValue,
                    totalGst: (bInv.totalTax || 0) - (pMatch.totalTax || 0)
                },
                purchaseId: bInv._id
            });
        } else {
            results.push({
                status: 'Books Only',
                gstin: bInv.supplierGstin,
                supplierName: bInv.supplierName,
                books: {
                    billNo: bInv.supplierInvoiceNo,
                    billDate: bInv.invoiceDate,
                    taxableValue: bInv.totalTaxableAmount,
                    igst: bInv.totalIgst,
                    cgst: bInv.totalCgst,
                    sgst: bInv.totalSgst,
                    totalGst: bInv.totalTax,
                    invoiceValue: bInv.grandTotal
                },
                portal: null,
                difference: { taxableValue: bInv.totalTaxableAmount, totalGst: bInv.totalTax },
                purchaseId: bInv._id
            });
        }
    }

    // Add remaining portal records as "2B Only"
    portalInvoices.forEach(p => {
        if (!matchedPortalIds.has(p._id.toString())) {
            results.push({
                status: '2B Only',
                gstin: p.supplierGstin,
                supplierName: p.supplierName,
                books: null,
                portal: {
                    billNo: p.invoiceNumber,
                    billDate: p.invoiceDate,
                    taxableValue: p.taxableValue,
                    igst: p.igst,
                    cgst: p.cgst,
                    sgst: p.sgst,
                    totalGst: p.totalTax,
                    invoiceValue: p.invoiceValue
                },
                difference: { taxableValue: -p.taxableValue, totalGst: -p.totalTax },
                portalId: p._id
            });
        }
    });

    return results;
}
