import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    PRINT_BLOCK_IDS,
    BLOCK_LABELS,
    mergeBlocks,
    mergeColumns,
    mergeFields,
    getDefaultColumns,
} from '@/constants/printFormatSections';
import { getFieldCatalog, getBlockFieldIds } from '@/constants/printFormatFieldCatalog';
import { getFieldDisplayValue, getColumnCellValue } from '@/utils/printFormatFieldRenderer';
import { blockInlineStyle, getLayoutMinHeightMm, getMergedBlocks } from '@/utils/printFormatBlockRuntime';
import { SalesOrderPrintBlockContent } from '@/features/sales/print/SalesOrderPrintBlocks';

const CONTENT_WIDTH_MM = 190;
const MM_PER_INCH = 25.4;
const PX_PER_MM = 3.7795275591;

const PAPER_SIZE_MM = Object.freeze({
    A4: { width: 210, height: 297 },
    Letter: { width: 215.9, height: 279.4 },
    Legal: { width: 215.9, height: 355.6 },
});

function resolvePageSizeMm(form = {}) {
    const paper = String(form.paperSize || 'A4');
    const orientation = String(form.orientation || 'portrait').toLowerCase();
    let width;
    let height;
    if (paper === 'Custom') {
        width = Number(form.customPaper?.widthMm) || 210;
        height = Number(form.customPaper?.heightMm) || 297;
    } else {
        const base = PAPER_SIZE_MM[paper] || PAPER_SIZE_MM.A4;
        width = base.width;
        height = base.height;
    }
    if (orientation === 'landscape') {
        return { widthMm: Math.max(width, height), heightMm: Math.min(width, height), paper, orientation };
    }
    return { widthMm: Math.min(width, height), heightMm: Math.max(width, height), paper, orientation };
}

function marginsToMm(margins = {}) {
    const unit = String(margins.unit || 'mm').toLowerCase();
    const toMm = (n) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return 10;
        return unit === 'inch' || unit === 'in' ? v * MM_PER_INCH : v;
    };
    return {
        top: toMm(margins.top ?? 10),
        right: toMm(margins.right ?? 10),
        bottom: toMm(margins.bottom ?? 10),
        left: toMm(margins.left ?? 10),
        unit: unit === 'inch' || unit === 'in' ? 'inch' : 'mm',
    };
}

function PageSetupPanel({ form, setForm, showRuler, setShowRuler, showMargins, setShowMargins, zoomPct, setZoomPct, pageMeta }) {
    const margins = form.margins || { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' };
    const unit = margins.unit || 'mm';

    const setMargin = (side, value) => {
        setForm((prev) => ({
            ...prev,
            margins: { ...(prev.margins || {}), [side]: Number(value) },
        }));
    };

    const setUnit = (nextUnit) => {
        setForm((prev) => {
            const cur = prev.margins || { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' };
            const from = String(cur.unit || 'mm').toLowerCase();
            const to = String(nextUnit).toLowerCase();
            if (from === to) return { ...prev, margins: { ...cur, unit: to === 'inch' ? 'inch' : 'mm' } };
            const convert = (n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return 10;
                if (from === 'mm' && to === 'inch') return Math.round((v / MM_PER_INCH) * 100) / 100;
                if (from === 'inch' && to === 'mm') return Math.round(v * MM_PER_INCH * 10) / 10;
                return v;
            };
            return {
                ...prev,
                margins: {
                    top: convert(cur.top),
                    right: convert(cur.right),
                    bottom: convert(cur.bottom),
                    left: convert(cur.left),
                    unit: to === 'inch' ? 'inch' : 'mm',
                },
            };
        });
    };

    return (
        <div style={{ ...panelCard, marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Page Setup</div>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px' }}>
                Layout only — does not change GST, totals, stock, or posting.
            </p>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Paper Size</label>
            <select
                style={{ ...inp, marginBottom: 8 }}
                value={form.paperSize || 'A4'}
                onChange={(e) => setForm((prev) => ({ ...prev, paperSize: e.target.value }))}
            >
                <option value="A4">A4 (210 × 297 mm)</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
                <option value="Custom">Custom</option>
            </select>
            {form.paperSize === 'Custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <input
                        type="number"
                        style={inp}
                        placeholder="Width mm"
                        value={form.customPaper?.widthMm ?? ''}
                        onChange={(e) => setForm((prev) => ({
                            ...prev,
                            customPaper: { ...(prev.customPaper || {}), widthMm: Number(e.target.value) },
                        }))}
                    />
                    <input
                        type="number"
                        style={inp}
                        placeholder="Height mm"
                        value={form.customPaper?.heightMm ?? ''}
                        onChange={(e) => setForm((prev) => ({
                            ...prev,
                            customPaper: { ...(prev.customPaper || {}), heightMm: Number(e.target.value) },
                        }))}
                    />
                </div>
            )}
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Orientation</label>
            <select
                style={{ ...inp, marginBottom: 8 }}
                value={form.orientation || 'portrait'}
                onChange={(e) => setForm((prev) => ({ ...prev, orientation: e.target.value }))}
            >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
            </select>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Units</label>
            <select style={{ ...inp, marginBottom: 8 }} value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="mm">mm</option>
                <option value="inch">inch</option>
            </select>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Margins ({unit})
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                {['top', 'right', 'bottom', 'left'].map((side) => (
                    <label key={side} style={{ fontSize: 10, color: '#64748b' }}>
                        {side}
                        <input
                            type="number"
                            step={unit === 'inch' ? 0.05 : 1}
                            style={{ ...inp, marginTop: 2 }}
                            value={margins[side] ?? 10}
                            onChange={(e) => setMargin(side, e.target.value)}
                        />
                    </label>
                ))}
            </div>
            <div style={{ fontSize: 11, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                Preview page: <strong>{pageMeta.widthMm} × {pageMeta.heightMm} mm</strong>
                {' '}({pageMeta.paper} · {pageMeta.orientation})
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={showMargins} onChange={(e) => setShowMargins(e.target.checked)} />
                Show printable margins
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={showRuler} onChange={(e) => setShowRuler(e.target.checked)} />
                Show ruler (mm)
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Zoom</label>
            <input
                type="range"
                min={40}
                max={120}
                value={zoomPct}
                onChange={(e) => setZoomPct(Number(e.target.value))}
                style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: '#64748b' }}>{zoomPct}%</div>
        </div>
    );
}

function RulerBar({ lengthMm, horizontal, tickEvery = 10 }) {
    const ticks = [];
    for (let i = 0; i <= Math.ceil(lengthMm); i += tickEvery) {
        ticks.push(i);
    }
    if (horizontal) {
        return (
            <div style={{ position: 'relative', height: 18, background: '#f8fafc', borderBottom: '1px solid #cbd5e1', fontSize: 8, color: '#64748b' }}>
                {ticks.map((mm) => (
                    <div
                        key={mm}
                        style={{
                            position: 'absolute',
                            left: `${(mm / lengthMm) * 100}%`,
                            top: 0,
                            height: '100%',
                            borderLeft: '1px solid #94a3b8',
                            paddingLeft: 2,
                            boxSizing: 'border-box',
                        }}
                    >
                        {mm}
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div style={{ position: 'relative', width: 18, background: '#f8fafc', borderRight: '1px solid #cbd5e1', fontSize: 8, color: '#64748b' }}>
            {ticks.map((mm) => (
                <div
                    key={mm}
                    style={{
                        position: 'absolute',
                        top: `${(mm / lengthMm) * 100}%`,
                        left: 0,
                        width: '100%',
                        borderTop: '1px solid #94a3b8',
                        paddingTop: 1,
                        boxSizing: 'border-box',
                    }}
                >
                    {mm}
                </div>
            ))}
        </div>
    );
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '-');
const fmtCur = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtNum = (n) => Number(n || 0).toFixed(2);

const btn = (bg, color = '#fff') => ({
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
});

const inp = {
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
};

const panelCard = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 16,
};

function getCellValue(colId, item, index, docType) {
    return getColumnCellValue(colId, item, index, docType);
}

function BlockContent({ blockId, docType, doc, company, columns, onColumnHeaderClick, selectedColumnId }) {
    const isSO = docType === 'Sales Order';
    const items = (doc?.items || []).slice(0, 12);
    const gstApplicable = doc?.gstApplicable !== false;
    const visibleCols = columns.filter((c) => c.visible !== false);

    switch (blockId) {
        case 'logo':
            return (
                <img
                    src="/logo.jpeg"
                    alt="Logo"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                    draggable={false}
                />
            );
        case 'companyDetails':
            return (
                <div style={{ fontSize: 'inherit' }}>
                    <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>{company?.companyName || 'Company Name'}</div>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: 2, fontSize: '0.9em' }}>{company?.address || '-'}</div>
                    <div style={{ fontSize: '0.85em', marginTop: 2 }}>{company?.city} {company?.pincode && `- ${company.pincode}`} {company?.state}</div>
                    {(company?.phone || company?.email) && (
                        <div style={{ fontSize: '0.85em', marginTop: 2 }}>
                            {company.phone && `Tel: ${company.phone}`} {company.email && `| ${company.email}`}
                        </div>
                    )}
                    {gstApplicable && company?.gstNumber && <div style={{ marginTop: 2, fontWeight: 700 }}>GSTIN: {company.gstNumber}</div>}
                    {company?.panNumber && <div style={{ fontSize: '0.85em' }}>PAN: {company.panNumber}</div>}
                </div>
            );
        case 'documentTitle':
            return <div>{isSO ? 'SALES ORDER' : 'TAX INVOICE'}</div>;
        case 'documentNumber':
            return (
                <div>
                    {isSO
                        ? (doc?.soNumber || 'SO-000')
                        : (doc?.displayInvoiceNumber || doc?.invoiceNumber || 'INV-000')}
                </div>
            );
        case 'customerDetails':
            if (!isSO) {
                return (
                    <div style={{ fontSize: 'inherit', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: '0.8em', textTransform: 'uppercase', color: '#555' }}>Bill To (Buyer)</div>
                            <div style={{ fontWeight: 700 }}>{doc?.customerName || '-'}</div>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{doc?.billingAddress || '-'}</div>
                            {doc?.customerGstin && <div style={{ fontSize: '0.85em' }}>GSTIN: {doc.customerGstin}</div>}
                            {(doc?.billingState) && <div style={{ fontSize: '0.85em' }}>State: {doc.billingState} ({doc.billingStateCode})</div>}
                        </div>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: '0.8em', textTransform: 'uppercase', color: '#555' }}>Ship To (Consignee)</div>
                            <div style={{ fontWeight: 700 }}>{doc?.customerName || '-'}</div>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{doc?.shippingAddress || doc?.billingAddress || '-'}</div>
                            {(doc?.shippingGstin || doc?.customerGstin) && <div style={{ fontSize: '0.85em' }}>GSTIN: {doc.shippingGstin || doc.customerGstin}</div>}
                            <div style={{ fontSize: '0.85em' }}>State: {doc.shippingState || doc.billingState} ({doc.shippingStateCode || doc.billingStateCode})</div>
                        </div>
                    </div>
                );
            }
            return (
                <div style={{ fontSize: 'inherit' }}>
                    <div style={{ fontWeight: 700 }}>{isSO ? 'Customer Name: ' : 'Bill To: '}{doc?.customerName || '-'}</div>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: 2, fontSize: '0.9em' }}>{doc?.billingAddress || doc?.shippingAddress || '-'}</div>
                    {(doc?.customerState || doc?.billingState) && (
                        <div style={{ fontSize: '0.85em', marginTop: 2 }}>State: {doc.customerState || doc.billingState} {doc.customerStateCode || doc.billingStateCode ? `(${doc.customerStateCode || doc.billingStateCode})` : ''}</div>
                    )}
                    {(doc?.customerGstin || doc?.customerGst) && <div style={{ fontSize: '0.85em' }}>GSTIN: {doc.customerGstin || doc.customerGst}</div>}
                    {doc?.customerPhone && <div style={{ fontSize: '0.85em' }}>Contact: {doc.customerPhone}</div>}
                    {doc?.customerEmail && <div style={{ fontSize: '0.85em' }}>Email: {doc.customerEmail}</div>}
                </div>
            );
        case 'documentDetails':
            if (isSO) {
                return (
                    <div style={{ fontSize: 'inherit' }}>
                        <div>Date: {fmt(doc?.soDate)}</div>
                        <div>Order Category: {doc?.orderCategory || 'Order'}</div>
                        <div>Delivery Date: {fmt(doc?.deliveryDate)}</div>
                        <div>Customer PO: {doc?.customerPO || 'VERBAL'}</div>
                        <div>PO Date: {fmt(doc?.customerPODate || doc?.soDate)}</div>
                        {doc?.dispatchThrough && <div>Dispatch: {doc.dispatchThrough}</div>}
                    </div>
                );
            }
            return (
                <div style={{ fontSize: 'inherit', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                        <div>SO No: {doc?.soNumber || '—'}</div>
                        <div>Buyer Order: {doc?.buyerOrderNo || '—'}</div>
                        <div>Dispatch: {doc?.dispatchThrough || '—'}</div>
                    </div>
                    <div>
                        <div>Place of Supply: {doc?.placeOfSupply || doc?.billingState || '—'}</div>
                        <div>Payment Term: {doc?.paymentTerms || '—'}</div>
                        <div>Buyer Order Date: {doc?.buyerOrderDate ? fmt(doc.buyerOrderDate) : '—'}</div>
                    </div>
                </div>
            );
        case 'itemTable':
            return (
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                        {visibleCols.map((col) => (
                            <col key={col.id} data-pf-col={col.id} style={{ width: `${col.widthPct}%` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                            {visibleCols.map((col) => (
                                <th
                                    key={col.id}
                                    data-pf-col={col.id}
                                    onClick={(e) => { e.stopPropagation(); onColumnHeaderClick?.(col.id); }}
                                    style={{
                                        border: '1px solid #000',
                                        padding: '4px 6px',
                                        textAlign: col.headerAlign || col.align || 'left',
                                        fontWeight: 700,
                                        fontSize: col.fontSize ? `${col.fontSize}pt` : undefined,
                                        outline: selectedColumnId === col.id ? '2px solid #2563eb' : undefined,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={visibleCols.length} style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>
                                    No items
                                </td>
                            </tr>
                        ) : (
                            items.map((it, i) => (
                                <tr key={i}>
                                    {visibleCols.map((col) => (
                                        <td
                                            key={col.id}
                                            data-pf-col={col.id}
                                            style={{
                                                border: '1px solid #000',
                                                padding: '4px 6px',
                                                textAlign: col.align || 'left',
                                                fontSize: col.fontSize ? `${col.fontSize}pt` : undefined,
                                            }}
                                        >
                                            {getCellValue(col.id, it, i, docType)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            );
        case 'totalsBox': {
            const isIGST = doc?.gstType === 'IGST';
            const lines = [];
            if (isSO) {
                lines.push(['Total Before Tax', doc?.totalAmount]);
                if (Number(doc?.freightAmount || 0) > 0) lines.push(['Freight (Taxable)', doc.freightAmount]);
                lines.push(['Total Taxable Amount', doc?.totalTaxableAmount ?? doc?.totalAmount]);
                if (gstApplicable) {
                    if (isIGST) lines.push(['IGST', doc?.totalIgst ?? doc?.totalGst]);
                    else {
                        lines.push(['CGST', doc?.totalCgst ?? (doc?.totalGst / 2)]);
                        lines.push(['SGST', doc?.totalSgst ?? (doc?.totalGst / 2)]);
                    }
                }
            } else {
                const itemVal = (doc?.totalTaxableAmount ?? doc?.taxableAmount ?? 0) - Number(doc?.freightAmount || 0);
                lines.push(['Total Item Value', itemVal]);
                if (Number(doc?.freightAmount || 0) > 0) lines.push(['+ Freight / Shipping', doc.freightAmount]);
                lines.push(['Total Taxable Value', doc?.totalTaxableAmount ?? doc?.taxableAmount]);
                if (gstApplicable) {
                    const rate = doc?.gstRate || (doc?.items?.[0]?.gstRate) || 18;
                    if (isIGST) lines.push([`+ IGST @ ${rate}%`, doc?.totalIgst ?? doc?.totalTaxAmount]);
                    else {
                        const half = rate / 2;
                        lines.push([`+ CGST @ ${half}%`, doc?.totalCgst ?? (doc?.totalTaxAmount / 2)]);
                        lines.push([`+ SGST @ ${half}%`, doc?.totalSgst ?? (doc?.totalTaxAmount / 2)]);
                    }
                }
            }
            if (doc?.roundOff != null && doc.roundOff !== 0) lines.push(['Round Off', doc.roundOff]);
            return (
                <div style={{ fontSize: 'inherit' }}>
                    {lines.filter(([, v]) => v != null).map(([label, val]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                            <span>{label}</span>
                            <span>{fmtCur(val)}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 900, marginTop: 4, borderTop: '1px solid #000', paddingTop: 4 }}>
                        <span>Grand Total</span>
                        <span>{fmtCur(doc?.roundedTotal ?? doc?.grandTotal)}</span>
                    </div>
                    {doc?.amountInWords && (
                        <div style={{ marginTop: 6, fontSize: '0.85em', fontWeight: 700 }}>{doc.amountInWords} ONLY</div>
                    )}
                </div>
            );
        }
        case 'remarks':
            return (
                <div>
                    <strong>Remarks:</strong> {doc?.remarks || '-'}
                </div>
            );
        case 'terms':
            return (
                <div style={{ fontSize: '0.9em', lineHeight: 1.3 }}>
                    <div style={{ fontWeight: 900, fontSize: '0.85em', marginBottom: 4 }}>Terms &amp; Declaration:</div>
                    {doc?.terms || (
                        <>
                            1. Goods once sold will not be taken back.<br />
                            2. Subject to MUMBAI Jurisdiction.<br />
                            3. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                        </>
                    )}
                </div>
            );
        case 'bankDetails':
            return (
                <div style={{ fontSize: 'inherit' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85em', marginBottom: 4 }}>Bank Details:</div>
                    <div><strong>{company?.bankName || 'BANK OF BARODA'}</strong></div>
                    <div style={{ fontSize: '0.9em' }}>Account Name: {company?.companyName || '—'}</div>
                    {company?.accountNo && <div style={{ fontSize: '0.9em' }}>Account No: {company.accountNo}</div>}
                    {company?.ifscCode && <div style={{ fontSize: '0.9em' }}>IFSC: {company.ifscCode} {company.branchName && `| Branch: ${company.branchName}`}</div>}
                </div>
            );
        case 'signature':
            return (
                <div>
                    <div>For {company?.companyName || 'Company'}</div>
                    <div style={{ marginTop: 24, borderTop: '1px solid #000', paddingTop: 4, fontSize: '0.85em' }}>
                        Authorized Signatory
                    </div>
                </div>
            );
        default:
            return null;
    }
}

function PropertyPanel({
    docType,
    selectedBlockId,
    selectedFieldId,
    selectedBlockIds = [],
    selectedFieldIds = [],
    selectedColumnId,
    setSelectedColumnId,
    mergedBlocks,
    mergedFields,
    columns,
    updateBlock,
    updateField,
    updateColumn,
    moveColumn,
    clearCanvasSelection,
}) {
    if (selectedFieldIds.length > 1) {
        return (
            <div style={{ ...panelCard, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{selectedFieldIds.length} fields selected</div>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                    Drag any selected field on the canvas to move all of them together. Ctrl+Click to add/remove. Esc to clear.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}>
                    {selectedFieldIds.map((id) => {
                        const label = getFieldCatalog(docType).find((x) => x.id === id)?.label || id;
                        return <li key={id}>{label}</li>;
                    })}
                </ul>
                <button type="button" style={btn('#e2e8f0', '#334155')} onClick={clearCanvasSelection}>Clear selection</button>
            </div>
        );
    }

    if (selectedBlockIds.length > 1) {
        return (
            <div style={{ ...panelCard, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{selectedBlockIds.length} blocks selected</div>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                    Drag any selected block on the canvas to move all of them together. Ctrl+Click to add/remove. Esc to clear.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}>
                    {selectedBlockIds.map((id) => (
                        <li key={id}>{BLOCK_LABELS[id] || id}</li>
                    ))}
                </ul>
                <button type="button" style={btn('#e2e8f0', '#334155')} onClick={clearCanvasSelection}>Clear selection</button>
            </div>
        );
    }

    if (selectedColumnId && selectedBlockId === 'itemTable') {
        const col = columns.find((c) => c.id === selectedColumnId);
        if (!col) return null;
        return (
            <div style={{ ...panelCard, display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Column: {col.label || col.id}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={col.visible !== false} onChange={(e) => updateColumn(col.id, { visible: e.target.checked })} />
                    Show column
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    Label
                    <input style={{ ...inp, marginTop: 4 }} value={col.label || ''} onChange={(e) => updateColumn(col.id, { label: e.target.value })} />
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    Width %
                    <input type="number" min="1" max="100" style={{ ...inp, marginTop: 4 }} value={col.widthPct ?? ''} onChange={(e) => updateColumn(col.id, { widthPct: Number(e.target.value) })} />
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    Cell align
                    <select style={{ ...inp, marginTop: 4 }} value={col.align || 'left'} onChange={(e) => updateColumn(col.id, { align: e.target.value })}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    Header align
                    <select style={{ ...inp, marginTop: 4 }} value={col.headerAlign || col.align || 'left'} onChange={(e) => updateColumn(col.id, { headerAlign: e.target.value })}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    Font size (pt)
                    <input type="number" min="6" max="14" style={{ ...inp, marginTop: 4 }} value={col.fontSize ?? 9} onChange={(e) => updateColumn(col.id, { fontSize: Number(e.target.value) })} />
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" style={{ ...btn('#e2e8f0', '#334155'), flex: 1 }} onClick={() => moveColumn(col.id, -1)}>Move Up</button>
                    <button type="button" style={{ ...btn('#e2e8f0', '#334155'), flex: 1 }} onClick={() => moveColumn(col.id, 1)}>Move Down</button>
                </div>
            </div>
        );
    }

    const blockFieldIds = getBlockFieldIds(docType);
    const fieldLayout = selectedFieldId && mergedFields[selectedFieldId];
    if (selectedFieldId && fieldLayout && !blockFieldIds.includes(selectedFieldId)) {
        const catalogEntry = getFieldCatalog(docType).find((x) => x.id === selectedFieldId);
        const label = catalogEntry?.label || selectedFieldId;
        return (
            <div style={{ ...panelCard, display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['x', 'X (mm)'], ['y', 'Y (mm)'], ['width', 'Width (mm)'], ['height', 'Height (mm)']].map(([key, lbl]) => (
                        <label key={key} style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                            {lbl}
                            <input type="number" step="0.5" style={{ ...inp, marginTop: 4 }} value={fieldLayout[key] ?? ''} onChange={(e) => updateField(selectedFieldId, { [key]: Number(e.target.value) })} />
                        </label>
                    ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={fieldLayout.visible !== false} onChange={(e) => updateField(selectedFieldId, { visible: e.target.checked })} />
                    Show on canvas
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    Align
                    <select style={{ ...inp, marginTop: 4 }} value={fieldLayout.align || 'left'} onChange={(e) => updateField(selectedFieldId, { align: e.target.value })}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    Font size (pt)
                    <input type="number" step="0.5" min="6" max="24" style={{ ...inp, marginTop: 4 }} value={fieldLayout.fontSize ?? 9} onChange={(e) => updateField(selectedFieldId, { fontSize: Number(e.target.value) })} />
                </label>
            </div>
        );
    }

    if (!selectedBlockId) {
        return (
            <div style={{ ...panelCard, color: '#64748b', fontSize: 13 }}>
                Click a block on the canvas to edit position, size, and style.
            </div>
        );
    }

    const block = mergedBlocks[selectedBlockId];
    if (!block) return null;

    const setAlign = (align) => updateBlock(selectedBlockId, { align });

    return (
        <div style={{ ...panelCard, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
                {BLOCK_LABELS[selectedBlockId] || selectedBlockId}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                    ['x', 'X (mm)'],
                    ['y', 'Y (mm)'],
                    ['width', 'Width (mm)'],
                    ['height', 'Height (mm)'],
                ].map(([key, label]) => (
                    <label key={key} style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                        {label}
                        <input
                            type="number"
                            step="0.5"
                            style={{ ...inp, marginTop: 4 }}
                            value={block[key] ?? ''}
                            onChange={(e) => updateBlock(selectedBlockId, { [key]: Number(e.target.value) })}
                        />
                    </label>
                ))}
            </div>

            <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Align</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {['left', 'center', 'right'].map((a) => (
                        <button
                            key={a}
                            type="button"
                            onClick={() => setAlign(a)}
                            style={{
                                ...btn(block.align === a ? '#2563eb' : '#e2e8f0', block.align === a ? '#fff' : '#334155'),
                                flex: 1,
                                textTransform: 'capitalize',
                            }}
                        >
                            {a}
                        </button>
                    ))}
                </div>
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                Font size (pt)
                <input
                    type="number"
                    step="0.5"
                    min="6"
                    max="24"
                    style={{ ...inp, marginTop: 4 }}
                    value={block.fontSize ?? 10}
                    onChange={(e) => updateBlock(selectedBlockId, { fontSize: Number(e.target.value) })}
                />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                    type="checkbox"
                    checked={!!block.bold}
                    onChange={(e) => updateBlock(selectedBlockId, { bold: e.target.checked })}
                />
                Bold
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                    type="checkbox"
                    checked={!!block.border}
                    onChange={(e) => updateBlock(selectedBlockId, { border: e.target.checked })}
                />
                Border
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                    type="checkbox"
                    checked={block.visible !== false}
                    onChange={(e) => updateBlock(selectedBlockId, { visible: e.target.checked })}
                />
                Show block
            </label>

            {selectedBlockId === 'itemTable' && columns.length > 0 && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                    <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 13 }}>Table columns — click to edit</div>
                    <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                        {columns.map((col) => (
                            <button
                                key={col.id}
                                type="button"
                                onClick={() => setSelectedColumnId(col.id)}
                                style={{
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    border: selectedColumnId === col.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                    background: selectedColumnId === col.id ? '#eff6ff' : '#f8fafc',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    fontWeight: 600,
                                }}
                            >
                                {col.label || col.id} {col.visible === false ? '(hidden)' : ''} — {col.widthPct}%
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PrintFormatWysiwygEditor({
    docType,
    form,
    setForm,
    sampleDocument,
    company,
    isLayoutPreview = false,
    onSaveDraft,
    onApprove,
    onSetDefault,
    onExit,
    saving,
}) {
    const [selectedBlockId, setSelectedBlockId] = useState(null);
    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [selectedBlockIds, setSelectedBlockIds] = useState([]);
    const [selectedFieldIds, setSelectedFieldIds] = useState([]);
    const [selectedColumnId, setSelectedColumnId] = useState(null);
    const [drag, setDrag] = useState(null);
    const [dragScale, setDragScale] = useState(1);
    const [fitScale, setFitScale] = useState(1);
    const [showRuler, setShowRuler] = useState(true);
    const [showMargins, setShowMargins] = useState(true);
    const [zoomPct, setZoomPct] = useState(100);

    const canvasWrapRef = useRef(null);
    const rootRef = useRef(null);

    const pageMeta = useMemo(() => resolvePageSizeMm(form), [form.paperSize, form.orientation, form.customPaper?.widthMm, form.customPaper?.heightMm]);
    const marginMm = useMemo(() => marginsToMm(form.margins), [form.margins]);
    const pageWidthMm = pageMeta.widthMm;
    const pageHeightMm = pageMeta.heightMm;

    const fieldCatalog = useMemo(() => getFieldCatalog(docType), [docType]);
    const blockFieldIds = useMemo(() => getBlockFieldIds(docType), [docType]);

    const mergedBlocks = useMemo(
        () => mergeBlocks(form.layout?.blocks || {}, docType),
        [form.layout?.blocks, docType],
    );

    const mergedFields = useMemo(
        () => mergeFields(form.layout?.fields || {}, docType),
        [form.layout?.fields, docType],
    );

    const columns = useMemo(
        () => mergeColumns(form.layout?.itemTable?.columns || [], docType),
        [form.layout?.itemTable?.columns, docType],
    );

    const canvasContentMinH = useMemo(
        () => getLayoutMinHeightMm(mergedBlocks),
        [mergedBlocks],
    );

    const contentWidthMm = Math.max(
        40,
        pageWidthMm - marginMm.left - marginMm.right,
    );

    useEffect(() => {
        setForm((prev) => {
            const nextLayout = {
                ...(prev.layout || {}),
                pageWidthMm,
                pageHeightMm,
                contentWidthMm,
            };
            if (
                prev.layout?.pageWidthMm === pageWidthMm
                && prev.layout?.pageHeightMm === pageHeightMm
                && prev.layout?.contentWidthMm === contentWidthMm
            ) {
                return prev;
            }
            return { ...prev, layout: nextLayout };
        });
    }, [pageWidthMm, pageHeightMm, contentWidthMm, setForm]);

    const updateBlock = useCallback((id, partial) => {
        setForm((prev) => ({
            ...prev,
            layout: {
                ...prev.layout,
                blocks: {
                    ...(prev.layout?.blocks || {}),
                    [id]: { ...(prev.layout?.blocks?.[id] || {}), ...partial },
                },
            },
        }));
    }, [setForm]);

    const updateField = useCallback((fieldId, partial) => {
        setForm((prev) => ({
            ...prev,
            layout: {
                ...prev.layout,
                fields: {
                    ...(prev.layout?.fields || {}),
                    [fieldId]: { ...(prev.layout?.fields?.[fieldId] || mergedFields[fieldId] || {}), ...partial },
                },
            },
        }));
    }, [setForm, mergedFields]);

    const moveItemsByDelta = useCallback((kind, origins, dxMm, dyMm) => {
        setForm((prev) => {
            if (kind === 'fields') {
                const fields = { ...(prev.layout?.fields || {}) };
                Object.entries(origins).forEach(([id, orig]) => {
                    fields[id] = {
                        ...(fields[id] || mergedFields[id] || {}),
                        x: Math.max(0, Math.round((orig.x + dxMm) * 10) / 10),
                        y: Math.max(0, Math.round((orig.y + dyMm) * 10) / 10),
                    };
                });
                return { ...prev, layout: { ...prev.layout, fields } };
            }
            const blocks = { ...(prev.layout?.blocks || {}) };
            Object.entries(origins).forEach(([id, orig]) => {
                blocks[id] = {
                    ...(blocks[id] || {}),
                    x: Math.max(0, Math.round((orig.x + dxMm) * 10) / 10),
                    y: Math.max(0, Math.round((orig.y + dyMm) * 10) / 10),
                };
            });
            return { ...prev, layout: { ...prev.layout, blocks } };
        });
    }, [setForm, mergedFields]);

    const clearCanvasSelection = useCallback(() => {
        setSelectedBlockId(null);
        setSelectedFieldId(null);
        setSelectedBlockIds([]);
        setSelectedFieldIds([]);
        setSelectedColumnId(null);
    }, []);

    const selectField = useCallback((fieldId, { additive = false } = {}) => {
        setSelectedColumnId(null);
        setSelectedBlockId(null);
        setSelectedBlockIds([]);
        if (additive) {
            setSelectedFieldIds((prev) => {
                const has = prev.includes(fieldId);
                const next = has ? prev.filter((id) => id !== fieldId) : [...prev, fieldId];
                setSelectedFieldId(next.length ? (has ? next[next.length - 1] || null : fieldId) : null);
                return next;
            });
            return;
        }
        setSelectedFieldIds([fieldId]);
        setSelectedFieldId(fieldId);
    }, []);

    const selectBlock = useCallback((blockId, { additive = false } = {}) => {
        setSelectedColumnId(null);
        setSelectedFieldId(null);
        setSelectedFieldIds([]);
        if (additive) {
            setSelectedBlockIds((prev) => {
                const has = prev.includes(blockId);
                const next = has ? prev.filter((id) => id !== blockId) : [...prev, blockId];
                setSelectedBlockId(next.length ? (has ? next[next.length - 1] || null : blockId) : null);
                return next;
            });
            return;
        }
        setSelectedBlockIds([blockId]);
        setSelectedBlockId(blockId);
    }, []);

    const updateColumn = useCallback((colId, partial) => {
        setForm((prev) => {
            const existing = mergeColumns(prev.layout?.itemTable?.columns || [], docType);
            return {
                ...prev,
                layout: {
                    ...prev.layout,
                    itemTable: {
                        ...(prev.layout?.itemTable || {}),
                        columns: existing.map((c) => (c.id === colId ? { ...c, ...partial } : c)),
                    },
                },
            };
        });
    }, [setForm, docType]);

    const moveColumn = useCallback((colId, dir) => {
        setForm((prev) => {
            const cols = [...mergeColumns(prev.layout?.itemTable?.columns || [], docType)];
            const idx = cols.findIndex((c) => c.id === colId);
            if (idx < 0) return prev;
            const swap = idx + dir;
            if (swap < 0 || swap >= cols.length) return prev;
            const tmp = cols[idx].order;
            cols[idx] = { ...cols[idx], order: cols[swap].order ?? swap };
            cols[swap] = { ...cols[swap], order: tmp ?? idx };
            cols.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            return {
                ...prev,
                layout: {
                    ...prev.layout,
                    itemTable: { ...(prev.layout?.itemTable || {}), columns: cols },
                },
            };
        });
    }, [setForm, docType]);

    const addFieldToCanvas = useCallback((fieldId) => {
        const cat = fieldCatalog.find((f) => f.id === fieldId);
        if (!cat) return;
        if (cat.isBlock) {
            const key = cat.blockKey || cat.id;
            updateBlock(key, { visible: true });
            updateField(fieldId, { onCanvas: true, visible: true });
            selectBlock(key);
        } else {
            updateField(fieldId, { onCanvas: true, visible: true });
            selectField(fieldId);
        }
    }, [fieldCatalog, updateBlock, updateField, selectBlock, selectField]);

    const hideField = useCallback((fieldId) => {
        const cat = fieldCatalog.find((f) => f.id === fieldId);
        if (cat?.isBlock) {
            const key = cat.blockKey || cat.id;
            updateBlock(key, { visible: false });
            setSelectedBlockIds((prev) => prev.filter((id) => id !== key));
            if (selectedBlockId === key) setSelectedBlockId(null);
        }
        updateField(fieldId, { onCanvas: false, visible: false });
        setSelectedFieldIds((prev) => prev.filter((id) => id !== fieldId));
        if (selectedFieldId === fieldId) setSelectedFieldId(null);
    }, [fieldCatalog, updateBlock, updateField, selectedBlockId, selectedFieldId]);

    useEffect(() => {
        const root = rootRef.current;
        const wrap = canvasWrapRef.current;
        if (!root || !wrap) return undefined;

        const measure = () => {
            const rootWidth = root.getBoundingClientRect().width;
            if (rootWidth > 0) {
                setDragScale(rootWidth / contentWidthMm);
            }
            const available = wrap.clientWidth - 48;
            if (available > 0) {
                const autoFit = Math.min(1, available / (pageWidthMm * PX_PER_MM));
                setFitScale(autoFit * (zoomPct / 100));
            }
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(root);
        ro.observe(wrap);
        window.addEventListener('resize', measure);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [contentWidthMm, pageWidthMm, zoomPct]);

    useEffect(() => {
        if (!drag) return undefined;

        const onMove = (e) => {
            const dx = (e.clientX - drag.startX) / dragScale;
            const dy = (e.clientY - drag.startY) / dragScale;
            moveItemsByDelta(drag.kind, drag.origins, dx, dy);
        };

        const onUp = () => setDrag(null);

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [drag, dragScale, moveItemsByDelta]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') clearCanvasSelection();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [clearCanvasSelection]);

    const handleFieldMouseDown = (e, fieldId) => {
        e.preventDefault();
        e.stopPropagation();
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        if (additive) {
            selectField(fieldId, { additive: true });
            return;
        }
        let idsForDrag = selectedFieldIds.includes(fieldId) && selectedFieldIds.length
            ? selectedFieldIds
            : [fieldId];
        if (!selectedFieldIds.includes(fieldId)) {
            selectField(fieldId);
            idsForDrag = [fieldId];
        } else {
            setSelectedFieldId(fieldId);
        }

        const origins = {};
        idsForDrag.forEach((id) => {
            const f = mergedFields[id];
            if (f) origins[id] = { x: Number(f.x) || 0, y: Number(f.y) || 0 };
        });
        if (!Object.keys(origins).length) return;
        setDrag({
            kind: 'fields',
            origins,
            startX: e.clientX,
            startY: e.clientY,
        });
    };

    const handleBlockMouseDown = (e, blockId) => {
        e.preventDefault();
        e.stopPropagation();
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        if (additive) {
            selectBlock(blockId, { additive: true });
            return;
        }
        let idsForDrag = selectedBlockIds.includes(blockId) && selectedBlockIds.length
            ? selectedBlockIds
            : [blockId];
        if (!selectedBlockIds.includes(blockId)) {
            selectBlock(blockId);
            idsForDrag = [blockId];
        } else {
            setSelectedBlockId(blockId);
        }

        const origins = {};
        idsForDrag.forEach((id) => {
            const b = mergedBlocks[id];
            if (b) origins[id] = { x: Number(b.x) || 0, y: Number(b.y) || 0 };
        });
        if (!Object.keys(origins).length) return;
        setDrag({
            kind: 'blocks',
            origins,
            startX: e.clientX,
            startY: e.clientY,
        });
    };

    const margins = form.margins || { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' };
    const marginUnit = margins.unit || 'mm';
    const canvasPadding = `${margins.top ?? 10}${marginUnit === 'inch' ? 'in' : 'mm'} ${margins.right ?? 10}${marginUnit === 'inch' ? 'in' : 'mm'} ${margins.bottom ?? 10}${marginUnit === 'inch' ? 'in' : 'mm'} ${margins.left ?? 10}${marginUnit === 'inch' ? 'in' : 'mm'}`;

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f1f5f9', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 20px',
                    background: '#fff',
                    borderBottom: '1px solid #e2e8f0',
                    flexWrap: 'wrap',
                    gap: 8,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" onClick={onExit} style={btn('#64748b')}>
                        Exit
                    </button>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{form.name || 'Untitled Format'}</span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{docType} WYSIWYG</span>
                    <span style={{ fontSize: 11, color: '#334155', background: '#e2e8f0', padding: '4px 10px', borderRadius: 6 }}>
                        {pageWidthMm} × {pageHeightMm} mm · {pageMeta.orientation}
                    </span>
                    {isLayoutPreview ? (
                        <span style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '4px 10px', borderRadius: 6, border: '1px solid #fcd34d' }}>
                            Designer preview only — does not affect live invoice/SO print
                        </span>
                    ) : (
                        <span style={{ fontSize: 11, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: 6, border: '1px solid #6ee7b7' }}>
                            Live data: {sampleDocument?.displayInvoiceNumber || sampleDocument?.invoiceNumber || sampleDocument?.soNumber || 'document'}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" style={btn('#16a34a')} onClick={onSaveDraft} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button type="button" style={btn('#0d9488')} onClick={onApprove}>
                        Approve
                    </button>
                    <button type="button" style={btn('#2563eb')} onClick={onSetDefault} title="Requires Approved status">
                        Set Active Default
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 300px', gap: 12, padding: 16, flex: 1, alignItems: 'start' }}>
                <div style={{ ...panelCard, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Field Library</div>
                    <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px' }}>Add fields to canvas. Values from document only.</p>
                    <p style={{ fontSize: 11, color: '#1d4ed8', margin: '0 0 10px', lineHeight: 1.35 }}>
                        Multi-select: Ctrl+Click (⌘ on Mac) fields/blocks, then drag any selected item to move all together. Esc clears selection.
                    </p>
                    {Object.entries(
                        fieldCatalog.reduce((acc, f) => {
                            if (!acc[f.group]) acc[f.group] = [];
                            acc[f.group].push(f);
                            return acc;
                        }, {}),
                    ).map(([group, fields]) => (
                        <div key={group} style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 4, textTransform: 'uppercase' }}>{group}</div>
                            {fields.map((f) => {
                                const active = f.isBlock
                                    ? mergedBlocks[f.blockKey || f.id]?.visible !== false
                                    : mergedFields[f.id]?.onCanvas && mergedFields[f.id]?.visible !== false;
                                return (
                                    <div key={f.id} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                const additive = e.ctrlKey || e.metaKey || e.shiftKey;
                                                if (f.isBlock) {
                                                    selectBlock(f.blockKey || f.id, { additive });
                                                } else {
                                                    selectField(f.id, { additive });
                                                }
                                            }}
                                            style={{
                                                flex: 1,
                                                textAlign: 'left',
                                                fontSize: 11,
                                                padding: '4px 6px',
                                                borderRadius: 6,
                                                border: (f.isBlock
                                                    ? selectedBlockIds.includes(f.blockKey || f.id)
                                                    : selectedFieldIds.includes(f.id))
                                                    ? '1px solid #2563eb'
                                                    : '1px solid #e2e8f0',
                                                background: active ? '#f0fdf4' : '#fff',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {f.label}
                                        </button>
                                        {active ? (
                                            <button type="button" style={{ ...btn('#94a3b8'), padding: '4px 6px', fontSize: 10 }} onClick={() => hideField(f.id)}>Hide</button>
                                        ) : (
                                            <button type="button" style={{ ...btn('#2563eb'), padding: '4px 6px', fontSize: 10 }} onClick={() => addFieldToCanvas(f.id)}>Add</button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
                <div
                    ref={canvasWrapRef}
                    style={{
                        background: '#e2e8f0',
                        borderRadius: 8,
                        padding: 16,
                        overflow: 'auto',
                        minHeight: 520,
                        display: 'flex',
                        justifyContent: 'center',
                    }}
                    onClick={() => clearCanvasSelection()}
                >
                    <div
                        style={{
                            display: 'inline-block',
                            transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
                            transformOrigin: 'top center',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: showRuler ? '18px 1fr' : '1fr', gridTemplateRows: showRuler ? '18px 1fr' : '1fr' }}>
                            {showRuler && <div style={{ background: '#f1f5f9' }} />}
                            {showRuler && <RulerBar lengthMm={pageWidthMm} horizontal />}
                            {showRuler && <RulerBar lengthMm={pageHeightMm} horizontal={false} />}
                            <div
                                className="pf-wysiwyg-canvas"
                                style={{
                                    position: 'relative',
                                    width: `${pageWidthMm}mm`,
                                    minHeight: `${pageHeightMm}mm`,
                                    height: `${pageHeightMm}mm`,
                                    background: '#fff',
                                    boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                                    boxSizing: 'border-box',
                                    padding: canvasPadding,
                                    overflow: 'hidden',
                                }}
                            >
                                {showMargins && (
                                    <div
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            top: `${marginMm.top}mm`,
                                            right: `${marginMm.right}mm`,
                                            bottom: `${marginMm.bottom}mm`,
                                            left: `${marginMm.left}mm`,
                                            border: '1px dashed #93c5fd',
                                            pointerEvents: 'none',
                                            boxSizing: 'border-box',
                                            zIndex: 2,
                                        }}
                                    />
                                )}
                                <div
                                    ref={rootRef}
                                    className="pf-block-layout-root"
                                    style={{
                                        position: 'relative',
                                        width: '100%',
                                        minHeight: `${Math.max(canvasContentMinH, pageHeightMm - marginMm.top - marginMm.bottom)}mm`,
                                        zIndex: 1,
                                    }}
                                >
                                    {docType === 'Sales Order' ? (
                                        /* Single SO render engine — same blocks as live print/PDF */
                                        PRINT_BLOCK_IDS.map((blockId) => {
                                            const block = mergedBlocks[blockId];
                                            if (!block || block.visible === false) return null;
                                            const selected = selectedBlockIds.includes(blockId);
                                            return (
                                                <div
                                                    key={blockId}
                                                    data-pf-block={blockId}
                                                    style={blockInlineStyle(block, { selected })}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onMouseDown={(e) => handleBlockMouseDown(e, blockId)}
                                                >
                                                    <SalesOrderPrintBlockContent
                                                        blockId={blockId}
                                                        so={sampleDocument}
                                                        company={company}
                                                        columns={columns}
                                                        pageItems={sampleDocument?.items || []}
                                                        pageIdx={0}
                                                        isLastPage
                                                        embedTotalsInTable={false}
                                                        onColumnHeaderClick={(colId) => {
                                                            selectBlock('itemTable');
                                                            setSelectedColumnId(colId);
                                                        }}
                                                        selectedColumnId={selectedBlockId === 'itemTable' ? selectedColumnId : null}
                                                    />
                                                </div>
                                            );
                                        })
                                    ) : (
                                        PRINT_BLOCK_IDS.map((blockId) => {
                                            const block = mergedBlocks[blockId];
                                            if (!block || block.visible === false) return null;
                                            const selected = selectedBlockIds.includes(blockId);
                                            return (
                                                <div
                                                    key={blockId}
                                                    data-pf-block={blockId}
                                                    style={blockInlineStyle(block, { selected })}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onMouseDown={(e) => handleBlockMouseDown(e, blockId)}
                                                >
                                                    <BlockContent
                                                        blockId={blockId}
                                                        docType={docType}
                                                        doc={sampleDocument}
                                                        company={company}
                                                        columns={columns}
                                                        onColumnHeaderClick={(colId) => {
                                                            selectBlock('itemTable');
                                                            setSelectedColumnId(colId);
                                                        }}
                                                        selectedColumnId={selectedBlockId === 'itemTable' ? selectedColumnId : null}
                                                    />
                                                </div>
                                            );
                                        })
                                    )}
                                    {fieldCatalog.filter((f) => !f.isBlock).map((f) => {
                                        const fl = mergedFields[f.id];
                                        if (!fl?.onCanvas || fl.visible === false) return null;
                                        const selected = selectedFieldIds.includes(f.id);
                                        return (
                                            <div
                                                key={`field-${f.id}`}
                                                data-pf-field={f.id}
                                                style={blockInlineStyle(fl, { selected })}
                                                onClick={(e) => e.stopPropagation()}
                                                onMouseDown={(e) => handleFieldMouseDown(e, f.id)}
                                            >
                                                <div style={{ fontSize: fl.fontSize ? `${fl.fontSize}pt` : '9pt', fontWeight: fl.bold ? 700 : 400 }}>
                                                    {getFieldDisplayValue(f.id, docType, sampleDocument, company) || f.label}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ position: 'sticky', top: 16, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                    <PageSetupPanel
                        form={form}
                        setForm={setForm}
                        showRuler={showRuler}
                        setShowRuler={setShowRuler}
                        showMargins={showMargins}
                        setShowMargins={setShowMargins}
                        zoomPct={zoomPct}
                        setZoomPct={setZoomPct}
                        pageMeta={pageMeta}
                    />
                    <PropertyPanel
                        docType={docType}
                        selectedBlockId={selectedBlockId}
                        selectedFieldId={selectedFieldId}
                        selectedBlockIds={selectedBlockIds}
                        selectedFieldIds={selectedFieldIds}
                        selectedColumnId={selectedColumnId}
                        setSelectedColumnId={setSelectedColumnId}
                        mergedBlocks={mergedBlocks}
                        mergedFields={mergedFields}
                        columns={columns}
                        updateBlock={updateBlock}
                        updateField={updateField}
                        updateColumn={updateColumn}
                        moveColumn={moveColumn}
                        clearCanvasSelection={clearCanvasSelection}
                    />
                </div>
            </div>
        </div>
    );
}
