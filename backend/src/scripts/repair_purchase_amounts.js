import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const numToWords = (num) => {
    if (num === 0) return 'Zero';
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numToWords(num % 100) : '');
    if (num < 100000) return numToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numToWords(num % 1000) : '');
    if (num < 10000000) return numToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numToWords(num % 100000) : '');
    return numToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numToWords(num % 10000000) : '');
};
const amountInWords = (amount) => {
    const whole = Math.floor(amount);
    const paise = Math.round((amount - whole) * 100);
    let words = 'Rupees ' + numToWords(whole);
    if (paise > 0) words += ' and ' + numToWords(paise) + ' Paise';
    return words + ' Only';
};

const calculateInvoiceTotals = (items, gstType, freightAmount = 0, freightGstRate = 0) => {
    let subTotal = 0, totalDiscount = 0, totalTaxable = 0;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    const updatedItems = items.map(item => {
        const itemQty = Number(item.qty || 0);
        const itemRate = Number(item.rate || 0);
        const itemDiscPercent = Number(item.discountPercent || 0);
        const itemGstRate = Number(item.gstRate || 0);

        const discountAmount = item.discountAmount !== undefined ? Number(item.discountAmount) : r2(itemQty * itemRate * itemDiscPercent / 100);
        const taxableAmount = r2(itemQty * itemRate - discountAmount);
        
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
        let cgstRate = 0, sgstRate = 0, igstRate = 0;

        if (isIGST) {
            igstRate = itemGstRate;
            igstAmount = r2(taxableAmount * igstRate / 100);
        } else {
            cgstRate = itemGstRate / 2;
            sgstRate = itemGstRate / 2;
            cgstAmount = r2(taxableAmount * cgstRate / 100);
            sgstAmount = r2(taxableAmount * sgstRate / 100);
        }

        const totalAmount = r2(taxableAmount + cgstAmount + sgstAmount + igstAmount);

        subTotal += r2(itemQty * itemRate);
        totalDiscount += discountAmount;
        totalTaxable += taxableAmount;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return {
            ...item.toObject ? item.toObject() : item,
            qty: itemQty,
            rate: itemRate,
            discountAmount,
            taxableAmount,
            cgstRate, cgstAmount,
            sgstRate, sgstAmount,
            igstRate, igstAmount,
            totalAmount
        };
    });

    const freightIgstAmt = isIGST ? r2(freightAmount * freightGstRate / 100) : 0;
    const freightCgstAmt = isIGST ? 0 : r2(freightAmount * (freightGstRate / 2) / 100);
    const freightSgstAmt = isIGST ? 0 : r2(freightAmount * (freightGstRate / 2) / 100);

    totalIgst += freightIgstAmt;
    totalCgst += freightCgstAmt;
    totalSgst += freightSgstAmt;

    const totalTax = r2(totalIgst + totalCgst + totalSgst);
    const rawGrandTotal = r2(totalTaxable + totalTax + freightAmount);
    const grandTotal = Math.round(rawGrandTotal);
    const roundOff = r2(grandTotal - rawGrandTotal);

    return {
        updatedItems,
        subTotal: r2(subTotal),
        totalDiscount: r2(totalDiscount),
        totalTaxableAmount: r2(totalTaxable),
        totalIgst: r2(totalIgst),
        totalCgst: r2(totalCgst),
        totalSgst: r2(totalSgst),
        totalTax: r2(totalTax),
        freightTotalGst: r2(freightIgstAmt + freightCgstAmt + freightSgstAmt),
        roundOff, 
        grandTotal, 
        amountInWords: amountInWords(grandTotal),
    };
};

async function repair() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected');

        const PI = mongoose.model('PurchaseInvoice', new mongoose.Schema({}, { strict: false }));
        
        const inv = await PI.findOne({ invoiceNumber: 'PI-202604-0002' });
        if (!inv) {
            console.log('Invoice not found');
            return;
        }

        console.log('Original Invoice:', inv.invoiceNumber, 'Grand Total:', inv.grandTotal);

        const totals = calculateInvoiceTotals(inv.items, inv.gstType, inv.freightAmount, inv.freightGstRate);
        
        const { updatedItems, ...headerTotals } = totals;

        await PI.findByIdAndUpdate(inv._id, {
            items: updatedItems,
            ...headerTotals
        });

        console.log('Repaired Invoice. New Grand Total:', headerTotals.grandTotal);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

repair();
