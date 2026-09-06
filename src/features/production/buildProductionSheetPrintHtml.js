/**
 * HTML for the Work Order Detail "Print Production Sheet" button.
 * Section identity is included only for Section / Subassembly WOs.
 */

export function isSupplementaryWorkOrderForPrint(wo) {
    if (!wo) return false;
    if (wo.woKind === 'supplementary') return true;
    return /-[Ss]\d+-SUP\d+$/i.test(String(wo.woNumber || ''));
}

export function isSectionWorkOrderForPrint(wo) {
    if (!wo) return false;
    if (isSupplementaryWorkOrderForPrint(wo)) return false;
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

function esc(value) {
    return String(value ?? '—')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function displayPrintStageStatus(stage) {
    if (stage?.notApplicable === true || stage?.isApplicable === false) {
        return 'Not Applicable — completed in original WO';
    }
    const raw = String(stage?.status || 'Not Started');
    return raw === 'Running' ? 'In Progress' : raw;
}

function isNaPrintStage(stage) {
    return stage?.notApplicable === true || stage?.isApplicable === false;
}

function resolveSectionWoNumberForPrint(wo) {
    const s = wo?.sourceSectionWorkOrderId;
    if (s && typeof s === 'object' && s.woNumber) return s.woNumber;
    if (wo?.sourceSectionWoNumber) return wo.sourceSectionWoNumber;
    const n = String(wo?.woNumber || '');
    return n.replace(/-SUP\d+$/i, '') || '—';
}

function companyAddressLine(company) {
    if (!company) return '';
    const parts = [company.address, company.city, company.state, company.pincode].filter(Boolean);
    return parts.join(', ');
}

function sourceMaterialForSupLine(sourceMaterials, sm) {
    const list = sourceMaterials || [];
    return list.find((m) => String(m._id) === String(sm.materialId))
        || list.find((m) => sm.itemId && String(m.itemId) === String(sm.itemId))
        || null;
}

function remainingToAllocateSaved(m) {
    if (m?.remainingToAllocateQty != null) return Math.max(0, num(m.remainingToAllocateQty));
    return Math.max(0, num(m?.requiredQty) - num(m?.addedLaterQty) - num(m?.supplementaryAllocatedQty));
}

function remainingToResolveSaved(m) {
    if (m?.remainingToResolveQty != null) return Math.max(0, num(m.remainingToResolveQty));
    return Math.max(0, num(m?.requiredQty) - num(m?.addedLaterQty) - num(m?.supplementaryCompletedQty));
}

const PRINT_SHEET_CSS = `
                    body { font-family: sans-serif; font-size: 11px; margin: 0; padding: 20px; box-sizing: border-box; }
                    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #000; }
                    .header-table td { border: 1px solid #000; padding: 6px; }
                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #000; text-align: center; }
                    .grid-table th { background: #f8f9fa; border: 1px solid #000; padding: 6px; font-weight: bold; }
                    .grid-table td { border: 1px solid #000; padding: 6px; }
                    .section-title { font-weight: bold; font-size: 12px; background: #f8f9fa; text-align: center; padding: 6px; border: 1px solid #000; text-transform: uppercase; }
                    @media print {
                        @page { size: A4 portrait; margin: 10mm; }
                        body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 190mm; }
                    }
`;

/**
 * Read-only Supplementary WO print. Does not mutate WO / stock / FG.
 * @param {{ wo: object, companyName?: string, company?: object, sourceSectionWo?: object }} args
 */
export function buildSupplementaryWorkOrderPrintHtml({
    wo,
    companyName = '—',
    company = null,
    sourceSectionWo = null,
} = {}) {
    const p = productDisplay(wo);
    const parentWoNumber = resolveParentWoNumberForPrint(wo);
    const sectionWoNumber = resolveSectionWoNumberForPrint(wo);
    const sectionName = resolveSectionNameForPrint(wo) || sourceSectionWo?.bomSectionName || '—';
    const reason = wo?.supplementaryReason || 'Pending material received later';
    const fy = wo?.financialYear || company?.defaultFinancialYear || '—';
    const address = companyAddressLine(company);
    const logoUrl = company?.logoUrl || '';
    const sourceMaterials = (sourceSectionWo?.materialStatus)
        || (wo?.sourceSectionWorkOrderId && typeof wo.sourceSectionWorkOrderId === 'object'
            ? wo.sourceSectionWorkOrderId.materialStatus
            : null)
        || [];

    const supLines = (wo?.supplementaryMaterials || []).length
        ? wo.supplementaryMaterials
        : (wo?.materialStatus || []).map((m) => ({
            materialId: m._id,
            itemId: m.itemId,
            itemCode: m.itemCode,
            itemName: m.itemName,
            qty: m.requiredQty,
        }));

    const materialRows = (supLines.length ? supLines : [{ itemCode: '—', itemName: '—', qty: wo?.targetQty || 0 }]).map((sm, i) => {
        const src = sourceMaterialForSupLine(sourceMaterials, sm);
        const remainingPending = src ? remainingToResolveSaved(src) : '—';
        return `<tr>
            <td>${i + 1}</td>
            <td>${esc(sm.itemCode || src?.itemCode || '—')}</td>
            <td style="text-align:left">${esc(sm.itemName || src?.itemName || '—')}</td>
            <td>${esc(num(sm.qty))}</td>
            <td>${esc(remainingPending)}</td>
        </tr>`;
    }).join('');

    const logoCell = logoUrl
        ? `<img src="${esc(logoUrl)}" alt="Company Logo" style="max-height:48px; max-width:90px; object-fit:contain;" />`
        : '';

    return `<html>
            <head>
                <title>SUPPLEMENTARY WORK ORDER - ${esc(wo?.woNumber || '')}</title>
                <style>${PRINT_SHEET_CSS}</style>
            </head>
            <body>
                <div style="text-align:center; border:2px solid #000; padding:10px 12px; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:6px;">
                        ${logoCell}
                        <div>
                            <div style="font-size:13px; font-weight:800;">${esc(companyName || '—')}</div>
                            ${address ? `<div style="font-size:10px; margin-top:2px;">${esc(address)}</div>` : ''}
                        </div>
                    </div>
                    <div style="font-size:20px; font-weight:900; letter-spacing:0.8px;">SUPPLEMENTARY WORK ORDER</div>
                    <div style="font-size:13px; font-weight:800; margin-top:8px;">Purpose: Add late-received missing components to existing production.</div>
                    <div style="font-size:14px; font-weight:800; margin-top:6px;">Supplementary WO No. : ${esc(wo?.woNumber || '—')}</div>
                    <div style="font-size:11px; margin-top:4px;">Financial Year : ${esc(fy)}</div>
                </div>

                <table class="header-table">
                    <tr>
                        <td>Parent Work Order No. : <strong>${esc(parentWoNumber)}</strong></td>
                        <td>Section Work Order No. : <strong>${esc(sectionWoNumber)}</strong></td>
                    </tr>
                    <tr>
                        <td>Section / Subassembly : <strong>${esc(sectionName)}</strong></td>
                        <td>Product Name : ${esc(p.productName)}</td>
                    </tr>
                    <tr>
                        <td>Model No. : ${esc(p.modelNo)}</td>
                        <td>Item Code : ${esc(p.itemCode)}</td>
                    </tr>
                    <tr>
                        <td>Supplementary WO Date : ${esc(fmtDate(wo?.createdAt))}</td>
                        <td>Supervisor : ${esc(wo?.supervisor || '—')}</td>
                    </tr>
                    <tr>
                        <td>Status : ${esc(['Completed', 'Closed', 'Cancelled'].includes(wo?.status) ? wo.status : 'Pending')}</td>
                        <td>Reason : ${esc(reason)}</td>
                    </tr>
                    <tr>
                        <td>Material Issue No. : <strong>${esc(wo?.materialIssueNo || '—')}</strong></td>
                        <td>Company : ${esc(companyName || '—')}</td>
                    </tr>
                </table>

                <div class="section-title">Missing components to add</div>
                <table class="grid-table">
                    <tr>
                        <th>Sr</th>
                        <th>Item Code</th>
                        <th>Component</th>
                        <th>Qty Issued</th>
                        <th>Remaining</th>
                    </tr>
                    ${materialRows}
                </table>

                <div style="border:1px solid #000; padding:8px 10px; margin-bottom:16px; font-size:11px;">
                    The following missing components have been received and issued from stock. Add these components to the existing ${esc(sectionName || 'section')} production. Printing does not change inventory.
                </div>

                <table class="header-table" style="margin-bottom:0;">
                    <tr>
                        <td style="height:64px; width:20%;">Store / Issued By<br/><br/></td>
                        <td style="width:20%;">Received By<br/><br/></td>
                        <td style="width:20%;">Production Supervisor<br/>${esc(wo?.supervisor || '')}<br/></td>
                        <td style="width:20%;">Production In-Charge<br/><br/></td>
                        <td style="width:20%;">Signature / Date<br/>${esc(fmtDate(new Date()))}<br/></td>
                    </tr>
                </table>
            </body>
            </html>`;
}

/**
 * Read-only Material Issue Note. Printing never posts or reverses stock.
 */
export function buildLateMaterialIssueNoteHtml({ batch, wo, companyName = '—', company = null } = {}) {
    const p = productDisplay(wo);
    const lines = batch?.lines || [];
    const parentNo = batch?.parentWoNumber || resolveParentWoNumberForPrint(wo);
    const sectionNo = batch?.sectionWoNumber || (wo?.woKind === 'section' ? wo.woNumber : '—');
    const supNo = batch?.supplementaryWorkOrderId
        ? (wo?.woKind === 'supplementary' ? wo.woNumber : (batch.supplementaryWoNumber || '—'))
        : (wo?.woKind === 'supplementary' ? wo.woNumber : '');
    const issuedBy = (batch?.createdBy && typeof batch.createdBy === 'object')
        ? (batch.createdBy.name || '—')
        : '—';
    const logoUrl = company?.logoUrl || '';
    const logoCell = logoUrl
        ? `<img src="${esc(logoUrl)}" alt="Company Logo" style="max-height:48px; max-width:90px; object-fit:contain;" />`
        : '';
    const rows = lines.map((l, i) => (
        `<tr>
            <td>${i + 1}</td>
            <td style="text-align:left;">${esc(l.itemCode)}</td>
            <td style="text-align:left;">${esc(l.itemName)}</td>
            <td>${esc(l.requiredQty)}</td>
            <td>${esc(l.qtyIssued)}</td>
            <td>${esc(l.remainingAfter)}</td>
            <td style="text-align:left;">${esc(l.remarks)}</td>
        </tr>`
    )).join('');
    return `<!DOCTYPE html>
            <html>
            <head>
                <title>MATERIAL ISSUE NOTE ${esc(batch?.issueNo)}</title>
                <style>${PRINT_SHEET_CSS}</style>
            </head>
            <body>
                <div style="text-align:center; border:2px solid #000; padding:10px; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:6px;">
                        ${logoCell}
                        <div>
                            <div style="font-size:13px; font-weight:800;">${esc(companyName || company?.companyName || '—')}</div>
                        </div>
                    </div>
                    <div style="font-size:20px; font-weight:900; letter-spacing:0.6px; margin-top:4px;">MATERIAL ISSUE NOTE</div>
                    <div style="font-size:11px; margin-top:4px;">Read-only copy · printing does not change inventory</div>
                </div>
                <table class="header-table">
                    <tr>
                        <td><strong>Material Issue No.</strong><br/>${esc(batch?.issueNo)}</td>
                        <td><strong>Date</strong><br/>${esc(fmtDate(batch?.issueDate || batch?.createdAt))}</td>
                        <td><strong>Financial Year</strong><br/>${esc(batch?.financialYear || wo?.financialYear)}</td>
                        <td><strong>Issued By</strong><br/>${esc(issuedBy)}</td>
                    </tr>
                    <tr>
                        <td><strong>Parent WO</strong><br/>${esc(parentNo)}</td>
                        <td><strong>Section WO</strong><br/>${esc(sectionNo)}</td>
                        <td><strong>Section</strong><br/>${esc(batch?.sectionName || wo?.bomSectionName)}</td>
                        <td><strong>Supervisor</strong><br/>${esc(batch?.supervisor || wo?.supervisor)}</td>
                    </tr>
                    <tr>
                        <td colspan="2"><strong>Product</strong><br/>${esc(p.productName)}</td>
                        <td><strong>Model</strong><br/>${esc(p.modelNo)}</td>
                        <td><strong>Supplementary WO</strong><br/>${esc(supNo || '—')}</td>
                    </tr>
                </table>
                <div class="section-title">Materials Issued</div>
                <table class="grid-table">
                    <thead>
                        <tr>
                            <th>Sr.</th>
                            <th>Item Code</th>
                            <th>Item Name</th>
                            <th>Required Qty</th>
                            <th>Qty Issued</th>
                            <th>Remaining Pending Qty</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="margin:10px 0; font-size:12px;"><strong>Remarks:</strong> ${esc(batch?.remarks)}</div>
                <table class="header-table" style="margin-bottom:0;">
                    <tr>
                        <td style="height:56px; width:25%;">Issued By<br/>${esc(issuedBy)}<br/></td>
                        <td style="width:25%;">Received By<br/><br/></td>
                        <td style="width:25%;">Production Supervisor<br/>${esc(batch?.supervisor || wo?.supervisor)}<br/></td>
                        <td style="width:25%;">Signature<br/><br/></td>
                    </tr>
                </table>
            </body>
            </html>`;
}

/** Opens a print preview window. Does not auto-invoke the OS print dialog. */
export function openProductionSheetPrintPreview(html) {
    const printWindow = window.open('', '', 'width=900,height=800');
    if (!printWindow) return false;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    return true;
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
