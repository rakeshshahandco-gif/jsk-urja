/**
 * HTML for the Work Order Detail "Print Production Sheet" button.
 * Section identity is included only for Section / Subassembly WOs.
 */

export function isSectionWorkOrderForPrint(wo) {
    if (!wo) return false;
    if (wo.woKind === 'section') return true;
    if (wo.parentWorkOrderId) return true;
    const name = String(wo.bomSectionName || wo.sectionName || '').trim();
    if (name) return true;
    return /-[Ss]\d+$/.test(String(wo.woNumber || ''));
}

export function resolveSectionNameForPrint(wo) {
    return String(wo?.bomSectionName || wo?.sectionName || '').trim();
}

export function resolveParentWoNumberForPrint(wo) {
    const p = wo?.parentWorkOrderId;
    if (p && typeof p === 'object' && p.woNumber) return p.woNumber;
    if (wo?.parentWoNumber) return wo.parentWoNumber;
    return '—';
}

function productDisplay(wo) {
    const fp = wo?.finishedProductId && typeof wo.finishedProductId === 'object' ? wo.finishedProductId : {};
    return {
        productName: wo?.finishedProductName || fp.itemName || fp.name || '—',
        modelNo: fp.modelNo || wo?.finishedProductModelNo || wo?.modelNo || '—',
        itemCode: fp.itemCode || wo?.finishedProductItemCode || '—',
    };
}

function emptyGridRows(count, cells, extraLeftBorderAt) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += '<tr style="height:35px">';
        for (let c = 0; c < cells; c++) {
            const extra = extraLeftBorderAt === c ? ' border-left: 2px solid #000;' : '';
            html += `<td style="border:1px solid #000; padding:4px;${extra}"></td>`;
        }
        html += '</tr>';
    }
    return html;
}

/**
 * @param {{ wo: object, companyName?: string, isTextile?: boolean }} args
 * @returns {string} full HTML document
 */
export function buildProductionSheetPrintHtml({ wo, companyName = '—', isTextile = false } = {}) {
    const isSectionPrint = !isTextile && isSectionWorkOrderForPrint(wo);
    const sectionName = resolveSectionNameForPrint(wo);
    const parentWoNumber = resolveParentWoNumberForPrint(wo);
    const p = productDisplay(wo);
    const printTitle = isTextile
        ? 'Textile Job Sheet'
        : (isSectionPrint ? `SECTION PRODUCTION SHEET - ${sectionName || 'SECTION'}` : 'Production Sheet');

    const textileProcessRows = (wo?.stages || []).map((s) => (
        `<tr><td style="font-weight:bold; height:45px;">${s.stageName}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
    )).join('');

    const emptyRows2 = emptyGridRows(6, 8, 4);

    const sectionBanner = isSectionPrint ? `
                <div style="text-align:center; border:2px solid #000; padding:8px 10px; margin-bottom:12px;">
                    <div style="font-size:13px; font-weight:800; letter-spacing:0.6px;">SECTION PRODUCTION SHEET</div>
                    <div style="font-size:22px; font-weight:900; margin-top:4px; text-transform:uppercase; letter-spacing:0.4px;">${sectionName || 'SECTION'}</div>
                </div>` : '';

    const sectionHeaderRows = isSectionPrint ? `
                    <tr>
                        <td colspan="2" style="padding:10px 8px; background:#f3f4f6;">
                            <span style="font-size:12px;">SECTION / SUBASSEMBLY :</span>
                            <strong style="font-size:18px; font-weight:900; margin-left:8px; text-transform:uppercase; letter-spacing:0.3px;">${sectionName || '—'}</strong>
                        </td>
                    </tr>
                    <tr>
                        <td>Section WO No. : ${wo.woNumber || '—'}</td>
                        <td>Parent WO No. : ${parentWoNumber}</td>
                    </tr>` : '';

    return `<html>
            <head>
                <title>${printTitle} - ${wo?.woNumber || ''}</title>
                <style>
                    body { font-family: sans-serif; font-size: 11px; margin: 0; padding: 20px; box-sizing: border-box; }
                    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000; }
                    .header-table td { border: 1px solid #000; padding: 6px; }
                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000; text-align: center; }
                    .grid-table th { background: #f8f9fa; border: 1px solid #000; padding: 6px; font-weight: bold; }
                    .grid-table td { border: 1px solid #000; padding: 6px; }
                    .section-title { font-weight: bold; font-size: 12px; background: #f8f9fa; text-align: center; padding: 6px; border: 1px solid #000; text-transform: uppercase; }
                    @media print {
                        @page { size: A4 portrait; margin: 10mm; }
                        body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 190mm; }
                    }
                </style>
            </head>
            <body>
                ${sectionBanner}
                <table class="header-table">
                    <tr>
                        <td>Status : ${wo?.status || '—'}</td>
                        <td>Company : ${companyName || '—'}</td>
                    </tr>
                    <tr>
                        <td>${isTextile ? 'Finished Item' : 'Item to Manufacture'} : ${p.productName}</td>
                        <td>${isTextile ? 'Order Qty (PCS)' : 'Qty to Manufacture'} : ${wo?.targetQty ?? '—'}</td>
                    </tr>
                    ${sectionHeaderRows}
                    <tr>
                        <td>Model No. : ${p.modelNo}</td>
                        <td>Item Code : ${p.itemCode}</td>
                    </tr>
                    ${isTextile ? `
                    <tr>
                        <td>Design No : ${wo.textile?.designNo || '—'}</td>
                        <td>Colour / Size : ${wo.textile?.colour || '—'} / ${wo.textile?.size || '—'}</td>
                    </tr>
                    <tr>
                        <td>Fabric Required : ${wo.textile?.requiredFabricMeter || '—'} Meter</td>
                        <td>Fabric Item : ${wo.textile?.fabricItemName || '—'}</td>
                    </tr>
                    <tr>
                        <td>Lot / Than / Roll : ${wo.textile?.lotNo || '—'} / ${wo.textile?.thanNo || '—'} / ${wo.textile?.rollNo || '—'}</td>
                        <td>Process Route : ${wo.textile?.processRoute || '—'}</td>
                    </tr>
                    <tr>
                        <td>Vendor / Worker : ${wo.textile?.assignedVendorWorker || wo.supervisor || '—'}</td>
                        <td>Expected Completion : ${wo.plannedEnd ? new Date(wo.plannedEnd).toLocaleDateString() : '—'}</td>
                    </tr>
                    ` : `
                    <tr>
                        <td>Bom No : ${wo?.bomVersion || '—'}</td>
                        <td>Target Warehouse : ${wo?.targetWarehouse || 'Finished Goods'}</td>
                    </tr>
                    <tr>
                        <td>Planned Start Date : ${wo?.plannedStart ? new Date(wo.plannedStart).toLocaleString() : 'None'}</td>
                        <td>Actual Start Date : ${wo?.actualStart ? new Date(wo.actualStart).toLocaleString() : 'None'}</td>
                    </tr>
                    `}
                </table>

                ${isTextile ? `
                <table class="grid-table">
                    <tr>
                        <th style="width:120px;">Process</th>
                        <th>Issue Date</th><th>Return Date</th><th>Issue Qty</th><th>Return Qty</th><th>Worker</th><th>Sign</th>
                    </tr>
                    ${textileProcessRows || '<tr><td colspan="7">No process stages</td></tr>'}
                </table>
                ` : `
                <table class="grid-table">
                    <tr>
                        <th style="width:120px;"></th>
                        <th>Wo No</th><th>Date</th><th>Qty-Panel</th><th>Qty</th><th>Sign</th><th>Ent.</th>
                    </tr>
                    <tr><td style="font-weight:bold; height:60px;">SMD</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Wave/Reflow</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Lac/Clean</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Dummy</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Faulty</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                </table>

                <table class="grid-table" style="margin-top:20px;">
                    <tr>
                        <td colspan="4" class="section-title">TH-MOUNTING</td>
                        <td colspan="4" class="section-title" style="border-left: 2px solid #000;">TOUCH-UP</td>
                    </tr>
                    <tr>
                        <th>DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                        <th style="border-left: 2px solid #000;">DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                    </tr>
                    ${emptyRows2}
                    <tr>
                        <td colspan="4" class="section-title">1ST QC</td>
                        <td colspan="4" class="section-title" style="border-left: 2px solid #000;">FINAL QC</td>
                    </tr>
                    <tr>
                        <th>DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                        <th style="border-left: 2px solid #000;">DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                    </tr>
                    ${emptyRows2}
                </table>
                `}
            </body>
            </html>`;
}

export function openProductionSheetPrintWindow(html) {
    const printWindow = window.open('', '', 'width=900,height=800');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}
