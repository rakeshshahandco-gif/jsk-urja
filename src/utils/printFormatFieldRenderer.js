/** Read-only display values for print format designer preview (no calculations). */

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
const fmtCur = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtNum = (n) => Number(n || 0).toFixed(2);

export function getFieldDisplayValue(fieldId, docType, doc, company) {
    const isSO = docType === 'Sales Order';
    const gstApplicable = doc?.gstApplicable !== false;
    const isIGST = doc?.gstType === 'IGST';

    switch (fieldId) {
        case 'logo':
            return '[Logo]';
        case 'companyName':
            return company?.companyName || '—';
        case 'companyAddress':
            return [company?.address, company?.city, company?.pincode, company?.state].filter(Boolean).join(', ') || '—';
        case 'companyGstin':
            return gstApplicable && company?.gstNumber ? `GSTIN: ${company.gstNumber}` : '';
        case 'companyPhone':
            return [company?.phone && `Tel: ${company.phone}`, company?.email && `Email: ${company.email}`].filter(Boolean).join(' | ') || '—';
        case 'documentTitle':
            return isSO ? (gstApplicable ? 'SALES ORDER' : 'SALES ORDER (NON-GST)') : (doc?.seriesId?.isEstimate ? 'ESTIMATE' : (gstApplicable ? 'TAX INVOICE' : 'SALES INVOICE'));
        case 'soNumber':
            return doc?.soNumber || '—';
        case 'invoiceNumber':
            return doc?.displayInvoiceNumber || doc?.invoiceNumber || '—';
        case 'soDate':
            return fmt(doc?.soDate);
        case 'invoiceDate':
            return fmt(doc?.invoiceDate);
        case 'deliveryDate':
            return fmt(doc?.deliveryDate);
        case 'customerPO':
            return doc?.customerPO || 'VERBAL';
        case 'orderCategory':
            return doc?.orderCategory || 'Order';
        case 'dispatchThrough':
            return doc?.dispatchThrough || '—';
        case 'lrNumber':
            return doc?.lrNumber || doc?.docketNumber || '—';
        case 'placeOfSupply':
            return doc?.placeOfSupply || doc?.billingState || '—';
        case 'buyerOrderNo':
            return doc?.buyerOrderNo || '—';
        case 'paymentTerms':
            return doc?.paymentTerms || '—';
        case 'customerName':
            return doc?.customerName || '—';
        case 'customerAddress':
            return doc?.billingAddress || doc?.shippingAddress || '—';
        case 'customerGstin':
            return doc?.customerGstin || doc?.customerGst || '';
        case 'customerPhone':
            return doc?.customerPhone || '';
        case 'customerEmail':
            return doc?.customerEmail || '';
        case 'shippingAddress':
            return doc?.shippingAddress || doc?.billingAddress || '—';
        case 'totalBeforeTax':
            return isSO ? `Total Before Tax: ${fmtCur(doc?.totalAmount)}` : '';
        case 'totalTaxableAmount':
        case 'totalTaxableValue':
            return `Total Taxable: ${fmtCur(doc?.totalTaxableAmount ?? doc?.taxableAmount ?? doc?.totalAmount)}`;
        case 'freight':
            return Number(doc?.freightAmount || 0) > 0 ? `Freight: ${fmtCur(doc.freightAmount)}` : '';
        case 'cgst':
            if (!gstApplicable || isIGST) return '';
            return doc?.totalCgst != null ? `CGST: ${fmtCur(doc.totalCgst)}` : '';
        case 'sgst':
            if (!gstApplicable || isIGST) return '';
            return doc?.totalSgst != null ? `SGST: ${fmtCur(doc.totalSgst)}` : '';
        case 'igst':
            if (!gstApplicable || !isIGST) return '';
            return doc?.totalIgst != null ? `IGST: ${fmtCur(doc.totalIgst)}` : '';
        case 'totalGst':
            return gstApplicable && doc?.totalGst != null ? `Total GST: ${fmtCur(doc.totalGst)}` : '';
        case 'roundOff':
            return doc?.roundOff != null && doc.roundOff !== 0 ? `Round Off: ${fmtNum(doc.roundOff)}` : '';
        case 'grandTotal':
            return `Grand Total: ${fmtCur(doc?.roundedTotal ?? doc?.grandTotal)}`;
        case 'amountInWords':
            return doc?.amountInWords ? `${doc.amountInWords} ONLY` : '';
        case 'remarks':
            return doc?.remarks || '—';
        case 'terms':
            return doc?.terms || (isSO
                ? 'Material once dispatched will not be taken back.'
                : 'Goods once sold will not be taken back.');
        case 'bankDetails':
            return [
                company?.bankName && `Bank: ${company.bankName}`,
                company?.accountNo && `A/c: ${company.accountNo}`,
                company?.ifscCode && `IFSC: ${company.ifscCode}`,
            ].filter(Boolean).join(' | ') || '—';
        case 'signature':
            return `For ${company?.companyName || 'Company'} — Authorized Signatory`;
        default:
            return '';
    }
}

export function getColumnCellValue(colId, item, index, docType) {
    if (colId === 'sr') return index + 1;
    if (!item) return '—';
    switch (colId) {
        case 'itemCode':
            return item.itemCode || item.code || '—';
        case 'itemName':
            return item.itemName || item.description || '—';
        case 'description':
            return item.description || item.itemName || '—';
        case 'notes':
            return item.additionalNotes || item.notes || '—';
        case 'hsn':
            return item.hsnCode || item.hsn || '—';
        case 'uom':
            return item.uom || 'NOS';
        case 'qty':
            return docType === 'Sales Order' && item.uom ? `${item.qty ?? '—'} ${item.uom}` : (item.qty ?? '—');
        case 'rate':
            return fmtNum(item.rate);
        case 'discount':
            return item.discountAmount != null ? fmtNum(item.discountAmount) : (item.discount ? fmtNum(item.discount) : '—');
        case 'taxableAmount':
            return item.taxableAmount != null ? fmtNum(item.taxableAmount) : (item.amount != null ? fmtNum(item.amount) : '—');
        case 'gstPercent':
            return item.gstRate ?? item.taxRate ?? '—';
        case 'cgst':
            return fmtNum(item.cgstAmount ?? 0);
        case 'sgst':
            return fmtNum(item.sgstAmount ?? 0);
        case 'igst':
            return fmtNum(item.igstAmount ?? 0);
        case 'amount':
            return item.amount != null ? fmtNum(item.amount) : '—';
        default:
            return item[colId] ?? '—';
    }
}
