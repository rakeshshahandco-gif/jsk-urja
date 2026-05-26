import { TcsDeduction } from '../models/tcsDeduction.model.js';
import { TcsMasterSection } from '../models/tcsMasterSection.model.js';

/**
 * Determine applicable TCS section & amount for a given sale/receipt.
 */
export async function previewTcs({ sectionCode, saleAmount, buyerPan }) {
    const section = await TcsMasterSection.findOne({ sectionCode: sectionCode?.toUpperCase(), isActive: true }).lean();
    if (!section) return { applicable: false, reason: `Section ${sectionCode} not found or inactive` };

    if (section.thresholdAmount > 0 && saleAmount < section.thresholdAmount) {
        return { applicable: false, reason: `Sale amount below threshold of ${section.thresholdAmount}` };
    }

    const rate = !buyerPan ? (section.higherRate || section.rate * 2) : section.rate;
    const tcsAmount = +(saleAmount * rate / 100).toFixed(2);

    return {
        applicable: true,
        sectionCode: section.sectionCode,
        sectionDescription: section.description,
        rate,
        tcsAmount,
        panAvailable: !!buyerPan,
    };
}

/**
 * Quarterly TCS summary for return filing (27EQ).
 */
export async function getQuarterlySummary({ financialYear, quarter }) {
    const match = { financialYear };
    if (quarter) match.quarter = quarter;

    const rows = await TcsDeduction.aggregate([
        { $match: match },
        {
            $group: {
                _id: { section: '$section', quarter: '$quarter' },
                totalSale: { $sum: '$saleAmount' },
                totalTcs: { $sum: '$tcsAmount' },
                count: { $sum: 1 },
            },
        },
        { $sort: { '_id.quarter': 1, '_id.section': 1 } },
    ]);

    return rows.map(r => ({
        section: r._id.section,
        quarter: r._id.quarter,
        totalSale: r.totalSale,
        totalTcs: r.totalTcs,
        count: r.count,
    }));
}

/**
 * Buyer-wise TCS summary.
 */
export async function getBuyerWiseSummary({ financialYear }) {
    const rows = await TcsDeduction.aggregate([
        { $match: { financialYear } },
        {
            $group: {
                _id: { buyerLedgerId: '$buyerLedgerId', buyerName: '$buyerName', buyerPan: '$buyerPan' },
                totalSale: { $sum: '$saleAmount' },
                totalTcs: { $sum: '$tcsAmount' },
                sections: { $addToSet: '$section' },
            },
        },
        { $sort: { '_id.buyerName': 1 } },
    ]);

    return rows.map(r => ({
        buyerName: r._id.buyerName,
        buyerPan: r._id.buyerPan || 'N/A',
        sections: r.sections,
        totalSale: r.totalSale,
        totalTcs: r.totalTcs,
    }));
}
