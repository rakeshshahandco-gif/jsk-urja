import React from 'react';
import InvoiceBarcodeBlock from '@/components/invoice/InvoiceBarcodeBlock';
import { GOLDEN_INVOICE_FORMAT_VERSION, GOLDEN_INVOICE_USABLE_WIDTH_MM } from '@/constants/goldenInvoiceFormat.constants';

/**
 * LOCKED GOLDEN SALES INVOICE FORMAT — Based on approved JSK reference image
 * a_clean_white_tax_invoice_document_page_overall.png. Do not change layout unless
 * explicitly requested by JSK admin/user.
 *
 * A4 portrait 210mm × 297mm, @page margin 8mm, usable width 194mm.
 * Item table full width; totals box uses full right panel.
 * Do not apply Print Format Designer draft layouts to live Sales Invoice print.
 */
export default function SalesInvoiceBuiltinPrint({
    inv,
    company,
    invoiceId,
    printBarcodePayload,
    isEstimate,
    gstApplicable,
    isIGST,
    docTitle,
    docNumberLabel,
}) {
    const items = inv?.items || [];
    const itemsPerPageFirst = 8;
    const itemsPerPageOthers = 20;

    const pages = [];
    if (items.length <= itemsPerPageFirst) {
        pages.push(items);
    } else {
        pages.push(items.slice(0, itemsPerPageFirst));
        let remaining = items.slice(itemsPerPageFirst);
        while (remaining.length > 0) {
            pages.push(remaining.slice(0, itemsPerPageOthers));
            remaining = remaining.slice(itemsPerPageOthers);
        }
    }

    const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB');
    const fmtAmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    const renderEstimate = () => (
        <div className="si-builtin-page">
            <div className="si-builtin-sheet si-builtin-estimate">
                <div className="si-builtin-estimate-head">
                    <div className="si-builtin-estimate-title">ESTIMATE</div>
                    <div className="si-builtin-estimate-meta">ESTIMATE NO: {inv.invoiceNumber}</div>
                    <div className="si-builtin-estimate-meta">Date: {fmtDate(inv.invoiceDate)}</div>
                </div>
                <div className="si-builtin-estimate-party">
                    <div className="si-builtin-label">Estimate For</div>
                    <div className="si-builtin-party-name">{inv.customerName}</div>
                </div>
                <table className="si-builtin-items-table" width="100%">
                    <thead>
                        <tr>
                            <th style={{ width: '58%', textAlign: 'left' }}>Item &amp; Description</th>
                            <th style={{ width: '14%', textAlign: 'center' }}>Qty</th>
                            <th style={{ width: '14%', textAlign: 'right' }}>Rate</th>
                            <th style={{ width: '14%', textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it, i) => (
                            <tr key={i}>
                                <td>
                                    <div className="si-builtin-item-name">{it.description || it.itemName}</div>
                                    {it.additionalNotes && <div className="si-builtin-item-note">Note: {it.additionalNotes}</div>}
                                </td>
                                <td className="si-builtin-td-center">{it.qty} {it.uom || 'NOS'}</td>
                                <td className="si-builtin-td-right">{fmtAmt(it.rate)}</td>
                                <td className="si-builtin-td-right si-builtin-td-bold">{fmtAmt(it.taxableAmount || (it.qty * it.rate))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="si-builtin-estimate-total">
                    <div className="si-builtin-estimate-total-row">
                        <span>Total Estimated Price</span>
                        <span>₹ {fmtAmt(inv.totalTaxableAmount)}</span>
                    </div>
                    <div className="si-builtin-estimate-total-row si-builtin-estimate-total-grand">
                        <span>Total Estimated Price</span>
                        <span>₹ {fmtAmt(inv.roundedTotal || inv.grandTotal)}</span>
                    </div>
                </div>
            </div>
            {inv.status === 'Cancelled' && <div className="si-builtin-cancelled">CANCELLED</div>}
        </div>
    );

    const renderTaxInvoicePages = () =>
        pages.map((pageItems, pageIdx) => {
            const isFirstPage = pageIdx === 0;
            const isLastPage = pageIdx === pages.length - 1;
            const totalPages = pages.length;

            return (
                <div key={pageIdx} className="si-builtin-page">
                    <div className="si-builtin-sheet">
                        {isFirstPage ? (
                            <div className="si-builtin-header si-builtin-header-main">
                                <div className="si-builtin-header-logo-col">
                                    <img src="/logo.jpeg" alt="Logo" className="si-builtin-logo" style={{ maxHeight: `${company.logoHeight || 75}px` }} />
                                </div>
                                <div className="si-builtin-header-center-col">
                                    <div className="si-builtin-company-name">{company.companyName}</div>
                                    <div className="si-builtin-company-meta">
                                        <div>{company.address}</div>
                                        <div>{company.city} - {company.pincode}, {company.state} (Code: {company.stateCode})</div>
                                        <div>{company.phone && `Contact: ${company.phone}`}{company.email && ` | Email: ${company.email}`}</div>
                                        <div>
                                            {(gstApplicable || isEstimate) && company.gstNumber && <span>GSTIN: {company.gstNumber} | </span>}
                                            {company.panNumber && <span>PAN: {company.panNumber}</span>}
                                        </div>
                                        {company.cin && <span>CIN: {company.cin} | </span>}
                                        {company.urn && <span>MSME/URN: {company.urn}</span>}
                                    </div>
                                </div>
                                <div className="si-builtin-header-right">
                                    <div className="si-builtin-doc-badge">{docTitle}</div>
                                    <div className="si-builtin-doc-no">{docNumberLabel}: {inv.invoiceNumber}</div>
                                    <div className="si-builtin-doc-date">Date: {fmtDate(inv.invoiceDate)}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="si-builtin-header si-builtin-header-compact">
                                <div className="si-builtin-company-name">{company.companyName}</div>
                                <div className="si-builtin-doc-meta-inline">
                                    <strong>{docNumberLabel}:</strong> {inv.invoiceNumber} | <strong>Date:</strong> {fmtDate(inv.invoiceDate)}
                                </div>
                            </div>
                        )}

                        {isFirstPage && (
                            <>
                                <div className="si-builtin-split2 si-builtin-details">
                                    <div className="si-builtin-split2-left">
                                        <table className="si-builtin-meta-table">
                                            <tbody>
                                                <tr><td>Sales Order No:</td><td>{inv.soNumber || '—'}</td></tr>
                                                <tr><td>Buyer Order No:</td><td>{inv.buyerOrderNo || '—'}</td></tr>
                                                <tr><td>Dispatch Through:</td><td>{inv.dispatchThrough || '—'}</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="si-builtin-split2-right">
                                        <table className="si-builtin-meta-table">
                                            <tbody>
                                                <tr><td>Place of Supply:</td><td>{inv.placeOfSupply || inv.billingState || '—'}</td></tr>
                                                <tr><td>Payment Term:</td><td>{inv.paymentTerms || '—'}</td></tr>
                                                <tr><td>Buyer Order Date:</td><td>{inv.buyerOrderDate ? fmtDate(inv.buyerOrderDate) : '—'}</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="si-builtin-split2 si-builtin-parties">
                                    <div className="si-builtin-split2-left">
                                        <div className="si-builtin-label">Bill To (Buyer):</div>
                                        <div className="si-builtin-party-name">{inv.customerName}</div>
                                        <div className="si-builtin-party-addr">{inv.billingAddress}</div>
                                        <div className="si-builtin-party-gst">
                                            {inv.customerGstin && <div><strong>GSTIN:</strong> {inv.customerGstin}</div>}
                                            <div><strong>State:</strong> {inv.billingState} ({inv.billingStateCode})</div>
                                        </div>
                                    </div>
                                    <div className="si-builtin-split2-right">
                                        <div className="si-builtin-label">Ship To (Consignee):</div>
                                        <div className="si-builtin-party-name">{inv.customerName}</div>
                                        <div className="si-builtin-party-addr">{inv.shippingAddress || inv.billingAddress}</div>
                                        <div className="si-builtin-party-gst">
                                            {(inv.shippingGstin || inv.customerGstin) && <div><strong>GSTIN:</strong> {inv.shippingGstin || inv.customerGstin}</div>}
                                            <div><strong>State:</strong> {inv.shippingState || inv.billingState} ({inv.shippingStateCode || inv.billingStateCode})</div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Item table: direct full-width child — widths via colgroup only */}
                        <table
                            className="si-builtin-items-table"
                            width="100%"
                            cellSpacing="0"
                            cellPadding="0"
                            style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}
                        >
                            <colgroup>
                                <col className="si-builtin-col-sr" style={{ width: '5%' }} />
                                <col className="si-builtin-col-desc" style={{ width: '55%' }} />
                                <col className="si-builtin-col-hsn" style={{ width: '9%' }} />
                                <col className="si-builtin-col-uom" style={{ width: '6%' }} />
                                <col className="si-builtin-col-qty" style={{ width: '6%' }} />
                                <col className="si-builtin-col-rate" style={{ width: '10%' }} />
                                <col className="si-builtin-col-amt" style={{ width: '9%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="si-builtin-col-sr" width="5%">SR</th>
                                    <th className="si-builtin-col-desc" width="55%">ITEM DESCRIPTION</th>
                                    <th className="si-builtin-col-hsn" width="9%">HSN/SAC</th>
                                    <th className="si-builtin-col-uom" width="6%">UOM</th>
                                    <th className="si-builtin-col-qty" width="6%">QTY</th>
                                    <th className="si-builtin-col-rate" width="10%">RATE</th>
                                    <th className="si-builtin-col-amt" width="9%">AMOUNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map((it, i) => {
                                    const srNo = (pageIdx === 0 ? 0 : itemsPerPageFirst + (pageIdx - 1) * itemsPerPageOthers) + i + 1;
                                    return (
                                        <tr key={i}>
                                            <td className="si-builtin-col-sr">{srNo}</td>
                                            <td className="si-builtin-col-desc">
                                                <div className="si-builtin-item-name">{it.description || it.itemName}</div>
                                                {(it.additionalNotes || it.itemCode) && (
                                                    <div className="si-builtin-item-note">
                                                        {it.itemCode && <span>Code: {it.itemCode} </span>}
                                                        {it.additionalNotes && <span>| {it.additionalNotes}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="si-builtin-col-hsn">{it.hsnCode || '—'}</td>
                                            <td className="si-builtin-col-uom">{it.uom || 'NOS'}</td>
                                            <td className="si-builtin-col-qty">{it.qty}</td>
                                            <td className="si-builtin-col-rate">{fmtAmt(it.rate)}</td>
                                            <td className="si-builtin-col-amt">{fmtAmt(it.taxableAmount || (it.qty * it.rate))}</td>
                                        </tr>
                                    );
                                })}
                                {!isLastPage && (
                                    <tr>
                                        <td colSpan={7} className="si-builtin-continued">Continued on next page...</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {isLastPage && (
                            <>
                                <div className="si-builtin-bottom">
                                    <div className="si-builtin-bottom-left">
                                        <div className="si-builtin-block">
                                            <div className="si-builtin-block-title">Remarks:</div>
                                            <div className={inv.remarks ? '' : 'si-builtin-muted'}>{inv.remarks || '—'}</div>
                                        </div>
                                        <div className="si-builtin-block">
                                            <div className="si-builtin-block-title">Bank Details:</div>
                                            <div className="si-builtin-bank">
                                                <strong>{company.bankName || 'BANK OF BARODA'}</strong><br />
                                                Account Name: {company.companyName}<br />
                                                Account No: {company.accountNo || '—'}<br />
                                                IFSC Code: {company.ifscCode || '—'} | Branch: {company.branchName || '—'}
                                            </div>
                                        </div>
                                        <div className="si-builtin-block">
                                            <div className="si-builtin-block-title">Terms &amp; Declaration:</div>
                                            <div className="si-builtin-terms">
                                                1. Goods once sold will not be taken back.<br />
                                                2. Subject to MUMBAI Jurisdiction.<br />
                                                3. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="si-builtin-bottom-right">
                                        <table className="si-builtin-totals-table" width="100%">
                                            <colgroup>
                                                <col style={{ width: '58%' }} />
                                                <col style={{ width: '42%' }} />
                                            </colgroup>
                                            <tbody>
                                                {!isEstimate && (
                                                    <>
                                                        <tr>
                                                            <td className="si-builtin-totals-label">Total Item Value</td>
                                                            <td className="si-builtin-totals-amt">₹ {fmtAmt(inv.totalTaxableAmount - (inv.freightAmount || 0))}</td>
                                                        </tr>
                                                        {Number(inv.freightAmount || 0) > 0 && (
                                                            <tr>
                                                                <td className="si-builtin-totals-label">+ Freight / Shipping</td>
                                                                <td className="si-builtin-totals-amt">₹ {Number(inv.freightAmount).toFixed(2)}</td>
                                                            </tr>
                                                        )}
                                                    </>
                                                )}
                                                <tr className="si-builtin-taxable-row">
                                                    <td className="si-builtin-totals-label si-builtin-td-bold">{isEstimate ? 'Total Estimated Price' : 'Total Taxable Value'}</td>
                                                    <td className="si-builtin-totals-amt si-builtin-td-bold">₹ {fmtAmt(inv.totalTaxableAmount)}</td>
                                                </tr>
                                                {!isEstimate && gstApplicable && (
                                                    isIGST ? (
                                                        <tr>
                                                            <td className="si-builtin-totals-label">+ IGST @ {inv.items?.[0]?.taxRate || 18}%</td>
                                                            <td className="si-builtin-totals-amt">₹ {fmtAmt(inv.totalIgst || inv.totalTaxAmount)}</td>
                                                        </tr>
                                                    ) : (
                                                        <>
                                                            <tr>
                                                                <td className="si-builtin-totals-label">+ CGST @ {(inv.items?.[0]?.taxRate || 18) / 2}%</td>
                                                                <td className="si-builtin-totals-amt">₹ {fmtAmt(inv.totalCgst || (inv.totalTaxAmount / 2))}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="si-builtin-totals-label">+ SGST @ {(inv.items?.[0]?.taxRate || 18) / 2}%</td>
                                                                <td className="si-builtin-totals-amt">₹ {fmtAmt(inv.totalSgst || (inv.totalTaxAmount / 2))}</td>
                                                            </tr>
                                                        </>
                                                    )
                                                )}
                                                {inv.roundOff !== 0 && (
                                                    <tr>
                                                        <td className="si-builtin-totals-label">Round Off</td>
                                                        <td className="si-builtin-totals-amt">{Number(inv.roundOff).toFixed(2)}</td>
                                                    </tr>
                                                )}
                                                <tr className="si-builtin-grand-row">
                                                    <td className="si-builtin-totals-label">Grand Total</td>
                                                    <td className="si-builtin-totals-amt">₹ {fmtAmt(inv.roundedTotal)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="si-builtin-words">
                                    <span className="si-builtin-words-label">Amount in Words:</span>
                                    <span className="si-builtin-words-value">{inv.amountInWords}</span>
                                </div>

                                <div className="si-builtin-footer">
                                    <div className="si-builtin-footer-left">
                                        <div className="si-builtin-sign-title">Receiver&apos;s Signature:</div>
                                        <div className="si-builtin-sign-note">Verified and Received in Good Condition</div>
                                    </div>
                                    <div className="si-builtin-footer-right">
                                        <div className="si-builtin-footer-sign-block">
                                            <div className="si-builtin-for-company">For {company.companyName}</div>
                                            <div className="si-builtin-sign-line" />
                                            <div className="si-builtin-signatory">Authorized Signatory</div>
                                        </div>
                                        {!isEstimate && (
                                            <div className="si-builtin-qr-wrap">
                                                <InvoiceBarcodeBlock invoiceId={invoiceId} variant="print" payload={printBarcodePayload} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="si-builtin-pagenum">Page {pageIdx + 1} of {totalPages}</div>

                    {inv.status === 'Cancelled' && <div className="si-builtin-cancelled">CANCELLED</div>}
                </div>
            );
        });

    return (
        <div
            className="print-only si-builtin-print invoice-print-page"
            data-golden-format={GOLDEN_INVOICE_FORMAT_VERSION}
            style={{
                display: 'none',
                width: `${GOLDEN_INVOICE_USABLE_WIDTH_MM}mm`,
                minWidth: `${GOLDEN_INVOICE_USABLE_WIDTH_MM}mm`,
                maxWidth: `${GOLDEN_INVOICE_USABLE_WIDTH_MM}mm`,
                margin: '0 auto',
                padding: 0,
                boxSizing: 'border-box',
                color: '#000',
                fontSize: '10pt',
            }}
        >
            {isEstimate ? renderEstimate() : renderTaxInvoicePages()}

            <style>{`
                .si-builtin-print { display: none; }
                @media print {
                    @page { size: A4 portrait; margin: 8mm; }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 210mm !important;
                        background: #fff !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .sales-invoice-page-root,
                    .sales-invoice-page-root > * {
                        max-width: none !important;
                        min-width: 0 !important;
                    }
                    .no-print, .no-print * { display: none !important; }
                    .si-builtin-print.invoice-print-page {
                        display: block !important;
                        position: static !important;
                        width: 194mm !important;
                        min-width: 194mm !important;
                        max-width: 194mm !important;
                        margin: 0 auto !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                        transform: none !important;
                        zoom: 1 !important;
                    }
                    .si-builtin-print .si-builtin-page {
                        width: 194mm !important;
                        margin: 0 auto !important;
                        padding: 0 !important;
                        display: block !important;
                        height: auto !important;
                        min-height: 0 !important;
                        page-break-after: always;
                        break-after: page;
                        position: relative;
                    }
                    .si-builtin-print .si-builtin-page:last-child {
                        page-break-after: auto;
                        break-after: auto;
                    }
                    .si-builtin-print .si-builtin-sheet {
                        width: 100% !important;
                        border: 1px solid #000;
                        box-sizing: border-box;
                        display: block !important;
                        height: auto !important;
                        min-height: 0 !important;
                    }
                    .si-builtin-print .si-builtin-header,
                    .si-builtin-print .si-builtin-split2,
                    .si-builtin-print .si-builtin-items-table,
                    .si-builtin-print .si-builtin-bottom,
                    .si-builtin-print .si-builtin-words,
                    .si-builtin-print .si-builtin-footer {
                        width: 100% !important;
                        max-width: 100% !important;
                        box-sizing: border-box;
                    }
                    .si-builtin-print .si-builtin-header {
                        width: 100% !important;
                        box-sizing: border-box;
                    }
                    .si-builtin-print .si-builtin-header-main {
                        display: grid !important;
                        grid-template-columns: 22% 1fr 28%;
                        align-items: start;
                        gap: 6px;
                        padding: 8px 10px;
                        border-bottom: 1px solid #000;
                    }
                    .si-builtin-print .si-builtin-header-compact {
                        display: flex !important;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 10px;
                        border-bottom: 1px solid #000;
                    }
                    .si-builtin-print .si-builtin-header-logo-col {
                        display: flex;
                        align-items: flex-start;
                        justify-content: flex-start;
                    }
                    .si-builtin-print .si-builtin-header-center-col {
                        text-align: center;
                        padding: 0 4px;
                        min-width: 0;
                    }
                    .si-builtin-print .si-builtin-logo {
                        max-width: 140px;
                        object-fit: contain;
                        flex-shrink: 0;
                    }
                    .si-builtin-print .si-builtin-company-name {
                        font-size: 18pt;
                        font-weight: 900;
                        text-transform: uppercase;
                        color: #000;
                    }
                    .si-builtin-print .si-builtin-company-meta {
                        font-size: 8.5pt;
                        line-height: 1.2;
                    }
                    .si-builtin-print .si-builtin-header-right {
                        text-align: right;
                        flex-shrink: 0;
                        min-width: 140px;
                    }
                    .si-builtin-print .si-builtin-doc-badge {
                        font-size: 13pt;
                        font-weight: 900;
                        border: 2px solid #000;
                        padding: 4px 12px;
                        display: inline-block;
                        margin-bottom: 8px;
                        text-transform: uppercase;
                    }
                    .si-builtin-print .si-builtin-doc-no,
                    .si-builtin-print .si-builtin-doc-date {
                        font-size: 10pt;
                        font-weight: 700;
                    }
                    .si-builtin-print .si-builtin-split2 {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        border-top: 1px solid #000;
                    }
                    .si-builtin-print .si-builtin-split2-left {
                        border-right: 1px solid #000;
                        padding: 6px 8px;
                    }
                    .si-builtin-print .si-builtin-split2-right {
                        padding: 6px 8px;
                    }
                    .si-builtin-print .si-builtin-parties .si-builtin-split2-left,
                    .si-builtin-print .si-builtin-parties .si-builtin-split2-right {
                        padding: 8px;
                    }
                    .si-builtin-print .si-builtin-meta-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 8pt;
                    }
                    .si-builtin-print .si-builtin-meta-table td:first-child {
                        color: #555;
                        width: 110px;
                    }
                    .si-builtin-print .si-builtin-meta-table td:last-child {
                        font-weight: 700;
                    }
                    .si-builtin-print .si-builtin-label {
                        font-size: 8pt;
                        font-weight: 900;
                        text-transform: uppercase;
                        color: #555;
                        margin-bottom: 4px;
                    }
                    .si-builtin-print .si-builtin-party-name {
                        font-size: 10pt;
                        font-weight: 900;
                    }
                    .si-builtin-print .si-builtin-party-addr {
                        font-size: 9pt;
                        white-space: pre-wrap;
                        margin: 4px 0;
                    }
                    .si-builtin-print .si-builtin-party-gst {
                        font-size: 8pt;
                    }
                    /* Item table: full width edge-to-edge inside sheet; 7 columns only */
                    .si-builtin-print .si-builtin-sheet > .si-builtin-items-table {
                        width: 100% !important;
                        min-width: 100% !important;
                        max-width: 100% !important;
                    }
                    .si-builtin-print .si-builtin-items-table {
                        width: 100% !important;
                        min-width: 100% !important;
                        max-width: 100% !important;
                        border-collapse: collapse !important;
                        border-spacing: 0 !important;
                        table-layout: fixed !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border-top: 1px solid #000;
                    }
                    .si-builtin-print .si-builtin-items-table col.si-builtin-col-sr { width: 5% !important; }
                    .si-builtin-print .si-builtin-items-table col.si-builtin-col-desc { width: 55% !important; }
                    .si-builtin-print .si-builtin-items-table col.si-builtin-col-hsn { width: 9% !important; }
                    .si-builtin-print .si-builtin-items-table col.si-builtin-col-uom { width: 6% !important; }
                    .si-builtin-print .si-builtin-items-table col.si-builtin-col-qty { width: 6% !important; }
                    .si-builtin-print .si-builtin-items-table col.si-builtin-col-rate { width: 10% !important; }
                    .si-builtin-print .si-builtin-items-table col.si-builtin-col-amt { width: 9% !important; }
                    .si-builtin-print .si-builtin-items-table th,
                    .si-builtin-print .si-builtin-items-table td {
                        border: 1px solid #000;
                        padding: 1.5mm 1mm;
                        font-size: 9pt;
                        vertical-align: top;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    .si-builtin-print .si-builtin-items-table th {
                        font-size: 8pt;
                        background: #f5f5f5;
                        font-weight: 800;
                        text-transform: uppercase;
                        text-align: center;
                        vertical-align: middle;
                    }
                    .si-builtin-print .si-builtin-items-table th.si-builtin-col-desc {
                        text-align: left !important;
                    }
                    .si-builtin-print .si-builtin-items-table th.si-builtin-col-rate,
                    .si-builtin-print .si-builtin-items-table th.si-builtin-col-amt {
                        text-align: right !important;
                        padding-right: 2mm !important;
                    }
                    .si-builtin-print .si-builtin-items-table .si-builtin-col-sr { text-align: center !important; vertical-align: middle !important; }
                    .si-builtin-print .si-builtin-items-table .si-builtin-col-desc {
                        text-align: left !important;
                        word-break: break-word;
                        overflow-wrap: anywhere;
                    }
                    .si-builtin-print .si-builtin-items-table .si-builtin-col-hsn { text-align: center !important; vertical-align: middle !important; }
                    .si-builtin-print .si-builtin-items-table .si-builtin-col-uom { text-align: center !important; vertical-align: middle !important; }
                    .si-builtin-print .si-builtin-items-table .si-builtin-col-qty { text-align: center !important; font-weight: 700; vertical-align: middle !important; }
                    .si-builtin-print .si-builtin-items-table .si-builtin-col-rate {
                        text-align: right !important;
                        white-space: nowrap !important;
                        vertical-align: middle !important;
                        padding-right: 2mm !important;
                    }
                    .si-builtin-print .si-builtin-items-table .si-builtin-col-amt {
                        text-align: right !important;
                        font-weight: 700;
                        white-space: nowrap !important;
                        vertical-align: middle !important;
                        padding-right: 2mm !important;
                    }
                    .si-builtin-print .si-builtin-items-table th.si-builtin-col-amt,
                    .si-builtin-print .si-builtin-items-table td.si-builtin-col-amt {
                        border-right: 1px solid #000;
                    }
                    .si-builtin-print .si-builtin-item-name {
                        font-size: 9.5pt;
                        font-weight: 700;
                        text-transform: uppercase;
                    }
                    .si-builtin-print .si-builtin-item-note {
                        font-size: 8pt;
                        color: #444;
                        margin-top: 2px;
                    }
                    .si-builtin-print .si-builtin-continued {
                        text-align: right;
                        font-style: italic;
                        font-size: 9pt;
                        background: #fafafa;
                    }
                    /* Bottom summary: left remarks/bank, right totals — approved 52/48 split */
                    .si-builtin-print .si-builtin-bottom {
                        display: grid;
                        grid-template-columns: 52% 48%;
                        border-top: 1px solid #000;
                        margin: 0;
                        align-items: stretch;
                        page-break-inside: avoid;
                    }
                    .si-builtin-print .si-builtin-bottom-left {
                        border-right: 1px solid #000;
                        padding: 6px 8px;
                    }
                    .si-builtin-print .si-builtin-bottom-right {
                        padding: 0;
                        width: 100%;
                        min-width: 0;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                    }
                    .si-builtin-print .si-builtin-block { margin-bottom: 4px; }
                    .si-builtin-print .si-builtin-block-title {
                        font-size: 8pt;
                        font-weight: 900;
                        text-transform: uppercase;
                        color: #555;
                        border-bottom: 1px solid #eee;
                        padding-bottom: 2px;
                        margin-bottom: 4px;
                    }
                    .si-builtin-print .si-builtin-bank { font-size: 8.5pt; line-height: 1.3; }
                    .si-builtin-print .si-builtin-terms { font-size: 7.5pt; line-height: 1.2; }
                    .si-builtin-print .si-builtin-muted { font-style: italic; }
                    .si-builtin-print .si-builtin-totals-table {
                        width: 100% !important;
                        min-width: 100% !important;
                        max-width: 100% !important;
                        border-collapse: collapse !important;
                        table-layout: fixed !important;
                        font-size: 9.5pt;
                        margin: 0;
                        flex: 1;
                    }
                    .si-builtin-print .si-builtin-totals-table tr {
                        height: auto;
                    }
                    .si-builtin-print .si-builtin-totals-label {
                        width: 58% !important;
                        text-align: left !important;
                        vertical-align: middle !important;
                        padding: 2.2mm 2mm 2.2mm 3mm !important;
                        border-bottom: 1px solid #ddd;
                    }
                    .si-builtin-print .si-builtin-totals-amt {
                        width: 42% !important;
                        text-align: right !important;
                        vertical-align: middle !important;
                        white-space: nowrap !important;
                        padding: 2.2mm 4mm 2.2mm 2mm !important;
                        border-bottom: 1px solid #ddd;
                    }
                    .si-builtin-print .si-builtin-td-bold { font-weight: 700; }
                    .si-builtin-print .si-builtin-taxable-row .si-builtin-totals-label,
                    .si-builtin-print .si-builtin-taxable-row .si-builtin-totals-amt {
                        font-weight: 700;
                        font-size: 10pt;
                    }
                    .si-builtin-print .si-builtin-grand-row .si-builtin-totals-label,
                    .si-builtin-print .si-builtin-grand-row .si-builtin-totals-amt {
                        background: #f0f0f0;
                        font-weight: 900;
                        font-size: 12pt;
                        padding-top: 3mm !important;
                        padding-bottom: 3mm !important;
                        border-top: 1px solid #000;
                        border-bottom: none;
                    }
                    .si-builtin-print .si-builtin-words {
                        border-top: 1px solid #000;
                        padding: 5px 8px;
                        font-size: 9pt;
                        background: #fafafa;
                    }
                    .si-builtin-print .si-builtin-words-label {
                        font-weight: 800;
                        text-transform: uppercase;
                        margin-right: 5px;
                    }
                    .si-builtin-print .si-builtin-words-value {
                        font-weight: 600;
                        text-transform: capitalize;
                    }
                    .si-builtin-print .si-builtin-footer {
                        display: grid;
                        grid-template-columns: 52% 48%;
                        border-top: 1px solid #000;
                        min-height: 0;
                    }
                    .si-builtin-print .si-builtin-footer-left {
                        border-right: 1px solid #000;
                        padding: 8px;
                        font-size: 8pt;
                    }
                    .si-builtin-print .si-builtin-sign-title {
                        font-weight: 900;
                        text-decoration: underline;
                        margin-bottom: 4px;
                    }
                    .si-builtin-print .si-builtin-sign-note {
                        font-size: 7pt;
                        color: #444;
                        font-style: italic;
                        margin-top: 32px;
                    }
                    .si-builtin-print .si-builtin-footer-right {
                        position: relative;
                        padding: 8px 8px 10px;
                        min-height: 72px;
                    }
                    .si-builtin-print .si-builtin-footer-sign-block {
                        text-align: center;
                    }
                    .si-builtin-print .si-builtin-qr-wrap {
                        position: absolute;
                        right: 8px;
                        bottom: 6px;
                        display: flex;
                        justify-content: flex-end;
                        align-items: flex-end;
                    }
                    .si-builtin-print .invoice-barcode-block {
                        display: flex !important;
                        visibility: visible !important;
                        justify-content: flex-end !important;
                        border-top: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .si-builtin-print .si-builtin-for-company {
                        font-size: 9pt;
                        font-weight: 900;
                        padding: 4px 0;
                        border-bottom: 1px dashed #ccc;
                    }
                    .si-builtin-print .si-builtin-sign-line {
                        height: 36px;
                    }
                    .si-builtin-print .si-builtin-signatory {
                        font-size: 9pt;
                        font-weight: 900;
                        text-transform: uppercase;
                    }
                    .si-builtin-print .si-builtin-pagenum {
                        text-align: right;
                        font-size: 8pt;
                        color: #666;
                        margin-top: 3px;
                        padding-right: 2px;
                        clear: both;
                    }
                    .si-builtin-print .si-builtin-cancelled {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-45deg);
                        font-size: 100pt;
                        font-weight: 900;
                        color: rgba(239, 68, 68, 0.15);
                        border: 15px solid rgba(239, 68, 68, 0.15);
                        padding: 20px 50px;
                        border-radius: 20px;
                        pointer-events: none;
                        z-index: 100;
                        text-transform: uppercase;
                    }
                    .si-builtin-print .si-builtin-td-center { text-align: center; }
                    .si-builtin-print .si-builtin-td-right { text-align: right; }
                    .si-builtin-print .si-builtin-td-bold { font-weight: 700; }
                }
            `}</style>
        </div>
    );
}
