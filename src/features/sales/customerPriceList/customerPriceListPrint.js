const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN');
};
const dash = (v) => (v && String(v).trim() ? String(v).trim() : '—');

export function isFilledRate(line) {
    const v = line?.finalRate;
    if (v === undefined || v === null || String(v).trim() === '') return false;
    return Number.isFinite(Number(v));
}

export function formatQtyBreakLabel(line) {
    const rawUom = String(line?.uom || 'pcs').trim();
    const unit = !rawUom || rawUom.toUpperCase() === 'NOS' ? 'pcs' : rawUom.toLowerCase();
    const min = Number(line?.minQty) || 0;
    if (!min) return 'Any qty';
    if (min === 1) return unit === 'pcs' ? 'Sample / 1 pc' : `Sample / 1 ${unit}`;
    return `${min}+ ${unit}`;
}

export function openCustomerPriceListPrint({ priceList, company }) {
    const pl = priceList;
    const co = company || {};
    const addr = [co.address, co.city, co.state, co.pincode].filter(Boolean).join(', ');
    const contact = [co.email, co.phone, co.websiteUrl].filter(Boolean).join('  |  ');
    const logo = co.logoUrl
        ? `<img src="${co.logoUrl}" alt="logo" style="max-height:${co.logoHeight || 56}px;max-width:160px;object-fit:contain;" />`
        : '';
    const filled = (pl.lines || []).filter(isFilledRate);
    const groups = [];
    const index = new Map();
    for (const line of filled) {
        const key = String(line.itemId || line.itemCode || line.productName || '');
        if (!index.has(key)) {
            index.set(key, groups.length);
            groups.push({
                productName: line.productName,
                modelNo: line.modelNo,
                description: line.description,
                itemCode: line.itemCode,
                lines: [],
            });
        }
        groups[index.get(key)].lines.push(line);
    }
    const blocks = groups.map((g) => {
        const rows = g.lines.map((line) => `
            <tr>
                <td>${formatQtyBreakLabel(line)}</td>
                <td class="num">${inr(line.finalRate)}</td>
            </tr>`).join('');
        return `
        <div class="prod">
            <div><span class="k">Product:</span> ${dash(g.productName)}</div>
            <div><span class="k">Model No.:</span> ${dash(g.modelNo)}</div>
            <div><span class="k">Item Code:</span> ${dash(g.itemCode)}</div>
            <div><span class="k">Description:</span> ${dash(g.description)}</div>
            <table class="items">
                <thead><tr><th>Quantity</th><th class="num">Rate</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${pl.priceListNo} ${pl.version}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
  .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #0f766e; padding-bottom: 12px; }
  .co { font-size: 18px; font-weight: 800; letter-spacing: .02em; }
  .brand { color: #0f766e; font-weight: 700; margin-top: 2px; }
  .muted { color: #64748b; font-size: 11px; margin-top: 4px; }
  h1 { font-size: 16px; margin: 18px 0 8px; color: #0f766e; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .meta td { padding: 3px 8px 3px 0; vertical-align: top; }
  .meta .k { color: #64748b; width: 140px; font-weight: 700; text-transform: uppercase; font-size: 10px; }
  .prod { margin: 16px 0 8px; }
  .prod .k { color: #64748b; font-weight: 700; font-size: 10px; text-transform: uppercase; margin-right: 6px; }
  table.items { width: 100%; max-width: 420px; border-collapse: collapse; margin-top: 8px; }
  table.items th { background: #0f766e; color: #fff; text-align: left; padding: 8px; font-size: 11px; }
  table.items td { border-bottom: 1px solid #e5e7eb; padding: 8px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .terms { margin-top: 18px; }
  .terms h2 { font-size: 12px; color: #0f766e; margin-bottom: 6px; }
  .sign { margin-top: 48px; text-align: right; }
  .sign .line { margin-top: 40px; font-weight: 700; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <div class="top">
    <div>
      ${logo}
      <div class="co">${co.companyName || 'JSK INNOVATIVE TECHNOLOGY PVT. LTD.'}</div>
      <div class="brand">${co.tradeName ? `${co.tradeName}  ·  ` : ''}JSK URJA</div>
      <div class="muted">${addr}</div>
      <div class="muted">${[co.gstNumber ? `GSTIN: ${co.gstNumber}` : '', contact].filter(Boolean).join('  |  ')}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:800;color:#0f766e">CUSTOMER PRICE LIST</div>
      <div style="font-size:16px;font-weight:800">${pl.priceListNo || ''} ${pl.version || ''}</div>
      <div class="muted">Status: ${pl.status || ''}</div>
    </div>
  </div>
  <h1>Customer</h1>
  <table class="meta">
    <tr><td class="k">Price List No.</td><td>${pl.priceListNo || ''} ${pl.version || ''}</td>
        <td class="k">Date</td><td>${dmy(pl.date)}</td></tr>
    <tr><td class="k">Valid Upto</td><td>${pl.validUpto ? dmy(pl.validUpto) : 'Open'}</td>
        <td class="k">Effective From</td><td>${dmy(pl.effectiveFrom)}</td></tr>
    <tr><td class="k">Customer Name</td><td>${pl.customerName || '—'}</td>
        <td class="k">Customer Company</td><td>${pl.customerCompany || '—'}</td></tr>
    <tr><td class="k">City</td><td>${pl.customerCity || '—'}</td>
        <td class="k">GSTIN</td><td>${pl.customerGstin || '—'}</td></tr>
    <tr><td class="k">Contact</td><td>${pl.customerContactName || pl.customerPhone || '—'}</td>
        <td class="k">Mobile / WhatsApp</td><td>${[pl.customerPhone, pl.customerWhatsapp].filter(Boolean).join(' / ') || '—'}</td></tr>
  </table>
  ${blocks}
  <div class="terms">
    <h2>Terms</h2>
    <div><strong>GST:</strong> ${pl.gstTreatment === 'Included' ? 'GST included in unit price' : 'GST extra as applicable'}</div>
    <div><strong>Freight:</strong> ${pl.freightTerms || '—'}</div>
    <div><strong>Payment:</strong> ${pl.paymentTerms || '—'}</div>
    <div><strong>Delivery:</strong> ${pl.deliveryTerms || '—'}</div>
    <div><strong>Warranty:</strong> ${pl.warrantyNotes || '—'}</div>
    <div><strong>Price validity:</strong> ${pl.validUpto ? `Valid up to ${dmy(pl.validUpto)}` : 'Until revised'}</div>
    <div><strong>Remarks:</strong> ${pl.remarks || '—'}</div>
  </div>
  <div class="sign">
    <div>Authorized Signatory</div>
    <div class="line">${co.companyName || ''}</div>
  </div>
</body></html>`;

    const w = window.open('', '', 'width=900,height=800');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
}
