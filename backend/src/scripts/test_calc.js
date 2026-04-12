const r2 = (n) => Math.round((n || 0) * 100) / 100;

const calculateInvoiceTotals = (items, gstType, freightAmount = 0, freightGstRate = 0) => {
    let subTotal = 0, totalDiscount = 0, totalTaxable = 0;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    items.forEach(item => {
        const lineTaxable = r2(item.qty * item.rate - item.discountAmount);
        subTotal += r2(item.qty * item.rate);
        totalDiscount += r2(item.discountAmount);
        totalTaxable += lineTaxable;

        if (isIGST) {
            totalIgst += r2(lineTaxable * item.gstRate / 100);
        } else {
            totalCgst += r2(lineTaxable * (item.gstRate / 2) / 100);
            totalSgst += r2(lineTaxable * (item.gstRate / 2) / 100);
        }
    });

    const totalTax = r2(totalIgst + totalCgst + totalSgst);
    const rawGrandTotal = r2(totalTaxable + totalTax + freightAmount);
    const grandTotal = Math.round(rawGrandTotal);
    
    return {
        subTotal: r2(subTotal),
        totalTaxableAmount: r2(totalTaxable),
        totalIgst: r2(totalIgst),
        totalCgst: r2(totalCgst),
        totalSgst: r2(totalSgst),
        totalTax: r2(totalTax),
        grandTotal
    };
};

const items = [
    {
        qty: 1000,
        rate: 7.5,
        discountAmount: 0,
        gstRate: 18
    }
];

console.log(calculateInvoiceTotals(items, 'CGST / SGST'));
