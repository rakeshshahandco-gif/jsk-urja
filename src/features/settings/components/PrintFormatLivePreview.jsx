import React, { useMemo } from 'react';
import { buildPrintFormatScreenCss } from '@/utils/printFormatRuntime';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '-');
const fmtCur = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

function SalesOrderPreview({ doc, company }) {
    const items = (doc.items || []).slice(0, 8);
    const gstApplicable = doc.gstApplicable !== false;

    return (
        <div className="print-page">
            <div data-pf-section="header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, borderBottom: '2px solid #000', paddingBottom: 12 }}>
                <div data-pf-section="companyDetails">
                    <div style={{ fontSize: '16pt', fontWeight: 900, textTransform: 'uppercase' }}>{company.companyName || 'Company'}</div>
                    <div style={{ fontSize: '9pt', maxWidth: 420 }}>{company.address}</div>
                    {gstApplicable && company.gstNumber && <div style={{ fontSize: '9pt' }}>GSTIN: {company.gstNumber}</div>}
                </div>
                <div data-pf-section="documentDetails" style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14pt', fontWeight: 900, color: '#64748b' }}>SALES ORDER</div>
                    <div style={{ fontSize: '12pt', fontWeight: 700 }}>{doc.soNumber}</div>
                    <div style={{ fontSize: '10pt' }}>Date: {fmt(doc.soDate)}</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                <div data-pf-section="customerDetails" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '10pt' }}>Customer: {doc.customerName}</div>
                    <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap' }}>{doc.billingAddress || doc.shippingAddress || '-'}</div>
                </div>
                <div style={{ width: 220, fontSize: '9pt' }}>
                    <div>Delivery: {fmt(doc.deliveryDate)}</div>
                    <div>PO: {doc.customerPO || 'VERBAL'}</div>
                </div>
            </div>

            <table data-pf-section="itemTable" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '9pt' }}>
                <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ border: '1px solid #000', padding: 6 }}>SR</th>
                        <th style={{ border: '1px solid #000', padding: 6, textAlign: 'left' }}>Description</th>
                        <th style={{ border: '1px solid #000', padding: 6 }}>Qty</th>
                        <th style={{ border: '1px solid #000', padding: 6, textAlign: 'right' }}>Rate</th>
                        <th style={{ border: '1px solid #000', padding: 6, textAlign: 'right' }}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={i}>
                            <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>{i + 1}</td>
                            <td style={{ border: '1px solid #000', padding: 6 }}>{it.description || it.itemName}</td>
                            <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>{it.qty} {it.uom || ''}</td>
                            <td style={{ border: '1px solid #000', padding: 6, textAlign: 'right' }}>{Number(it.rate || 0).toFixed(2)}</td>
                            <td style={{ border: '1px solid #000', padding: 6, textAlign: 'right' }}>{Number(it.amount || (it.qty * it.rate) || 0).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div data-pf-section="totalsBox" style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '10pt', minWidth: 260 }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: '4px 12px' }}>Grand Total</td>
                            <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 900 }}>{fmtCur(doc.roundedTotal || doc.grandTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div data-pf-section="remarks" style={{ marginTop: 12, border: '1px solid #000', padding: 8, fontSize: '9pt' }}>
                <strong>Remarks:</strong> {doc.remarks || '-'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: '8pt' }}>
                <div data-pf-section="bankDetails">
                    <strong>BANK:</strong> {company.bankName || 'BANK OF BARODA'} | A/c {company.accountNo || '-'}
                </div>
                <div data-pf-section="signature" style={{ border: '1px solid #000', width: 180, textAlign: 'center', padding: 8 }}>
                    For {company.companyName}
                    <div style={{ marginTop: 40, borderTop: '1px solid #000', fontSize: '8pt' }}>Authorized Signatory</div>
                </div>
            </div>
        </div>
    );
}

function SalesInvoicePreview({ doc, company }) {
    const items = (doc.items || []).slice(0, 8);

    return (
        <div className="print-page">
            <div data-pf-section="header" style={{ border: '1px solid #000', padding: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div data-pf-section="companyDetails">
                        <div style={{ fontSize: '16pt', fontWeight: 900 }}>{company.companyName}</div>
                        <div style={{ fontSize: '8.5pt' }}>{company.address}</div>
                    </div>
                    <div data-pf-section="documentDetails" style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900, border: '2px solid #000', padding: '2px 10px', display: 'inline-block' }}>TAX INVOICE</div>
                        <div style={{ fontSize: '10pt', fontWeight: 700 }}>{doc.displayInvoiceNumber || doc.invoiceNumber}</div>
                        <div style={{ fontSize: '9pt' }}>Date: {fmt(doc.invoiceDate)}</div>
                    </div>
                </div>
            </div>

            <div data-pf-section="customerDetails" style={{ border: '1px solid #000', padding: 8, marginBottom: 8, fontSize: '9pt' }}>
                <strong>Bill To:</strong> {doc.customerName}
                <div style={{ whiteSpace: 'pre-wrap' }}>{doc.billingAddress}</div>
            </div>

            <table data-pf-section="itemTable" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '9pt' }}>
                <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ border: '1px solid #000', padding: 6 }}>SR</th>
                        <th style={{ border: '1px solid #000', padding: 6, textAlign: 'left' }}>Item</th>
                        <th style={{ border: '1px solid #000', padding: 6 }}>Qty</th>
                        <th style={{ border: '1px solid #000', padding: 6, textAlign: 'right' }}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={i}>
                            <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>{i + 1}</td>
                            <td style={{ border: '1px solid #000', padding: 6 }}>{it.description || it.itemName}</td>
                            <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>{it.qty}</td>
                            <td style={{ border: '1px solid #000', padding: 6, textAlign: 'right' }}>{Number(it.taxableAmount || (it.qty * it.rate) || 0).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div data-pf-section="totalsBox" style={{ marginTop: 10, border: '1px solid #000', padding: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ fontWeight: 900 }}>Grand Total: {fmtCur(doc.roundedTotal || doc.grandTotal)}</div>
            </div>

            <div data-pf-section="remarks" style={{ marginTop: 8, fontSize: '9pt' }}><strong>Remarks:</strong> {doc.remarks || '-'}</div>
            <div data-pf-section="bankDetails" style={{ marginTop: 6, fontSize: '8pt' }}><strong>Bank:</strong> {company.bankName || '-'} | {company.ifscCode || '-'}</div>
            <div data-pf-section="terms" style={{ marginTop: 6, fontSize: '7.5pt', color: '#444' }}>Goods once sold will not be taken back.</div>
            <div data-pf-section="signature" style={{ marginTop: 12, border: '1px solid #000', textAlign: 'center', padding: 8, fontSize: '9pt' }}>Authorized Signatory</div>
        </div>
    );
}

export default function PrintFormatLivePreview({ docType, draftFormat, sampleDocument, company }) {
    const printFormat = useMemo(() => ({
        paperSize: draftFormat.paperSize,
        orientation: draftFormat.orientation,
        margins: draftFormat.margins,
        customPaper: draftFormat.customPaper,
        layout: draftFormat.layout,
    }), [draftFormat]);

    const liveCss = buildPrintFormatScreenCss(printFormat, 'pf-preview-sheet');

    return (
        <div style={{ background: '#e2e8f0', padding: 16, borderRadius: 8, overflow: 'auto', minHeight: 480 }}>
            <style>{liveCss}</style>
            <div className="pf-preview-sheet" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
                {docType === 'Sales Order' ? (
                    <SalesOrderPreview doc={sampleDocument} company={company} />
                ) : (
                    <SalesInvoicePreview doc={sampleDocument} company={company} />
                )}
            </div>
        </div>
    );
}
