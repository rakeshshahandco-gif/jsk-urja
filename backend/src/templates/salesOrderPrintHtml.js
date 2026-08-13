/**
 * Sales Order PDF HTML — structural twin of frontend SalesOrderPrintDocument / SalesOrderPrintBlocks.
 * Layout metadata (blocks x/y/w/h) is applied via buildPdfFormatCss when a live custom format exists.
 * Do not change GST / totals / stock / accounting math here.
 */

const ITEMS_FIRST = 7;
const ITEMS_OTHERS = 15;

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB');
}

function fmtMoney(n) {
    return `₹ ${Number(n || 0).toFixed(2)}`;
}

function paginate(items = []) {
    const list = Array.isArray(items) ? items : [];
    const pages = [];
    if (list.length <= ITEMS_FIRST) {
        pages.push(list);
        return pages;
    }
    pages.push(list.slice(0, ITEMS_FIRST));
    let remaining = list.slice(ITEMS_FIRST);
    while (remaining.length > 0) {
        pages.push(remaining.slice(0, ITEMS_OTHERS));
        remaining = remaining.slice(ITEMS_OTHERS);
    }
    return pages;
}

function srNo(pageIdx, i) {
    if (pageIdx === 0) return i + 1;
    return ITEMS_FIRST + (pageIdx - 1) * ITEMS_OTHERS + i + 1;
}

function blockHtml(id, inner, extraStyle = '') {
    return `<div data-pf-block="${id}"${extraStyle ? ` style="${extraStyle}"` : ''}>${inner}</div>`;
}

function buildTotalsRows(so, gstApplicable, isIGST, gstRate) {
    const totalQty = (so.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    let html = `
      <tr style="background:#f5f5f5;">
        <td colspan="5" class="totals-label">Total Quantity:</td>
        <td style="text-align:center;font-weight:800;">${totalQty}</td>
        <td class="totals-label">Total Taxable</td>
        <td class="totals-value">${fmtMoney(so.totalAmount)}</td>
      </tr>`;
    if (Number(so.freightAmount || 0) > 0) {
        html += `<tr><td colspan="6" style="border:none;"></td><td class="totals-label">Freight</td><td class="totals-value">${fmtMoney(so.freightAmount)}</td></tr>`;
    }
    if (gstApplicable) {
        html += `<tr><td colspan="6" style="border:none;"></td><td class="totals-label">Taxable Amount</td><td class="totals-value">${fmtMoney((so.totalAmount || 0) + (so.freightAmount || 0))}</td></tr>`;
        if (isIGST) {
            html += `<tr><td colspan="6" style="border:none;"></td><td class="totals-label">IGST @ ${gstRate}%</td><td class="totals-value">${fmtMoney(so.totalIgst || so.totalGst)}</td></tr>`;
        } else {
            html += `<tr><td colspan="6" style="border:none;"></td><td class="totals-label">CGST @ ${gstRate / 2}%</td><td class="totals-value">${fmtMoney(so.totalCgst || (so.totalGst || 0) / 2)}</td></tr>`;
            html += `<tr><td colspan="6" style="border:none;"></td><td class="totals-label">SGST @ ${gstRate / 2}%</td><td class="totals-value">${fmtMoney(so.totalSgst || (so.totalGst || 0) / 2)}</td></tr>`;
        }
    }
    const grandTotal = so.roundedTotal || so.grandTotal || 0;
    html += `
      <tr><td colspan="6" style="border:none;"></td><td class="totals-label">Round Off</td><td class="totals-value">${Number(so.roundOff || 0).toFixed(2)}</td></tr>
      <tr class="rounded-total"><td colspan="6" style="border:none;background:#fff;"></td><td>Rounded Total:</td><td class="totals-value">${fmtMoney(grandTotal)}</td></tr>
      <tr><td colspan="6" style="border:none;"></td><td class="totals-label">In Words:</td><td style="font-size:7.5pt;font-style:italic;text-transform:capitalize;">${esc(so.amountInWords || '')}</td></tr>`;
    return html;
}

function buildStandaloneTotals(so, gstApplicable, isIGST, gstRate) {
    const grandTotal = so.roundedTotal || so.grandTotal || 0;
    let lines = `<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:3px;white-space:nowrap;"><span style="font-weight:700;">Total Item Amount</span><span>${fmtMoney(so.totalAmount)}</span></div>`;
    if (Number(so.freightAmount || 0) > 0) {
        lines += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;"><span style="font-weight:700;">Freight</span><span>${fmtMoney(so.freightAmount)}</span></div>`;
    }
    if (gstApplicable) {
        lines += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;"><span style="font-weight:700;">Taxable Amount</span><span>${fmtMoney((so.totalAmount || 0) + (so.freightAmount || 0))}</span></div>`;
        if (isIGST) {
            lines += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;"><span style="font-weight:700;">IGST @ ${gstRate}%</span><span>${fmtMoney(so.totalIgst || so.totalGst)}</span></div>`;
        } else {
            lines += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;"><span style="font-weight:700;">CGST @ ${gstRate / 2}%</span><span>${fmtMoney(so.totalCgst || (so.totalGst || 0) / 2)}</span></div>`;
            lines += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;"><span style="font-weight:700;">SGST @ ${gstRate / 2}%</span><span>${fmtMoney(so.totalSgst || (so.totalGst || 0) / 2)}</span></div>`;
        }
    }
    lines += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;"><span style="font-weight:700;">Round Off</span><span>${Number(so.roundOff || 0).toFixed(2)}</span></div>`;
    lines += `<div style="display:flex;justify-content:space-between;gap:12px;font-weight:900;margin-top:4px;border-top:1px solid #000;padding-top:4px;font-size:14px;white-space:nowrap;"><span>Grand Total</span><span>${fmtMoney(grandTotal)}</span></div>`;
    return lines;
}

function bankHtml(company = {}) {
    const bankName = company.bankName || 'BANK OF BARODA';
    const accountName = company.accountName || company.companyName || '';
    const accountNo = company.accountNo || company.bankAccountNo || '20260200001544';
    const ifsc = company.ifscCode || 'BARB0SHIBOR';
    const branch = company.branchName || 'SHIMPOLI';
    return `<div style="font-size:7.5pt;"><strong>BANK DETAILS</strong>
      <table style="border-collapse:collapse;margin-top:4px;">
        <tr><td>Bank Name</td><td>: <strong>${esc(bankName)}</strong></td></tr>
        ${accountName ? `<tr><td>A/C Name</td><td>: <strong>${esc(accountName)}</strong></td></tr>` : ''}
        <tr><td>A/C Number</td><td>: <strong>${esc(accountNo)}</strong></td></tr>
        <tr><td>IFSC Code</td><td>: <strong>${esc(ifsc)}</strong></td></tr>
        <tr><td>Branch</td><td>: <strong>${esc(branch)}</strong></td></tr>
      </table></div>`;
}

function termsHtml(so) {
    const body = so.terms
        ? esc(so.terms)
        : '1. Goods once sold will not be taken back.<br/>2. Subject to MUMBAI Jurisdiction.<br/>3. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';
    return `<div style="font-size:8pt;line-height:1.3;"><div style="font-weight:900;margin-bottom:4px;text-transform:uppercase;">Terms &amp; Conditions</div>${body}</div>`;
}

function approvalLinesHtml() {
    return `<div class="approval-lines">
      <div class="approval-line">PREPARED BY</div>
      <div class="approval-line">CHECKED BY</div>
      <div class="approval-line">AUTHORIZED BY</div>
      <div class="approval-line">RECEIVED BY</div>
    </div>`;
}

function signatureHtml(so, company, user) {
    const name = so.createdBy?.fullName || so.createdBy?.name || user?.name || 'Authorized User';
    const mobile = so.createdBy?.mobile || user?.mobile;
    return `<div class="signatory">
      <div class="signatory-title">For ${esc(company.companyName || 'JSK INNOVATIVE TECH PVT. LTD.')}</div>
      <div class="signatory-body">
        <div style="font-size:8pt;font-weight:800;text-transform:uppercase;">${esc(name)}</div>
        ${mobile ? `<div style="font-size:7pt;">Mob: ${esc(mobile)}</div>` : ''}
        <div style="width:90%;border-top:1px solid #000;margin-top:4px;padding-top:2px;font-size:7pt;font-weight:800;">AUTHORIZED SIGNATORY</div>
      </div>
    </div>`;
}

function itemRows(pageItems, pageIdx, srStart = null) {
    return pageItems.map((item, i) => {
        const sr = srStart != null ? Number(srStart) + i : srNo(pageIdx, i);
        return `
      <tr>
        <td style="text-align:center;" data-pf-col="sr">${sr}</td>
        <td data-pf-col="itemCode">${esc(item.itemCode || '—')}</td>
        <td style="font-weight:700;text-transform:uppercase;" data-pf-col="description">${esc(item.description || item.itemName || '')}</td>
        <td style="font-size:8pt;" data-pf-col="notes">${esc(item.additionalNotes || '—')}</td>
        <td style="text-align:center;font-size:8pt;" data-pf-col="hsn">${esc(item.hsnCode || '—')}</td>
        <td style="text-align:center;font-weight:700;" data-pf-col="qty">${esc(item.qty)} ${esc(item.uom || '')}</td>
        <td style="text-align:right;" data-pf-col="rate">${fmtMoney(item.rate)}</td>
        <td style="text-align:right;font-weight:700;" data-pf-col="amount">${fmtMoney(item.amount ?? (Number(item.qty) || 0) * (Number(item.rate) || 0))}</td>
      </tr>`;
    }).join('');
}

const FIRST_PAGE_BLOCKS = ['logo', 'companyDetails', 'documentTitle', 'documentNumber', 'customerDetails', 'documentDetails'];
const LAST_PAGE_BLOCKS = ['totalsBox', 'remarks', 'terms', 'bankDetails', 'signature'];

function paginateBlockItems(items = [], printFormat = null) {
    const list = Array.isArray(items) ? items : [];
    const tableH = Number(printFormat?.layout?.blocks?.itemTable?.height) || 100;
    const margins = printFormat?.margins || {};
    const marginTop = Number(margins.top ?? 10) || 10;
    const marginBottom = Number(margins.bottom ?? 10) || 10;
    const contentH = 297 - marginTop - marginBottom;
    const headerMm = 8;
    const rowMm = 7;
    const rowsFirst = Math.max(1, Math.floor(Math.max(tableH - headerMm, rowMm) / rowMm));
    const contTableH = Math.max(tableH, contentH - 28);
    const rowsOther = Math.max(1, Math.floor(Math.max(contTableH - headerMm, rowMm) / rowMm));
    if (list.length === 0) return [[]];
    if (list.length <= rowsFirst) return [list];
    const pages = [list.slice(0, rowsFirst)];
    let remaining = list.slice(rowsFirst);
    while (remaining.length > 0) {
        pages.push(remaining.slice(0, rowsOther));
        remaining = remaining.slice(rowsOther);
    }
    return pages;
}

function srStartForPage(pages, pageIdx) {
    let start = 1;
    for (let i = 0; i < pageIdx; i += 1) start += (pages[i] || []).length;
    return start;
}

/**
 * Absolute block-layout HTML used when live custom print format has layout.blocks.
 * Paginated to fixed A4 pages — same rules as frontend SalesOrderPrintDocument.
 */
export function buildSalesOrderBlockHtml({ so, company, user, logoBase64, blocks = {}, printFormat = null }) {
    const gstApplicable = so.gstApplicable !== false;
    const isIGST = so.gstType === 'IGST';
    const gstRate = Number(so.items?.[0]?.gstRate || so.items?.[0]?.taxPercent || 18);
    const pages = paginateBlockItems(so.items || [], printFormat || { layout: { blocks } });
    const totalPages = pages.length;
    const tableBlock = blocks.itemTable || {};

    const staticContent = {
        logo: logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : '',
        companyDetails: `<div class="company-details">
          <h1>${esc(company.companyName || 'JSK URJA')}</h1>
          <div class="company-addr">
            ${esc(company.address)}<br/>
            ${esc(company.city)} ${esc(company.state)}, India. Postal Code: ${esc(company.pincode)}. State Code: ${esc(company.stateCode || '')}<br/>
            ${(company.phone || company.email) ? `Phone: ${esc(company.phone || '')} Email: ${esc(company.email || '')}` : ''}<br/>
            ${gstApplicable && company.gstNumber ? `<strong>GSTIN: ${esc(company.gstNumber)}</strong>` : ''}
          </div>
        </div>`,
        documentTitle: `<h1 class="doc-title">${so.seriesId?.isEstimate ? 'ESTIMATE' : 'SALES ORDER'}</h1>`,
        documentNumber: `${!gstApplicable ? '<div style="font-size:10pt;font-weight:700;">(NON-GST)</div>' : ''}<div class="doc-id">${esc(so.soNumber)}</div>`,
        customerDetails: `<table class="info-table">
          <tr><td class="info-label">Customer Name:</td><td class="info-value" style="font-weight:900;">${esc(so.customerName)}</td></tr>
          <tr><td class="info-label">Address:</td><td class="info-value" style="font-size:9pt;">${esc(so.billingAddress || so.shippingAddress || '—')}</td></tr>
          ${so.customerState ? `<tr><td class="info-label">State:</td><td class="info-value">${esc(so.customerState)}</td></tr>` : ''}
          ${so.customerPhone ? `<tr><td class="info-label">Contact No:</td><td class="info-value">${esc(so.customerPhone)}</td></tr>` : ''}
          ${gstApplicable && so.customerGstin ? `<tr><td class="info-label">GST No:</td><td class="info-value">${esc(so.customerGstin)}</td></tr>` : ''}
        </table>`,
        documentDetails: `<table class="info-table">
          <tr><td class="info-label">Date:</td><td class="info-value">${fmtDate(so.soDate)}</td></tr>
          <tr><td class="info-label">Order Category:</td><td class="info-value">${esc(so.orderCategory || 'Order')}</td></tr>
          <tr><td class="info-label">Delivery Date:</td><td class="info-value">${fmtDate(so.deliveryDate)}</td></tr>
          <tr><td class="info-label">Customer PO:</td><td class="info-value">${esc(so.customerPO || 'VERBAL')}</td></tr>
          <tr><td class="info-label">PO Date:</td><td class="info-value">${fmtDate(so.customerPODate || so.soDate)}</td></tr>
        </table>`,
        totalsBox: buildStandaloneTotals(so, gstApplicable, isIGST, gstRate),
        remarks: so.remarks
            ? `<div style="border:1px solid #000;padding:7px 9px;"><div style="font-size:7.5pt;font-weight:800;color:#555;">REMARKS:</div><div style="font-size:8.5pt;white-space:pre-wrap;">${esc(so.remarks)}</div></div>`
            : '',
        terms: '',
        bankDetails: bankHtml(company),
        signature: signatureHtml(so, company, user),
    };

    return pages.map((pageItems, pageIdx) => {
        const isFirst = pageIdx === 0;
        const isLast = pageIdx === totalPages - 1;
        const start = srStartForPage(pages, pageIdx);
        const contHeader = !isFirst
            ? `<div class="pf-cont-header"><strong>${esc(company.companyName || 'JSK URJA')}</strong>
                <span>Order No: ${esc(so.soNumber)} | Date: ${fmtDate(so.soDate)} (continued)</span></div>`
            : '';
        const itemTableHtml = `<table class="items-table"><colgroup>
          <col data-pf-col="sr" style="width:4%"/><col data-pf-col="itemCode" style="width:18%"/><col data-pf-col="description" style="width:33%"/><col data-pf-col="notes" style="width:18%"/>
          <col data-pf-col="hsn" style="width:6%"/><col data-pf-col="qty" style="width:5%"/><col data-pf-col="rate" style="width:7%"/><col data-pf-col="amount" style="width:9%"/>
        </colgroup><thead><tr>
          <th data-pf-col="sr">SR</th><th data-pf-col="itemCode">ITEM CODE</th><th data-pf-col="description">DESCRIPTION</th>
          <th data-pf-col="notes">ADDITIONAL NOTES</th><th data-pf-col="hsn">HSN</th><th data-pf-col="qty">QTY</th>
          <th data-pf-col="rate">RATE</th><th data-pf-col="amount">AMOUNT</th>
        </tr></thead><tbody>${itemRows(pageItems, pageIdx, start)}</tbody></table>`;

        const ids = Object.keys({ ...staticContent, itemTable: true });
        const body = ids.map((id) => {
            const b = blocks[id];
            if (b && b.visible === false) return '';
            if (FIRST_PAGE_BLOCKS.includes(id) && !isFirst) return '';
            if (LAST_PAGE_BLOCKS.includes(id) && !isLast) return '';
            if (id === 'itemTable') {
                const contStyle = !isFirst
                    ? ` style="top:28mm;left:${Number(tableBlock.x) || 0}mm;width:${Number(tableBlock.width) || 190}mm;min-height:${Math.max(Number(tableBlock.height) || 100, 180)}mm;"`
                    : '';
                return `<div data-pf-block="itemTable"${contStyle}>${itemTableHtml}</div>`;
            }
            return blockHtml(id, staticContent[id] || '');
        }).join('\n');

        return `<div class="page pf-block-layout-root">
          ${totalPages > 1 ? `<div class="page-counter">Page ${pageIdx + 1} of ${totalPages}</div>` : ''}
          ${contHeader}
          ${body}
        </div>`;
    }).join('\n');
}


export function buildSalesOrderFlowHtml({ so, company, user, logoBase64 }) {
    const gstApplicable = so.gstApplicable !== false;
    const isIGST = so.gstType === 'IGST';
    const gstRate = Number(so.items?.[0]?.gstRate || so.items?.[0]?.taxPercent || 18);
    const pages = paginate(so.items || []);

    return pages.map((pageItems, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const isLastPage = pageIdx === pages.length - 1;
        const totalPages = pages.length;

        const header = isFirstPage ? `
          <div class="p-header">
            <div class="company-info">
              ${blockHtml('logo', logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : '')}
              ${blockHtml('companyDetails', `<div class="company-details">
                <h1>${esc(company.companyName || 'JSK URJA')}</h1>
                <div class="company-addr">
                  ${esc(company.address)}<br/>
                  ${esc(company.city)} ${esc(company.state)}, India. Postal Code: ${esc(company.pincode)}. State Code: ${esc(company.stateCode || '')}<br/>
                  ${(company.phone || company.email) ? `Phone: ${esc(company.phone || '')} Email: ${esc(company.email || '')}` : ''}<br/>
                  ${gstApplicable && company.gstNumber ? `<strong>GSTIN: ${esc(company.gstNumber)}</strong>` : ''}
                </div>
              </div>`)}
            </div>
            <div class="doc-meta">
              ${blockHtml('documentTitle', `<h1 class="doc-title">${so.seriesId?.isEstimate ? 'ESTIMATE' : 'SALES ORDER'}</h1>`)}
              ${blockHtml('documentNumber', `${!gstApplicable ? '<div style="font-size:10pt;font-weight:700;">(NON-GST)</div>' : ''}<div class="doc-id">${esc(so.soNumber)}</div>`)}
            </div>
          </div>
          <div style="border-bottom:1.5px solid #000;margin-bottom:20px;"></div>
          <div class="info-block">
            ${blockHtml('customerDetails', `<div class="party-info"><table class="info-table">
              <tr><td class="info-label">Customer Name:</td><td class="info-value" style="font-weight:900;">${esc(so.customerName)}</td></tr>
              <tr><td class="info-label">Address:</td><td class="info-value" style="font-size:9pt;">${esc(so.billingAddress || so.shippingAddress || '—')}</td></tr>
              ${so.customerState ? `<tr><td class="info-label">State:</td><td class="info-value">${esc(so.customerState)} ${so.customerStateCode ? `(${esc(so.customerStateCode)})` : ''}</td></tr>` : ''}
              ${so.customerPhone ? `<tr><td class="info-label">Contact No:</td><td class="info-value">${esc(so.customerPhone)}</td></tr>` : ''}
              ${gstApplicable && so.customerGstin ? `<tr><td class="info-label">GST No:</td><td class="info-value">${esc(so.customerGstin)}</td></tr>` : ''}
            </table></div>`, 'flex:1')}
            ${blockHtml('documentDetails', `<div class="order-info"><table class="info-table">
              <tr><td class="info-label">Date:</td><td class="info-value">${fmtDate(so.soDate)}</td></tr>
              <tr><td class="info-label">Order Category:</td><td class="info-value">${esc(so.orderCategory || 'Order')}</td></tr>
              <tr><td class="info-label">Delivery Date:</td><td class="info-value">${fmtDate(so.deliveryDate)}</td></tr>
              <tr><td class="info-label">Customer's<br/>Purchase Order:</td><td class="info-value">${esc(so.customerPO || 'VERBAL')}</td></tr>
              <tr><td class="info-label">Customer's<br/>PO Date:</td><td class="info-value">${fmtDate(so.customerPODate || so.soDate)}</td></tr>
            </table></div>`, 'width:300px')}
          </div>` : `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #000;padding-bottom:5px;">
            <div style="font-size:14pt;font-weight:900;text-transform:uppercase;">${esc(company.companyName || 'JSK URJA')}</div>
            <div style="text-align:right;font-size:9pt;"><strong>Order No:</strong> ${esc(so.soNumber)} | <strong>Date:</strong> ${fmtDate(so.soDate)}</div>
          </div>`;

        const table = `
          ${blockHtml('itemTable', `<table class="items-table">
            <colgroup>
              <col data-pf-col="sr" style="width:4%"/><col data-pf-col="itemCode" style="width:18%"/><col data-pf-col="description" style="width:33%"/><col data-pf-col="notes" style="width:18%"/>
              <col data-pf-col="hsn" style="width:6%"/><col data-pf-col="qty" style="width:5%"/><col data-pf-col="rate" style="width:7%"/><col data-pf-col="amount" style="width:9%"/>
            </colgroup>
            <thead><tr>
              <th data-pf-col="sr">SR</th>
              <th style="text-align:left;" data-pf-col="itemCode">ITEM CODE</th>
              <th style="text-align:left;" data-pf-col="description">DESCRIPTION</th>
              <th style="text-align:left;" data-pf-col="notes">ADDITIONAL NOTES</th>
              <th data-pf-col="hsn">HSN</th>
              <th data-pf-col="qty">QTY</th>
              <th style="text-align:right;" data-pf-col="rate">RATE</th>
              <th style="text-align:right;" data-pf-col="amount">AMOUNT</th>
            </tr></thead>
            <tbody>
              ${itemRows(pageItems, pageIdx)}
            </tbody>
          </table>`)}
          ${!isLastPage ? '<div class="continued-notice">Continued on next page...</div>' : ''}
          ${isLastPage ? `<div data-pf-block="totalsBox" class="so-totals-wrap">${buildStandaloneTotals(so, gstApplicable, isIGST, gstRate)}</div>
            ${so.amountInWords ? `<div class="amount-in-words"><strong>Amount in Words: </strong>${esc(so.amountInWords)}</div>` : ''}` : ''}`;

        const footer = isLastPage ? `
          ${so.remarks ? blockHtml('remarks', `<div style="margin-top:12px;border:1px solid #000;padding:7px 9px;">
            <div style="font-size:7.5pt;font-weight:800;color:#555;">REMARKS:</div>
            <div style="font-size:8.5pt;white-space:pre-wrap;">${esc(so.remarks)}</div>
          </div>`) : blockHtml('remarks', '')}
          <div class="footer">
            ${blockHtml('bankDetails', bankHtml(company))}
            ${blockHtml('terms', termsHtml(so))}
          </div>
          ${blockHtml('signature', approvalLinesHtml())}` : '';

        return `<div class="page">
          <div class="page-counter">Page ${pageIdx + 1} of ${totalPages}</div>
          ${header}
          ${table}
          ${footer}
        </div>`;
    }).join('');
}

export const SO_PRINT_BASE_CSS = `
  * { box-sizing: border-box; font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 0; color: #000; background: #fff; font-size: 9pt; line-height: 1.3; }
  .page { width: 210mm; height: 297mm; min-height: 297mm; max-height: 297mm; padding: 10mm; box-sizing: border-box; position: relative; display: flex; flex-direction: column; background: #fff; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pf-block-layout-root { display: block !important; }
  .pf-cont-header { position: absolute; left: 0; top: 0; right: 0; height: 22mm; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000; font-size: 9pt; box-sizing: border-box; padding-bottom: 2mm; }
  .p-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .company-info { display: flex; gap: 20px; align-items: flex-start; }
  .logo-img { max-height: 80px; max-width: 120px; object-fit: contain; }
  .company-details h1 { margin: 0; font-size: 20pt; font-weight: 900; line-height: 1.1; text-transform: uppercase; }
  .company-addr { font-size: 9pt; color: #000; line-height: 1.3; max-width: 450px; }
  .doc-meta { text-align: right; }
  .doc-title { margin: 0 0 2px 0; font-size: 16pt; font-weight: 900; text-transform: uppercase; color: #64748b; }
  .doc-id { font-size: 14pt; font-weight: 700; color: #334155; }
  .info-block { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 20px; }
  .party-info { flex: 1; }
  .order-info { width: 300px; }
  .info-table { width: 100%; border-collapse: collapse; }
  .info-label { width: 120px; font-size: 10pt; font-weight: 800; padding: 4px 0; vertical-align: top; }
  .info-value { font-size: 10pt; padding: 4px 0; vertical-align: top; text-transform: uppercase; }
  [data-pf-block="itemTable"] { width: 100%; max-width: 100%; min-width: 0; }
  .items-table { width: 100%; max-width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 11px; margin-bottom: auto; table-layout: fixed; box-sizing: border-box; }
  .items-table col[data-pf-col="sr"] { width: 4%; }
  .items-table col[data-pf-col="itemCode"] { width: 18%; }
  .items-table col[data-pf-col="description"] { width: 33%; }
  .items-table col[data-pf-col="notes"] { width: 18%; }
  .items-table col[data-pf-col="hsn"] { width: 6%; }
  .items-table col[data-pf-col="qty"] { width: 5%; }
  .items-table col[data-pf-col="rate"] { width: 7%; }
  .items-table col[data-pf-col="amount"] { width: 9%; }
  .items-table [data-pf-col="spacer"] { display: none; width: 0; padding: 0; border: none; }
  .items-table th { border: 1px solid #000; padding: 8px 6px; font-weight: 800; background: #f5f5f5; text-align: center; text-transform: uppercase; }
  .items-table td { border: 1px solid #000; padding: 6px; vertical-align: top; overflow-wrap: break-word; }
  .items-table td[data-pf-col="itemCode"] { word-break: normal; }
  .items-table [data-pf-col="sr"],
  .items-table [data-pf-col="hsn"],
  .items-table [data-pf-col="qty"],
  .items-table [data-pf-col="rate"],
  .items-table [data-pf-col="amount"] { white-space: nowrap; overflow-wrap: normal; word-break: keep-all; padding-left: 3px; padding-right: 3px; }
  .totals-label { font-weight: 800; }
  .totals-value { text-align: right; font-weight: 700; }
  .rounded-total td { background: #f5f5f5; font-size: 11pt; font-weight: 900; }
  .footer { display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 28px; margin-top: 18px; }
  .so-totals-wrap { width: 88mm; margin-left: auto; margin-top: 8px; margin-bottom: 8px; }
  .amount-in-words { font-size: 9pt; font-style: italic; text-transform: capitalize; margin-bottom: 10px; }
  .approval-lines { display: flex; justify-content: space-between; gap: 16px; margin-top: 22px; width: 100%; }
  .approval-line { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 8pt; font-weight: 800; }
  .bank-details { font-size: 7.5pt; }
  .generated-note { text-align: center; font-size: 8pt; color: #666; }
  .signatory { border: 1px solid #000; min-height: 76px; display: flex; flex-direction: column; text-align: center; }
  .signatory-title { background: #f5f5f5; border-bottom: 1px solid #000; padding: 4px; font-size: 7.5pt; font-weight: 800; }
  .signatory-body { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 5px; }
  .continued-notice { padding: 8px; text-align: right; font-style: italic; font-size: 9pt; background: #fafafa; border: 1px solid #000; border-top: none; }
  .page-counter { position: absolute; bottom: 5mm; right: 10mm; font-size: 8pt; color: #666; z-index: 30; }
  @page { margin: 0; size: A4 portrait; }
`;
