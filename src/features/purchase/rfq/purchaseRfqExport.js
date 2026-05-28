import * as XLSX from 'xlsx';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '');

export function exportRfqExcel(rfq, { forSupplier = false } = {}) {
    const headerRows = [
        ['Purchase RFQ / Enquiry'],
        ['RFQ No.', rfq.rfqNumber || ''],
        ['RFQ Date', fmtDate(rfq.rfqDate)],
        ['Required By', fmtDate(rfq.requiredByDate)],
        ['Department', rfq.department || ''],
        ['Requested By', rfq.requestedBy || ''],
        ['Phone', rfq.requestedByPhone || ''],
        ['Email', rfq.requestedByEmail || ''],
        ['Priority', rfq.priority || ''],
        ['Remarks', rfq.remarks || ''],
        [],
    ];

    const itemHeaders = forSupplier
        ? [
            'Sr',
            'Item Code',
            'Item Description',
            'Specification',
            'HSN',
            'Required Qty',
            'UOM',
            'Your Quoted Rate',
            'Discount %',
            'Delivery Days',
            'Make/Brand Offered',
            'Supplier Remarks',
        ]
        : [
            'Sr',
            'Item Code',
            'Item Description',
            'Specification',
            'HSN',
            'Required Qty',
            'UOM',
            'Expected Rate (optional)',
            'Last Purchase Rate',
            'Current Stock',
            'Required Delivery',
            'Line Remarks',
        ];

    const itemRows = (rfq.items || []).map((it, i) => {
        if (forSupplier) {
            return [
                i + 1,
                it.itemCode || '',
                it.itemName || '',
                it.specification || '',
                it.hsnCode || '',
                it.requiredQty ?? '',
                it.uom || '',
                '',
                '',
                '',
                '',
                '',
            ];
        }
        return [
            i + 1,
            it.itemCode || '',
            it.itemName || '',
            it.specification || '',
            it.hsnCode || '',
            it.requiredQty ?? '',
            it.uom || '',
            it.expectedRate > 0 ? it.expectedRate : '',
            it.lastPurchaseRate ?? '',
            it.currentStock ?? '',
            it.requiredDeliveryDate ? fmtDate(it.requiredDeliveryDate) : '',
            it.remarks || '',
        ];
    });

    const ws = XLSX.utils.aoa_to_sheet([...headerRows, itemHeaders, ...itemRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, forSupplier ? 'Supplier Fill' : 'RFQ Items');

    if ((rfq.suppliers || []).length > 0) {
        const supRows = [
            ['Supplier Name', 'Contact', 'Mobile', 'Email', 'City', 'GSTIN'],
            ...(rfq.suppliers || []).map((s) => [
                s.supplierName || '',
                s.contactPerson || '',
                s.mobile || '',
                s.email || '',
                s.city || '',
                s.gstin || '',
            ]),
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(supRows), 'Suppliers');
    }

    const suffix = forSupplier ? '_Supplier_Template' : '';
    XLSX.writeFile(wb, `RFQ_${rfq.rfqNumber || 'draft'}${suffix}.xlsx`);
}

export function printRfqPdf(rfq) {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
        window.print();
        return;
    }
    const itemsHtml = (rfq.items || [])
        .map(
            (it, i) => `<tr>
        <td>${i + 1}</td>
        <td>${it.itemCode || ''}</td>
        <td>${it.itemName || ''}</td>
        <td>${it.requiredQty ?? ''}</td>
        <td>${it.uom || ''}</td>
        <td>${it.expectedRate > 0 ? it.expectedRate : ''}</td>
        <td></td>
        <td></td>
    </tr>`
        )
        .join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${rfq.rfqNumber}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;font-size:12px}
      h1{font-size:18px;margin:0 0 8px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px;text-align:left}
      th{background:#f3f4f6}
      .meta{margin-bottom:12px;line-height:1.6}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Purchase RFQ — ${rfq.rfqNumber || ''}</h1>
    <div class="meta">
      <div>Date: ${fmtDate(rfq.rfqDate)} &nbsp;|&nbsp; Required by: ${fmtDate(rfq.requiredByDate)}</div>
      <div>Department: ${rfq.department || '—'} &nbsp;|&nbsp; Requested by: ${rfq.requestedBy || '—'}</div>
      <div>Phone: ${rfq.requestedByPhone || '—'} &nbsp;|&nbsp; Email: ${rfq.requestedByEmail || '—'}</div>
      ${rfq.remarks ? `<div>Remarks: ${rfq.remarks}</div>` : ''}
    </div>
    <p><strong>Items — please fill “Supplier Rate” and “Delivery Days” columns if returning this form.</strong></p>
    <table>
      <thead><tr>
        <th>#</th><th>Code</th><th>Description</th><th>Qty</th><th>UOM</th>
        <th>Ref. Rate</th><th>Supplier Rate</th><th>Delivery Days</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p style="margin-top:20px;font-size:11px;color:#666">Suppliers may return rates by email/WhatsApp with this RFQ number.</p>
    <button onclick="window.print()">Print / Save as PDF</button>
    </body></html>`);
    w.document.close();
}
