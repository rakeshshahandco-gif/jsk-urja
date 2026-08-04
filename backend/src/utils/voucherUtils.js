import httpStatus from 'http-status';
import { ApiError } from './ApiError.js';
import { VoucherType } from '../models/voucherType.model.js';
import { Voucher } from '../models/voucher.model.js';
import { getFYFromDate, getShortFY } from './fyUtils.js';

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export const calculateVoucherGstTotals = (items, gstType) => {
    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    const updatedItems = items.map(item => {
        const taxableAmount = r2(item.amount);
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
        let gstRate = Number(item.gstRate || 0);

        if (gstRate > 0) {
            if (isIGST) {
                igstAmount = r2(taxableAmount * gstRate / 100);
            } else {
                cgstAmount = r2(taxableAmount * (gstRate / 2) / 100);
                sgstAmount = r2(taxableAmount * (gstRate / 2) / 100);
            }
        }

        totalTaxable += taxableAmount;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return {
            ...item,
            taxableAmount,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalAmount: r2(taxableAmount + cgstAmount + sgstAmount + igstAmount)
        };
    });

    const rawTotal = r2(totalTaxable + totalCgst + totalSgst + totalIgst);
    const grandTotal = Math.round(rawTotal);
    const roundOff = r2(grandTotal - rawTotal);

    return {
        updatedItems,
        totalTaxableAmount: r2(totalTaxable),
        totalCgst: r2(totalCgst),
        totalSgst: r2(totalSgst),
        totalIgst: r2(totalIgst),
        totalTax: r2(totalCgst + totalSgst + totalIgst),
        roundOff,
        grandTotal
    };
};

export const getNextVoucherNo = async (typeId, date, session) => {
    const fy = getFYFromDate(date || new Date());
    const shortFy = getShortFY(fy);

    // Atomic increment
    const vType = await VoucherType.findByIdAndUpdate(
        typeId,
        { $inc: { nextNumber: 1 } },
        { session, new: false }
    );

    if (!vType) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher type not found');

    const num = vType.nextNumber;
    
    let prefix = String(vType.prefix || '').replace(/\/+$/, '');
    if (!prefix) {
        const naturePrefixes = {
            'Receipt': 'RV',
            'Payment': 'PV',
            'Contra': 'CV',
            'Journal': 'JV',
            'Expense': 'EV',
            'Debit Note': 'DN',
            'Credit Note': 'CN',
            'Sales': 'SI',
            'Purchase': 'PI'
        };
        prefix = naturePrefixes[vType.nature] || 'V';
    }

    const vNo = `${shortFy}/${prefix}/${String(num).padStart(4, '0')}`;
    
    const exists = await Voucher.findOne({ financialYear: fy, voucherType: typeId, voucherNo: vNo }).session(session);
    if (exists) {
        return getNextVoucherNo(typeId, date, session);
    }

    return vNo;
};
