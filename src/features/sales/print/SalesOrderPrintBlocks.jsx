/**
 * Sales Order print block content — SAME markup used by:
 * browser print, designer, and (via HTML twin) PDF/WhatsApp/Email.
 * Layout metadata (x/y/w/h/font/align/visibility) is applied by the parent shell.
 * Do not change GST/totals calculations here.
 */
import React from 'react';
import { documentLogoImgProps } from '@/config/documentBranding';
import {
    cleanCustomerName,
    fmtDate,
    fmtMoney,
    resolveGstFlags,
    soItemSrNo,
} from './salesOrderPrintUtils';

const tdBorder = { border: '1px solid #000', padding: '6px', verticalAlign: 'top' };
const thBorder = {
    border: '1px solid #000',
    padding: '8px 6px',
    fontWeight: 800,
    background: '#f5f5f5',
};

/** Compact columns must stay on one line (SR / AMOUNT headers + numeric values). */
const COMPACT_COL_IDS = new Set(['sr', 'hsn', 'qty', 'rate', 'amount']);

/** Approved AFTER print columns — full width, Amount last, no trailing blank column.
 * Freed spacer width goes mainly to DESCRIPTION, then ITEM CODE and ADDITIONAL NOTES.
 * Numeric columns stay compact. Percentages must sum to 100. */
export const SO_PRINT_COLUMNS = [
    { id: 'sr', label: 'SR', width: '4%', widthPct: 4, align: 'center' },
    { id: 'itemCode', label: 'ITEM CODE', width: '18%', widthPct: 18, align: 'left' },
    { id: 'description', label: 'DESCRIPTION', width: '33%', widthPct: 33, align: 'left' },
    { id: 'notes', label: 'ADDITIONAL NOTES', width: '18%', widthPct: 18, align: 'left' },
    { id: 'hsn', label: 'HSN', width: '6%', widthPct: 6, align: 'center' },
    { id: 'qty', label: 'QTY', width: '5%', widthPct: 5, align: 'center' },
    { id: 'rate', label: 'RATE', width: '7%', widthPct: 7, align: 'right' },
    { id: 'amount', label: 'AMOUNT', width: '9%', widthPct: 9, align: 'right' },
];

function visibleColumns(columns) {
    const source = Array.isArray(columns) && columns.length
        ? columns
        : SO_PRINT_COLUMNS.map((c) => ({ ...c, visible: true }));
    return source.filter((c) => c.visible !== false && c.id !== 'spacer');
}

function cellValue(colId, item, srNo, visibleColIds = []) {
    switch (colId) {
        case 'sr':
            return srNo;
        case 'itemCode':
            return item.itemCode || '—';
        case 'description':
            return item.description || item.itemName || '—';
        case 'notes':
            return item.additionalNotes || '—';
        case 'hsn':
            return item.hsnCode || '—';
        case 'qty':
            if (visibleColIds.includes('uom')) return `${item.qty ?? ''}`;
            return `${item.qty ?? ''} ${item.uom || ''}`.trim();
        case 'uom':
            return item.uom || '—';
        case 'rate':
            return fmtMoney(item.rate);
        case 'amount':
            return fmtMoney(item.amount ?? (Number(item.qty) || 0) * (Number(item.rate) || 0));
        default:
            return item[colId] ?? '—';
    }
}

export function SoBlockLogo({ company }) {
    const img = documentLogoImgProps({
        ...company,
        logoHeight: company?.logoHeight || 80,
    });
    if (!img.src) return null;
    return (
        <img
            src={img.src}
            alt={img.alt}
            style={{ ...img.style, maxHeight: company?.logoHeight || 80 }}
            onError={img.onError}
            draggable={false}
        />
    );
}

export function SoBlockCompanyDetails({ company, gstApplicable }) {
    return (
        <div>
            <div style={{ fontSize: '20pt', fontWeight: 900, color: '#000', marginBottom: 2, lineHeight: 1.1 }}>
                {company?.companyName || 'JSK URJA'}
            </div>
            <div style={{ fontSize: '9pt', color: '#000', lineHeight: 1.3, maxWidth: 450 }}>
                {company?.address}
                <br />
                {company?.city || company?.state
                    ? `${company.city || ''} ${company.state || ''}, India. Postal Code: ${company.pincode || ''}. State Code: ${company.stateCode || ''}`
                    : ''}
                <br />
                {(company?.phone || company?.email) &&
                    `Phone: ${company.phone || ''} Email: ${company.email || ''}`}
                <br />
                {gstApplicable && company?.gstNumber && <strong>GSTIN: {company.gstNumber}</strong>}
            </div>
        </div>
    );
}

export function SoBlockDocumentTitle({ so }) {
    return (
        <h1
            style={{
                margin: '0 0 2px 0',
                fontSize: '16pt',
                fontWeight: 900,
                textTransform: 'uppercase',
                color: '#64748b',
            }}
        >
            {so?.seriesId?.isEstimate ? 'ESTIMATE' : 'SALES ORDER'}
        </h1>
    );
}

export function SoBlockDocumentNumber({ so, gstApplicable }) {
    return (
        <div>
            {!gstApplicable && (
                <div style={{ fontSize: '10pt', fontWeight: 700, marginBottom: 4 }}>(NON-GST)</div>
            )}
            <div style={{ fontSize: '14pt', fontWeight: 700, color: '#334155' }}>{so?.soNumber}</div>
        </div>
    );
}

export function SoBlockCustomerDetails({ so, gstApplicable }) {
    const label = { fontSize: '10pt', fontWeight: 800, padding: '4px 0', verticalAlign: 'top', width: 120 };
    const value = { fontSize: '10pt', padding: '4px 0', color: '#333' };
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
                <tr>
                    <td style={{ ...label, fontSize: '11pt' }}>Customer Name:</td>
                    <td style={{ ...value, fontSize: '11pt', fontWeight: 800, textTransform: 'uppercase' }}>
                        {cleanCustomerName(so)}
                    </td>
                </tr>
                <tr>
                    <td style={{ ...label, padding: '8px 0 4px 0' }}>Address:</td>
                    <td style={{ ...value, padding: '8px 0 4px 0', lineHeight: 1.4 }}>
                        {so?.billingAddress || so?.shippingAddress || '—'}
                    </td>
                </tr>
                {(so?.customerState || so?.customerStateCode) && (
                    <tr>
                        <td style={label}>State:</td>
                        <td style={value}>
                            {so.customerState || ''}{' '}
                            {so.customerStateCode ? `(${so.customerStateCode})` : ''}
                        </td>
                    </tr>
                )}
                {so?.customerPhone && (
                    <tr>
                        <td style={label}>Contact No:</td>
                        <td style={value}>{so.customerPhone}</td>
                    </tr>
                )}
                {so?.customerEmail && (
                    <tr>
                        <td style={label}>Email ID:</td>
                        <td style={value}>{so.customerEmail}</td>
                    </tr>
                )}
                {gstApplicable && so?.customerGstin && (
                    <tr>
                        <td style={label}>GST No:</td>
                        <td style={value}>{so.customerGstin}</td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}

export function SoBlockDocumentDetails({ so }) {
    const label = { fontSize: '10pt', fontWeight: 800, padding: '4px 0', width: 140 };
    const value = { fontSize: '10pt', padding: '4px 0' };
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
                <tr>
                    <td style={label}>Date:</td>
                    <td style={value}>{fmtDate(so?.soDate)}</td>
                </tr>
                <tr>
                    <td style={label}>Order Category:</td>
                    <td style={value}>{so?.orderCategory || 'Order'}</td>
                </tr>
                {so?.orderCategory === 'Replacement' && so?.warrantyDetails && (
                    <tr>
                        <td style={{ ...label, color: '#dc2626', verticalAlign: 'top' }}>Warranty Details:</td>
                        <td style={{ ...value, color: '#dc2626', fontWeight: 700 }}>{so.warrantyDetails}</td>
                    </tr>
                )}
                <tr>
                    <td style={label}>Delivery Date:</td>
                    <td style={value}>{fmtDate(so?.deliveryDate)}</td>
                </tr>
                <tr>
                    <td style={{ ...label, verticalAlign: 'top' }}>
                        Customer&apos;s
                        <br />
                        Purchase Order:
                    </td>
                    <td style={{ ...value, verticalAlign: 'top' }}>{so?.customerPO || 'VERBAL'}</td>
                </tr>
                <tr>
                    <td style={label}>
                        Customer&apos;s
                        <br />
                        PO Date:
                    </td>
                    <td style={value}>{fmtDate(so?.customerPODate || so?.soDate)}</td>
                </tr>
            </tbody>
        </table>
    );
}

export function SoBlockItemTable({
    so,
    pageItems,
    pageIdx = 0,
    isLastPage = true,
    showTotals = true,
    columns,
    onColumnHeaderClick,
    selectedColumnId,
    srStart = null,
}) {
    const { gstApplicable, isIGST, gstRate } = resolveGstFlags(so);
    const cols = visibleColumns(columns);
    const colCount = cols.length;
    const visibleColIds = cols.map((c) => c.id);

    return (
        <table
            className="print-items-table"
            style={{
                width: '100%',
                maxWidth: '100%',
                borderCollapse: 'collapse',
                fontSize: '10pt',
                border: '1px solid #000',
                tableLayout: 'fixed',
                boxSizing: 'border-box',
            }}
        >
            <colgroup>
                {cols.map((col) => (
                    <col
                        key={col.id}
                        data-pf-col={col.id}
                        style={col.widthPct ? { width: `${col.widthPct}%` } : col.width ? { width: col.width } : undefined}
                    />
                ))}
            </colgroup>
            <thead>
                <tr>
                    {cols.map((col) => (
                        <th
                            key={col.id}
                            data-pf-col={col.id}
                            onClick={(e) => {
                                if (!onColumnHeaderClick) return;
                                e.stopPropagation();
                                onColumnHeaderClick(col.id);
                            }}
                            style={{
                                ...thBorder,
                                padding: COMPACT_COL_IDS.has(col.id) ? '8px 3px' : thBorder.padding,
                                textAlign: col.headerAlign || col.align || 'left',
                                whiteSpace: COMPACT_COL_IDS.has(col.id) ? 'nowrap' : undefined,
                                overflowWrap: COMPACT_COL_IDS.has(col.id) ? 'normal' : undefined,
                                wordBreak: COMPACT_COL_IDS.has(col.id) ? 'keep-all' : undefined,
                                outline: selectedColumnId === col.id ? '2px solid #2563eb' : undefined,
                                cursor: onColumnHeaderClick ? 'pointer' : undefined,
                            }}
                        >
                            {col.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {(pageItems || []).map((item, i) => {
                    const srNo = srStart != null ? Number(srStart) + i : soItemSrNo(pageIdx, i);
                    return (
                        <tr key={i}>
                            {cols.map((col) => (
                                <td
                                    key={col.id}
                                    data-pf-col={col.id}
                                    style={{
                                        ...tdBorder,
                                        textAlign: col.align || 'left',
                                        fontWeight: col.id === 'description' || col.id === 'qty' || col.id === 'amount' ? 700 : undefined,
                                        textTransform: col.id === 'itemCode' || col.id === 'description' ? 'uppercase' : undefined,
                                        fontSize: col.id === 'notes' || col.id === 'hsn' ? '9pt' : undefined,
                                        overflowWrap: COMPACT_COL_IDS.has(col.id)
                                            ? 'normal'
                                            : (col.id === 'itemCode' || col.id === 'description' || col.id === 'notes')
                                                ? 'break-word'
                                                : undefined,
                                        wordBreak: COMPACT_COL_IDS.has(col.id)
                                            ? 'keep-all'
                                            : col.id === 'itemCode' ? 'normal' : undefined,
                                        whiteSpace: COMPACT_COL_IDS.has(col.id) ? 'nowrap' : undefined,
                                        padding: COMPACT_COL_IDS.has(col.id) ? '6px 3px' : tdBorder.padding,
                                    }}
                                >
                                    {cellValue(col.id, item, srNo, visibleColIds)}
                                </td>
                            ))}
                        </tr>
                    );
                })}
                {!isLastPage && (
                    <tr>
                        <td
                            colSpan={colCount}
                            style={{
                                border: '1px solid #000',
                                padding: 8,
                                textAlign: 'right',
                                fontStyle: 'italic',
                                fontSize: '9pt',
                                background: '#fafafa',
                            }}
                        >
                            Continued on next page...
                        </td>
                    </tr>
                )}
            </tbody>
            {isLastPage && showTotals && (
                <SoTotalsRows so={so} gstApplicable={gstApplicable} isIGST={isIGST} gstRate={gstRate} colCount={colCount} />
            )}
        </table>
    );
}

function SoTotalsRows({ so, gstApplicable, isIGST, gstRate, colCount }) {
    const emptyLead = colCount > 2 ? (
        <td colSpan={colCount - 2} style={{ border: 'none' }} />
    ) : null;

    return (
        <tbody style={{ borderTop: '2px solid #000' }} data-pf-block-inner="totalsBox">
            <tr style={{ background: '#f5f5f5' }}>
                <td colSpan={Math.max(colCount - 3, 1)} style={{ ...tdBorder, fontWeight: 'bold' }}>
                    Total Quantity:
                </td>
                <td style={{ ...tdBorder, textAlign: 'center', fontWeight: 'bold' }}>
                    {(so?.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}
                </td>
                <td style={{ ...tdBorder, fontWeight: 'bold' }}>Total Taxable</td>
                <td style={{ ...tdBorder, textAlign: 'right', fontWeight: 'bold' }}>{fmtMoney(so?.totalAmount)}</td>
            </tr>
            {Number(so?.freightAmount || 0) > 0 && (
                <tr>
                    {emptyLead}
                    <td style={{ ...tdBorder, fontWeight: 'bold' }}>Freight</td>
                    <td style={{ ...tdBorder, textAlign: 'right' }}>{fmtMoney(so.freightAmount)}</td>
                </tr>
            )}
            {gstApplicable && (
                <tr>
                    {emptyLead}
                    <td style={{ ...tdBorder, fontWeight: 'bold' }}>Taxable Amount</td>
                    <td style={{ ...tdBorder, textAlign: 'right', fontWeight: 'bold' }}>
                        {fmtMoney((so?.totalAmount || 0) + (so?.freightAmount || 0))}
                    </td>
                </tr>
            )}
            {gstApplicable &&
                (isIGST ? (
                    <tr>
                        {emptyLead}
                        <td style={{ ...tdBorder, fontWeight: 'bold' }}>IGST @ {gstRate}%</td>
                        <td style={{ ...tdBorder, textAlign: 'right' }}>{fmtMoney(so?.totalIgst || so?.totalGst)}</td>
                    </tr>
                ) : (
                    <>
                        <tr>
                            {emptyLead}
                            <td style={{ ...tdBorder, fontWeight: 'bold' }}>CGST @ {gstRate / 2}%</td>
                            <td style={{ ...tdBorder, textAlign: 'right' }}>
                                {fmtMoney(so?.totalCgst || so?.totalGst / 2)}
                            </td>
                        </tr>
                        <tr>
                            {emptyLead}
                            <td style={{ ...tdBorder, fontWeight: 'bold' }}>SGST @ {gstRate / 2}%</td>
                            <td style={{ ...tdBorder, textAlign: 'right' }}>
                                {fmtMoney(so?.totalSgst || so?.totalGst / 2)}
                            </td>
                        </tr>
                    </>
                ))}
            <tr>
                {emptyLead}
                <td style={{ ...tdBorder, fontWeight: 'bold' }}>Round Off</td>
                <td style={{ ...tdBorder, textAlign: 'right' }}>{Number(so?.roundOff || 0).toFixed(2)}</td>
            </tr>
            <tr style={{ background: '#f5f5f5' }}>
                {emptyLead}
                <td style={{ ...tdBorder, fontWeight: 'bold', fontSize: 14 }}>Rounded Total:</td>
                <td style={{ ...tdBorder, textAlign: 'right', fontWeight: 'bold', fontSize: 14 }}>
                    {fmtMoney(so?.roundedTotal || so?.grandTotal)}
                </td>
            </tr>
            <tr>
                {emptyLead}
                <td style={{ ...tdBorder, fontWeight: 'bold' }}>In Words:</td>
                <td
                    style={{
                        ...tdBorder,
                        fontSize: 9,
                        fontStyle: 'italic',
                        textTransform: 'capitalize',
                    }}
                >
                    {so?.amountInWords}
                </td>
            </tr>
        </tbody>
    );
}

/** Standalone totals for absolute block layout (designer / custom format). */
export function SoBlockTotalsBox({ so, showAmountInWords = true }) {
    const { gstApplicable, isIGST, gstRate } = resolveGstFlags(so);
    const lines = [
        ['Total Item Amount', so?.totalAmount],
        Number(so?.freightAmount || 0) > 0 ? ['Freight', so.freightAmount] : null,
        gstApplicable ? ['Taxable Amount', (so?.totalAmount || 0) + (so?.freightAmount || 0)] : null,
        gstApplicable && isIGST ? [`IGST @ ${gstRate}%`, so?.totalIgst || so?.totalGst] : null,
        gstApplicable && !isIGST ? [`CGST @ ${gstRate / 2}%`, so?.totalCgst || so?.totalGst / 2] : null,
        gstApplicable && !isIGST ? [`SGST @ ${gstRate / 2}%`, so?.totalSgst || so?.totalGst / 2] : null,
        ['Round Off', so?.roundOff],
    ].filter(Boolean);

    return (
        <div style={{ fontSize: '10pt', width: '100%' }}>
            {lines.map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {label === 'Round Off' ? Number(val || 0).toFixed(2) : fmtMoney(val)}
                    </span>
                </div>
            ))}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontWeight: 900,
                    marginTop: 4,
                    borderTop: '1px solid #000',
                    paddingTop: 4,
                    fontSize: 14,
                }}
            >
                <span style={{ whiteSpace: 'nowrap' }}>Grand Total</span>
                <span style={{ whiteSpace: 'nowrap' }}>{fmtMoney(so?.roundedTotal || so?.grandTotal)}</span>
            </div>
            {showAmountInWords && so?.amountInWords && (
                <div style={{ marginTop: 6, fontSize: '9px', fontStyle: 'italic', textTransform: 'capitalize' }}>
                    {so.amountInWords}
                </div>
            )}
        </div>
    );
}

export function SoBlockRemarks({ so }) {
    if (!so?.remarks) return null;
    return (
        <div style={{ border: '1px solid #000', padding: '8px 10px' }}>
            <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', marginBottom: 4 }}>
                Remarks:
            </div>
            <div style={{ fontSize: '9pt', color: '#333', whiteSpace: 'pre-wrap' }}>{so.remarks}</div>
        </div>
    );
}

export function SoBlockBankDetails({ company } = {}) {
    const bankName = company?.bankName || 'BANK OF BARODA';
    const accountName = company?.accountName || company?.companyName || '';
    const accountNo = company?.accountNo || company?.bankAccountNo || '20260200001544';
    const ifsc = company?.ifscCode || 'BARB0SHIBOR';
    const branch = company?.branchName || 'SHIMPOLI';
    const label = { width: 88, paddingBottom: 3, color: '#6b7280', verticalAlign: 'top' };
    const value = { paddingBottom: 3, verticalAlign: 'top' };
    return (
        <div style={{ fontSize: 9 }}>
            <b style={{ textTransform: 'uppercase' }}>BANK DETAILS</b>
            <table style={{ borderCollapse: 'collapse', marginTop: 4 }}>
                <tbody>
                    <tr>
                        <td style={label}>Bank Name</td>
                        <td style={value}>: <b>{bankName}</b></td>
                    </tr>
                    {accountName ? (
                        <tr>
                            <td style={label}>A/C Name</td>
                            <td style={value}>: <b>{accountName}</b></td>
                        </tr>
                    ) : null}
                    <tr>
                        <td style={label}>A/C Number</td>
                        <td style={value}>: <b>{accountNo}</b></td>
                    </tr>
                    <tr>
                        <td style={label}>IFSC Code</td>
                        <td style={value}>: <b>{ifsc}</b></td>
                    </tr>
                    <tr>
                        <td style={label}>Branch</td>
                        <td style={value}>: <b>{branch}</b></td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export function SoBlockApprovalLines() {
    const labels = ['PREPARED BY', 'CHECKED BY', 'AUTHORIZED BY', 'RECEIVED BY'];
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                marginTop: 22,
                width: '100%',
            }}
        >
            {labels.map((label) => (
                <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                    <div
                        style={{
                            borderTop: '1px solid #000',
                            paddingTop: 4,
                            fontSize: 8,
                            fontWeight: 800,
                            letterSpacing: 0.3,
                        }}
                    >
                        {label}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function SoBlockSignature({ so, company, user }) {
    return (
        <div
            style={{
                border: '1px solid #000',
                width: '100%',
                minHeight: 100,
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    background: '#f5f5f5',
                    padding: 5,
                    fontSize: 9,
                    fontWeight: 800,
                    textAlign: 'center',
                    borderBottom: '1px solid #000',
                }}
            >
                For {company?.companyName || 'JSK URJA'}
            </div>
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    paddingBottom: 8,
                }}
            >
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>
                    {so?.createdBy?.fullName || so?.createdBy?.name || user?.name || 'Authorized User'}
                </div>
                {(so?.createdBy?.mobile || user?.mobile) && (
                    <div style={{ fontSize: 9, color: '#333' }}>Mob: {so?.createdBy?.mobile || user?.mobile}</div>
                )}
                <div
                    style={{
                        width: 160,
                        maxWidth: '90%',
                        borderTop: '1px solid #000',
                        marginTop: 4,
                        paddingTop: 2,
                        fontSize: 9,
                        fontWeight: 800,
                        textAlign: 'center',
                    }}
                >
                    AUTHORIZED SIGNATORY
                </div>
            </div>
        </div>
    );
}

export function SoBlockTerms({ so }) {
    return (
        <div style={{ fontSize: '8pt', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 900, marginBottom: 4, textTransform: 'uppercase' }}>Terms &amp; Conditions</div>
            {so?.terms || (
                <>
                    1. Goods once sold will not be taken back.
                    <br />
                    2. Subject to MUMBAI Jurisdiction.
                    <br />
                    3. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                </>
            )}
        </div>
    );
}

/** Render one block by id — used by designer shell and block-layout print. */
export function SalesOrderPrintBlockContent({
    blockId,
    so,
    company,
    user,
    columns,
    pageItems,
    pageIdx,
    isLastPage,
    onColumnHeaderClick,
    selectedColumnId,
    embedTotalsInTable = false,
    srStart = null,
}) {
    const { gstApplicable } = resolveGstFlags(so);
    switch (blockId) {
        case 'logo':
            return <SoBlockLogo company={company} />;
        case 'companyDetails':
            return <SoBlockCompanyDetails company={company} gstApplicable={gstApplicable} />;
        case 'documentTitle':
            return <SoBlockDocumentTitle so={so} />;
        case 'documentNumber':
            return <SoBlockDocumentNumber so={so} gstApplicable={gstApplicable} />;
        case 'customerDetails':
            return <SoBlockCustomerDetails so={so} gstApplicable={gstApplicable} />;
        case 'documentDetails':
            return <SoBlockDocumentDetails so={so} />;
        case 'itemTable':
            return (
                <SoBlockItemTable
                    so={so}
                    pageItems={pageItems ?? so?.items ?? []}
                    pageIdx={pageIdx ?? 0}
                    isLastPage={isLastPage !== false}
                    showTotals={embedTotalsInTable}
                    columns={columns}
                    onColumnHeaderClick={onColumnHeaderClick}
                    selectedColumnId={selectedColumnId}
                    srStart={srStart}
                />
            );
        case 'totalsBox':
            return <SoBlockTotalsBox so={so} />;
        case 'remarks':
            return <SoBlockRemarks so={so} />;
        case 'terms':
            return <SoBlockTerms so={so} />;
        case 'bankDetails':
            return <SoBlockBankDetails company={company} />;
        case 'signature':
            return <SoBlockSignature so={so} company={company} user={user} />;
        default:
            return null;
    }
}
