import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getSalesInvoiceById, cancelSalesInvoice, recordSalesPayment } from '@/services/salesApi';
import { getCompanyProfile } from '@/services/settingsApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const PAY_COLORS = {
    Unpaid: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Partially Paid': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Paid: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Cancelled: { color: '#6b7280', bg: '#f9fafb', border: '#e2e8f0' },
};
const th = { padding: '9px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '9px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };
const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };

export default function SalesInvoiceDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [inv, setInv] = useState(null);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('invoice');
    const [showPayModal, setShowPayModal] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [payForm, setPayForm] = useState({ amountPaid: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMode: 'Cash', reference: '', remarks: '' });
    const [payingSaving, setPayingSaving] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getSalesInvoiceById(id),
            getCompanyProfile().catch(() => ({ data: {} }))
        ]).then(([invRes, companyRes]) => {
            setInv(invRes);
            setCompany(companyRes?.data || {});
        }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const handleCancel = async () => {
        if (!window.confirm('Cancel this invoice?')) return;
        setCancelling(true);
        try { await cancelSalesInvoice(id); toast.success('Invoice cancelled'); load(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setCancelling(false); }
    };

    const handleRecordPayment = async () => {
        if (!payForm.amountPaid || Number(payForm.amountPaid) <= 0) return toast.error('Enter a valid amount');
        setPayingSaving(true);
        try {
            await recordSalesPayment(id, { ...payForm, amountPaid: Number(payForm.amountPaid) });
            toast.success('Payment recorded!');
            setShowPayModal(false);
            load();
            setActiveTab('payments');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setPayingSaving(false); }
    };

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Loading...</div>;
    if (!inv) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh' }}>Invoice not found.</div>;

    const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS.Unpaid;
    const isIGST = inv.gstType === 'IGST';
    const notCancelled = inv.status !== 'Cancelled';
    const notFullyPaid = inv.paymentStatus !== 'Paid';

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Refined Professional Print Layout (Matches Image Style) */}
            <div className="print-only" style={{ display: 'none', background: '#fff', color: '#000', width: '210mm', padding: '8mm', boxSizing: 'border-box', fontSize: '10pt', lineHeight: '1.2' }}>
                <div style={{ minHeight: '270mm', display: 'flex', flexDirection: 'column', border: '1px solid #000', padding: '0px', boxSizing: 'border-box' }}>
                    <style>{`
                    .p-section { border: 1px solid #000; box-sizing: border-box; overflow: hidden; }
                    .p-flex { display: flex; }
                    .p-col { display: flex; flexDirection: column; }
                    .p-label { font-weight: bold; font-size: 9pt; color: #000; }
                    .p-value { font-size: 10pt; }
                    .p-table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
                    .p-table th, .p-table td { border: 1px solid #000; padding: 1.5mm 1mm; font-size: 9pt; min-height: 8mm; vertical-align: middle; }
                    .p-table th { background: #f3f3f3 !important; font-weight: bold; text-align: center; -webkit-print-color-adjust: exact; }
                `}</style>

                    {/* header: SALES INVOICE title */}
                    <div style={{ textAlign: 'center', marginBottom: '4mm', padding: '4mm 0' }}>
                        <h1 style={{ margin: 0, fontSize: '20pt', fontWeight: 900, textTransform: 'uppercase', background: '#f5f5f5', borderBottom: '2px solid #000', display: 'inline-block', padding: '2mm 15mm' }}>SALES INVOICE</h1>
                    </div>

                    <div className="p-section" style={{ border: 'none', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {/* 1. Header Section (Company Details) */}
                        <div className="p-flex" style={{ borderBottom: '1px solid #000', minHeight: '40mm' }}>
                            <div style={{ width: '40mm', padding: '2mm', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #000' }}>
                                {company.logoUrl ? (
                                    <img src={company.logoUrl} alt="Logo" style={{ maxHeight: '35mm', maxWidth: '35mm', objectFit: 'contain' }} />
                                ) : <div style={{ fontWeight: 900, fontSize: '20pt', color: '#ddd' }}>LOGO</div>}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2mm' }}>
                                <div style={{ fontSize: '18pt', fontWeight: 800, color: '#000', marginBottom: '1mm' }}>{company.companyName || 'JSK INNOVATIVE TECHNOLOGY PVT LTD'}</div>
                                <div style={{ fontSize: '9pt', maxWidth: '130mm' }}>{company.address}</div>
                                {company.city && <div style={{ fontSize: '9pt' }}>{company.city}, {company.state} - {company.pincode}</div>}
                                <div style={{ fontSize: '9pt' }}>Phone: {company.phone} | Email: {company.email}</div>
                                <div style={{ fontSize: '12pt', fontWeight: 800, marginTop: '2mm' }}>GSTIN: {company.gstNumber}</div>
                            </div>
                        </div>

                        {/* 2. Statutory Details Section */}
                        <div className="p-flex" style={{ borderBottom: '1px solid #000' }}>
                            <div style={{ flex: 1, borderRight: '1px solid #000', padding: '1mm 2mm' }}>
                                <span className="p-label">URN :</span> <span className="p-value" style={{ fontWeight: 800 }}>{company.urn || 'UDYAM-MH-18-0098031'}</span>
                            </div>
                            <div style={{ flex: 1, padding: '1mm 2mm' }}>
                                <span className="p-label">CIN:</span> <span className="p-value" style={{ fontWeight: 800 }}>{company.cin || 'U29220MH2012PTC263176'}</span>
                            </div>
                        </div>

                        {/* 3. Invoice Information Section */}
                        <div className="p-flex" style={{ borderBottom: '1px solid #000' }}>
                            <div style={{ flex: 1, borderRight: '1px solid #000' }}>
                                <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        <tr><td style={{ width: '35mm', padding: '1mm 2mm', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>Invoice No.:</td><td style={{ padding: '1mm 2mm', fontWeight: 800, borderBottom: '1px solid #000' }}>{inv.invoiceNumber}</td></tr>
                                        <tr><td style={{ padding: '1mm 2mm', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>Dated:</td><td style={{ padding: '1mm 2mm', fontWeight: 800, borderBottom: '1px solid #000' }}>{fmt(inv.invoiceDate)}</td></tr>
                                        <tr><td style={{ padding: '1mm 2mm', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>Order Type:</td><td style={{ padding: '1mm 2mm', fontWeight: 600, borderBottom: '1px solid #000' }}>{inv.orderType || '—'}</td></tr>
                                        <tr><td style={{ padding: '1mm 2mm', borderRight: '1px solid #000' }}>Despatched Through:</td><td style={{ padding: '1mm 2mm', fontWeight: 600 }}>{inv.dispatchThrough || '—'}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ flex: 1 }}>
                                <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        <tr><td style={{ width: '40mm', padding: '1mm 2mm', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>Payment Due Date:</td><td style={{ padding: '1mm 2mm', fontWeight: 600, borderBottom: '1px solid #000' }}>{fmt(inv.paymentDueDate)}</td></tr>
                                        <tr><td style={{ padding: '1mm 2mm', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>Buyer's Order No :</td><td style={{ padding: '1mm 2mm', fontWeight: 800, borderBottom: '1px solid #000' }}>{inv.buyerOrderNo || '—'}</td></tr>
                                        <tr><td style={{ padding: '1mm 2mm', borderRight: '1px solid #000' }}>Buyer's Order Date:</td><td style={{ padding: '1mm 2mm', fontWeight: 800 }}>{fmt(inv.buyerOrderDate)}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 4. Customer Details Section */}
                        <div className="p-flex" style={{ borderBottom: '1px solid #000' }}>
                            <div style={{ flex: 1, borderRight: '1px solid #000', padding: '2mm' }}>
                                <div className="p-label" style={{ marginBottom: '1mm' }}>Billed To : <span style={{ fontWeight: 800, fontSize: '10pt' }}>{inv.customerName}</span></div>
                                <div className="p-flex">
                                    <span className="p-label" style={{ width: '18mm' }}>Address:</span>
                                    <span style={{ fontSize: '9pt', flex: 1 }}>{inv.billingAddress}</span>
                                </div>
                                <div style={{ fontSize: '9pt', marginLeft: '18mm' }}>{inv.billingState} ({inv.billingStateCode})</div>
                                <div style={{ fontSize: '9pt', marginTop: '1mm' }}><span className="p-label">Phone:</span> {inv.customerPhone}</div>
                                <div style={{ fontSize: '9pt' }}><span className="p-label">GSTIN:</span> {inv.customerGstin}</div>
                            </div>
                            <div style={{ flex: 1, padding: '2mm' }}>
                                <div className="p-label" style={{ marginBottom: '1mm' }}>Shipped To : <span style={{ fontWeight: 800, fontSize: '10pt' }}>{inv.customerName}</span></div>
                                <div className="p-flex">
                                    <span className="p-label" style={{ width: '18mm' }}>Address:</span>
                                    <span style={{ fontSize: '9pt', flex: 1 }}>{inv.shippingAddress}</span>
                                </div>
                                <div style={{ fontSize: '9pt', marginLeft: '18mm' }}>{inv.shippingState || inv.billingState} ({inv.shippingStateCode || inv.billingStateCode})</div>
                                <div style={{ fontSize: '9pt', marginTop: '1mm' }}><span className="p-label">Phone:</span> {inv.shippingPhone || inv.customerPhone}</div>
                                <div style={{ fontSize: '9pt' }}><span className="p-label">GSTIN:</span> {inv.shippingGstin || inv.customerGstin}</div>
                            </div>
                        </div>

                        {/* 5. Item Table Section */}
                        <table className="p-table" style={{ border: 'none', borderBottom: '1px solid #000' }}>
                            <thead>
                                <tr style={{ background: '#f5f5f5' }}>
                                    <th style={{ width: '12mm', border: '1px solid #000', padding: '2mm' }}>Sr No</th>
                                    <th style={{ width: '55mm', border: '1px solid #000', padding: '2mm' }}>Description</th>
                                    <th style={{ width: '40mm', border: '1px solid #000', padding: '2mm' }}>Additional Notes</th>
                                    <th style={{ width: '18mm', border: '1px solid #000', padding: '2mm' }}>HSN</th>
                                    <th style={{ width: '15mm', border: '1px solid #000', padding: '2mm' }}>Quantity</th>
                                    <th style={{ width: '22mm', border: '1px solid #000', padding: '2mm' }}>Rate</th>
                                    <th style={{ width: '28mm', border: '1px solid #000', padding: '2mm' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(inv.items || []).map((it, i) => (
                                    <tr key={i}>
                                        <td style={{ textAlign: 'center', fontWeight: 'bold', border: '1px solid #000', padding: '2mm' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 800, border: '1px solid #000', padding: '2mm' }}>{it.itemName}</td>
                                        <td style={{ fontSize: '8pt', whiteSpace: 'pre-wrap', border: '1px solid #000', padding: '2mm' }}>{it.description || it.modelNo || '—'}</td>
                                        <td style={{ textAlign: 'center', border: '1px solid #000', padding: '2mm' }}>{it.hsnCode}</td>
                                        <td style={{ textAlign: 'center', border: '1px solid #000', padding: '2mm' }}>{it.qty} Nos</td>
                                        <td style={{ textAlign: 'right', paddingRight: '2mm', border: '1px solid #000' }}>₹ {(it.rate || 0).toFixed(2)}</td>
                                        <td style={{ textAlign: 'right', paddingRight: '2mm', fontWeight: 800, border: '1px solid #000' }}>{(it.taxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                                {/* Filling middle space to ensure full-page height without internal grid lines */}
                                <tr>
                                    <td colSpan={7} style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000', height: `${Math.max(0, 10 - (inv.items?.length || 0)) * 20}px` }} />
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#f9fafb' }}>
                                    <td colSpan={4} style={{ textAlign: 'right', paddingRight: '2mm', fontWeight: 800 }}>Total Quantity:</td>
                                    <td style={{ textAlign: 'center', fontWeight: 800 }}>{inv.items?.reduce((acc, curr) => acc + curr.qty, 0)}</td>
                                    <td style={{ border: 'none' }} />
                                    <td style={{ textAlign: 'right', paddingRight: '2mm', fontWeight: 800 }}>{(inv.totalTaxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>

                        <div className="p-flex" style={{ borderTop: '1px solid #000' }}>
                            <div style={{ flex: 1, borderRight: '1px solid #000', padding: '2mm' }}>
                                <div className="p-label" style={{ marginBottom: '1mm', textDecoration: 'underline' }}>COMPANY BANK DETAILS:</div>
                                <div style={{ fontSize: '9pt' }}>
                                    <div className="p-flex"><span style={{ width: '28mm' }}>Bank Name:</span> <strong>{company.bankName || 'BANK OF BARODA'}</strong></div>
                                    <div className="p-flex"><span style={{ width: '28mm' }}>A/c No. :</span> <strong>{company.accountNo || '—'}</strong></div>
                                    <div className="p-flex"><span style={{ width: '28mm' }}>Branch & IFS Code:</span> <strong style={{ flex: 1 }}>{company.branchName} & {company.ifscCode}</strong></div>
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ padding: '2mm', borderBottom: '1px solid #000', fontWeight: 900 }}>Freight & Forwarding:</td>
                                            <td style={{ padding: '2mm', borderBottom: '1px solid #000', textAlign: 'right', fontWeight: 900 }}>₹ {(inv.freightAmount || 0).toFixed(2)}</td>
                                        </tr>

                                        <tr style={{ background: '#f5f5f5' }}>
                                            <td style={{ padding: '3mm 2mm', fontWeight: 900, fontSize: '13pt' }}>Rounded Total:</td>
                                            <td style={{ padding: '3mm 2mm', textAlign: 'right', fontWeight: 900, fontSize: '13pt' }}>₹ {(inv.roundedTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan="2" style={{ padding: '2mm', fontSize: '9pt', fontStyle: 'italic', background: '#fff' }}>
                                                <strong>In Words:</strong> {inv.amountInWords}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* 7. Terms & Conditions Section */}
                    <div style={{ marginTop: '4mm' }}>
                        <div className="p-label" style={{ fontSize: '10pt', marginBottom: '1mm', textDecoration: 'underline' }}>Terms & Conditions</div>
                        <div style={{ fontSize: '8pt', lineHeight: '1.4' }}>
                            1. Goods once sold will not be taken back.<br />
                            2. We are not responsible for any transit damage or loss.<br />
                            3. Complaints should be registered within 15 days.<br />
                            4. Subject to MUMBAI Jurisdiction.
                        </div>
                    </div>

                    {/* 8. Signature Section */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5mm' }}>
                        <div style={{ textAlign: 'center', width: '60mm' }}>
                            <div className="p-label" style={{ fontSize: '9pt', marginBottom: '15mm' }}>For {company.companyName || 'JSK Innovative Technology Pvt Ltd'}</div>
                            <div style={{ borderTop: '1px solid #000', paddingTop: '1mm' }}>
                                <div className="p-label" style={{ fontSize: '9pt' }}>Authorised Signatory</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', fontSize: '7pt', color: '#888', marginTop: '5mm', borderTop: '1px solid #eee', paddingTop: '1mm' }}>
                        This is a computer generated invoice and does not require a physical signature.
                    </div>
                </div>
            </div>

            <div className="no-print">

                <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <button onClick={() => navigate(PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Invoices</button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{inv.invoiceNumber}</h1>
                                <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}>{inv.paymentStatus}</span>
                                <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: inv.paymentType === 'Cash' ? '#f0fdf4' : '#fffbeb', color: inv.paymentType === 'Cash' ? '#16a34a' : '#d97706', border: `1px solid ${inv.paymentType === 'Cash' ? '#86efac' : '#fcd34d'}` }}>{inv.paymentType}</span>
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                                {inv.customerName} · {fmt(inv.invoiceDate)}
                                {inv.soNumber && <span> · SO: <strong style={{ color: '#374151' }}>{inv.soNumber}</strong></span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {/* Hide Payment Record Button as per user request */}
                            <button onClick={() => window.print()} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>🖨️ Print</button>
                            {notCancelled && notFullyPaid && (
                                <button onClick={handleCancel} disabled={cancelling} style={{ padding: '9px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>✕ Cancel</button>
                            )}
                        </div>
                    </div>
                    {/* Payment Progress */}
                    {inv.roundedTotal > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                                <span>Paid: {fmtCur(inv.paidAmount)}</span>
                                <span>Remaining: {fmtCur((inv.roundedTotal || inv.grandTotal) - inv.paidAmount)}</span>
                                <span>Total: {fmtCur(inv.roundedTotal || inv.grandTotal)}</span>
                            </div>
                            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (inv.paidAmount / (inv.roundedTotal || inv.grandTotal)) * 100)}%`, background: 'linear-gradient(90deg,#0d9488,#2563eb)', borderRadius: 99, transition: 'width 0.4s' }} />
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '20px 28px', maxWidth: 1000, margin: '0 auto' }}>
                    {/* Simplified Dashboard View - Just the Invoice Document */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: '20px', minHeight: '800px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                            <h2 style={{ margin: 0, color: '#64748b', fontSize: 13, textTransform: 'uppercase', letterSpacing: '1px' }}>Document Preview</h2>
                        </div>

                        {/* On-screen Invoice Render (similar to print but styled for screen) */}
                        <div style={{ border: '2px solid #333', color: '#000', padding: '10px' }}>
                            <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: 10, marginBottom: 10 }}>
                                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>TAX INVOICE</h1>
                            </div>

                            <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: 0 }}>
                                <div style={{ width: '120px', padding: 10, borderRight: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {company.logoUrl ? <img src={company.logoUrl} style={{ maxWidth: '100px' }} /> : <strong>LOGO</strong>}
                                </div>
                                <div style={{ flex: 1, padding: 10, textAlign: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: 20 }}>{company.companyName}</h2>
                                    <div style={{ fontSize: 12 }}>{company.address}</div>
                                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 5 }}>GSTIN: {company.gstNumber}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
                                <div style={{ flex: 1, padding: '5px 10px', borderRight: '1px solid #333' }}><strong>URN:</strong> {company.urn}</div>
                                <div style={{ flex: 1, padding: '5px 10px' }}><strong>CIN:</strong> {company.cin}</div>
                            </div>

                            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
                                <div style={{ flex: 1, borderRight: '1px solid #333' }}>
                                    <div style={{ display: 'flex', borderBottom: '1px solid #333', padding: '5px 10px' }}><span style={{ width: 100 }}>Invoice No:</span> <strong>{inv.invoiceNumber}</strong></div>
                                    <div style={{ display: 'flex', padding: '5px 10px' }}><span style={{ width: 100 }}>Dated:</span> <strong>{fmt(inv.invoiceDate)}</strong></div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', borderBottom: '1px solid #333', padding: '5px 10px' }}><span style={{ width: 130 }}>Payment Due Date:</span> <strong>{fmt(inv.paymentDueDate)}</strong></div>
                                    <div style={{ display: 'flex', padding: '5px 10px' }}><span style={{ width: 130 }}>Buyer Order No:</span> <strong>{inv.buyerOrderNo}</strong></div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
                                <div style={{ flex: 1, padding: 10, borderRight: '1px solid #333' }}>
                                    <strong>Billed To:</strong>
                                    <div>{inv.customerName}</div>
                                    <div style={{ fontSize: 12 }}>{inv.billingAddress}</div>
                                    <div style={{ fontSize: 12 }}>GSTIN: {inv.customerGstin}</div>
                                </div>
                                <div style={{ flex: 1, padding: 10 }}>
                                    <strong>Shipped To:</strong>
                                    <div>{inv.customerName}</div>
                                    <div style={{ fontSize: 12 }}>{inv.shippingAddress}</div>
                                    <div style={{ fontSize: 12 }}>GSTIN: {inv.shippingGstin || inv.customerGstin}</div>
                                </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '1px solid #333' }}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <th style={{ border: '1px solid #333', padding: 8 }}>Sr</th>
                                        <th style={{ border: '1px solid #333', padding: 8, textAlign: 'left' }}>Description</th>
                                        <th style={{ border: '1px solid #333', padding: 8 }}>HSN</th>
                                        <th style={{ border: '1px solid #333', padding: 8 }}>Qty</th>
                                        <th style={{ border: '1px solid #333', padding: 8, textAlign: 'right' }}>Rate</th>
                                        <th style={{ border: '1px solid #333', padding: 8, textAlign: 'right' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inv.items?.map((it, i) => (
                                        <tr key={i}>
                                            <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{i + 1}</td>
                                            <td style={{ border: '1px solid #333', padding: 8 }}>
                                                <strong>{it.itemName}</strong>
                                                <div style={{ fontSize: 11 }}>{it.description}</div>
                                            </td>
                                            <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{it.hsnCode}</td>
                                            <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{it.qty}</td>
                                            <td style={{ border: '1px solid #333', padding: 8, textAlign: 'right' }}>{fmtCur(it.rate)}</td>
                                            <td style={{ border: '1px solid #333', padding: 8, textAlign: 'right' }}>{fmtCur(it.taxableAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div style={{ display: 'flex' }}>
                                <div style={{ flex: 1, padding: 10, borderRight: '1px solid #333' }}>
                                    <strong>Bank Details:</strong>
                                    <div style={{ fontSize: 12 }}>{company.bankName}</div>
                                    <div style={{ fontSize: 12 }}>A/c: {company.accountNo}</div>
                                    <div style={{ fontSize: 12 }}>IFSC: {company.ifscCode}</div>
                                </div>
                                <div style={{ width: '300px', padding: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Freight:</span> <span>{fmtCur(inv.freightAmount)}</span></div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '2px solid #333', fontWeight: 900, fontSize: 18 }}>
                                        <span>Total:</span> <span>{fmtCur(inv.roundedTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Removed Record New Payment from screen preview too */}
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            {
                showPayModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                        <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>💳 Record Payment</h2>
                            <p style={{ margin: '0 0 20px', color: '#9ca3af', fontSize: 13 }}>Invoice: {inv.invoiceNumber} · Remaining: {fmtCur((inv.roundedTotal || inv.grandTotal) - inv.paidAmount)}</p>
                            <div style={{ display: 'grid', gap: 12 }}>
                                {[['Amount Paid *', 'amountPaid', 'number'], ['Payment Date', 'paymentDate', 'date'], ['Reference / UTR', 'reference', 'text']].map(([label, key, type]) => (
                                    <div key={key}>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>{label}</label>
                                        <input type={type} value={payForm[key]} onChange={e => setPayForm(p => ({ ...p, [key]: e.target.value }))} style={inp} />
                                    </div>
                                ))}
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Payment Mode</label>
                                    <select value={payForm.paymentMode} onChange={e => setPayForm(p => ({ ...p, paymentMode: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                                        {['Cash', 'UPI', 'Cheque', 'Net Banking', 'NEFT/RTGS/IMPS', 'Card', 'Other'].map(m => <option key={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Remarks</label>
                                    <input value={payForm.remarks} onChange={e => setPayForm(p => ({ ...p, remarks: e.target.value }))} style={inp} />
                                </div>
                            </div>
                            <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowPayModal(false)} style={{ padding: '8px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Cancel</button>
                                <button onClick={handleRecordPayment} disabled={payingSaving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>
                                    {payingSaving ? 'Saving...' : '✓ Record Payment'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Print Styles */}
            <style>{`
                @media print { 
                    @page { 
                        size: A4 portrait; 
                        margin: 0; 
                    }
                    body { 
                        background: #fff !important; 
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 210mm;
                    }
                    .no-print { display: none !important; } 
                    .print-only { 
                        display: block !important; 
                        width: 210mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    * { 
                        color: #000 !important; 
                        box-shadow: none !important; 
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    table th { 
                        background: #f5f5f5 !important; 
                    }
                }
            `}</style>
        </div>
    );
}
