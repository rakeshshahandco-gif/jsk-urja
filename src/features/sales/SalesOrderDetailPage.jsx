import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSalesOrderById, cancelSalesOrder, generateProductionSheet } from '@/services/salesApi';
import { getCompanyProfile } from '@/services/settingsApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    Draft: { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
    Confirmed: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Dispatched: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    Invoiced: { color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' },
    Closed: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Cancelled: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};
const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 12, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function SalesOrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [so, setSO] = useState(null);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getSalesOrderById(id),
            getCompanyProfile().catch(() => ({ data: {} }))
        ]).then(([soRes, companyRes]) => {
            setSO(soRes);
            setCompany(companyRes?.data || {});
        }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    const handleGeneratePS = async () => {
        setGenerating(true);
        try {
            const res = await generateProductionSheet(id);
            toast.success(res.message || 'Production sheet generated!');
            navigate(PATHS.SALES.PRODUCTION_SHEET(res.data._id));
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setGenerating(false); }
    };

    const handleCancel = async () => {
        if (!window.confirm('Cancel this Sales Order?')) return;
        setCancelling(true);
        try { await cancelSalesOrder(id); toast.success('Cancelled'); load(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setCancelling(false); }
    };

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Loading...</div>;
    if (!so) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Sales Order not found.</div>;

    const sc = STATUS_COLORS[so.status] || STATUS_COLORS.Draft;
    const notCancelled = so.status !== 'Cancelled';

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* PRINT ONLY LAYOUT */}
            <div className="print-only" style={{ display: 'none', width: '210mm', padding: 0, margin: '0 auto' }}>
                <div style={{ padding: '8mm', minHeight: '270mm', display: 'flex', flexDirection: 'column', background: '#fff', boxSizing: 'border-box', border: '1px solid #000' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '16px', marginBottom: '16px' }}>
                        <div style={{ width: '40%' }}>
                            {company.logoUrl ? (
                                <img src={company.logoUrl} alt="Company Logo" style={{ maxHeight: '70px', maxWidth: '200px', objectFit: 'contain' }} />
                            ) : (
                                <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', letterSpacing: '1px' }}>{company.companyName || 'JSK URJA'}</div>
                            )}
                        </div>
                        <div style={{ width: '60%', textAlign: 'left', fontSize: '10px', lineHeight: '1.4' }}>
                            <h2 style={{ fontSize: '15px', margin: '0 0 4px 0', textTransform: 'uppercase', fontWeight: 800 }}>{company.companyName || 'JSK URJA'}</h2>
                            <div style={{ textTransform: 'uppercase', color: '#374151' }}>
                                {company.address}<br />
                                {(company.city || company.state) ? `${company.city} ${company.state}, India. Postal Code: ${company.pincode}. State Code: ${company.stateCode || ''}` : ''}<br />
                                {(company.phone || company.email) && `Phone: ${company.phone || ''} Email: ${company.email || ''}`}<br />
                                {company.gstNumber && `GSTIN: ${company.gstNumber}`}
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                        <h2 style={{ fontSize: '22px', border: '1px solid #000', display: 'inline-block', padding: '6px 40px', background: '#f5f5f5', color: '#000', margin: 0, fontWeight: 900, textTransform: 'uppercase' }}>
                            Sales Order
                        </h2>
                    </div>

                    <div style={{ textAlign: 'right', marginBottom: '10px', fontSize: '13px', color: '#000', fontWeight: 800 }}>
                        SALES ORDER NO: SO-{so.soNumber}
                    </div>

                    {/* Info Block */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '16px' }}>
                        <div style={{ width: '45%' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ width: '100px', fontWeight: 'bold', verticalAlign: 'top' }}>Customer Name:</td>
                                        <td style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{so.customerName}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ width: '100px', fontWeight: 'bold', verticalAlign: 'top' }}>Customer Code:</td>
                                        <td style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{so.customerCode || '—'}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ fontWeight: 'bold', verticalAlign: 'top', paddingTop: '8px' }}>Address:</td>
                                        <td style={{ verticalAlign: 'top', paddingTop: '8px', textTransform: 'uppercase', color: '#374151' }}>
                                            {so.billingAddress || so.shippingAddress || '—'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ fontWeight: 'bold', verticalAlign: 'top', paddingTop: '8px' }}>GSTIN:</td>
                                        <td style={{ verticalAlign: 'top', paddingTop: '8px', textTransform: 'uppercase' }}>{so.customerGstin || '—'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div style={{ width: '40%' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
                                <tbody>
                                    <tr><td style={{ fontWeight: 'bold', width: '120px' }}>Date:</td><td>{fmt(so.soDate)}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Order Category:</td><td>{so.orderCategory || 'ORDER'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Delivery Date:</td><td>{fmt(so.deliveryDate)}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Customer's<br />Purchase Order:</td><td style={{ verticalAlign: 'top' }}>{so.customerPO || 'VERBAL'}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Customer's<br />Purchase Order Date:</td><td style={{ verticalAlign: 'top' }}>{fmt(so.customerPODate || so.soDate)}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Items Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: 'auto', border: '1px solid #000' }}>
                        <thead style={{ background: '#f5f5f5', color: '#000' }}>
                            <tr>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', width: '30px', fontWeight: 800 }}>Sr</th>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'left', width: '85px', fontWeight: 800 }}>Item Code</th>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'left', fontWeight: 800 }}>Item Name</th>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'left', width: '100px', fontWeight: 800 }}>Additional Notes</th>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', width: '60px', fontWeight: 800 }}>HSN</th>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', width: '60px', fontWeight: 800 }}>Qty</th>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'right', width: '80px', fontWeight: 800 }}>Rate</th>
                                <th style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'right', width: '100px', fontWeight: 800 }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(so.items || []).map((item, i) => (
                                <tr key={i}>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', verticalAlign: 'top' }}>{i + 1}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', textTransform: 'uppercase' }}>{item.itemCode || '—'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', fontWeight: 'bold', textTransform: 'uppercase' }}>{item.itemName}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', fontSize: '9px' }}>{item.additionalNotes || '—'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', textAlign: 'center', fontSize: '9px' }}>{item.hsnCode || '—'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', textAlign: 'center', fontWeight: 'bold' }}>{item.qty} {item.uom}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', verticalAlign: 'top' }}>₹ {Number(item.rate || 0).toFixed(2)}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', verticalAlign: 'top', fontWeight: 'bold' }}>₹ {Number(item.amount || (item.qty * item.rate) || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                            {/* Filling middle space to ensure full-page height without internal grid lines */}
                            <tr>
                                <td style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000', height: `${Math.max(0, 10 - (so.items?.length || 0)) * 20}px` }} colSpan="8"></td>
                            </tr>
                        </tbody>
                        <tbody>
                            <tr style={{ background: '#f5f5f5' }}>
                                <td colSpan="5" style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>Total Quantity:</div>
                                </td>
                                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>
                                    {so.items?.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', fontWeight: 'bold' }}>Total</td>
                                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>₹ {Number(so.totalAmount || 0).toFixed(2)}</td>
                            </tr>
                            {so.freightAmount > 0 && (
                                <tr>
                                    <td colSpan="6" style={{ border: 'none' }}></td>
                                    <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', fontSize: '9px' }}>Freight</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>₹ {Number(so.freightAmount || 0).toFixed(2)}</td>
                                </tr>
                            )}
                            {so.gstType === 'CGST / SGST' ? (
                                <>
                                    {so.totalCgst > 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ border: 'none' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', fontSize: '9px' }}>CGST</td>
                                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>₹ {Number(so.totalCgst || 0).toFixed(2)}</td>
                                        </tr>
                                    )}
                                    {so.totalSgst > 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ border: 'none' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', fontSize: '9px' }}>SGST</td>
                                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>₹ {Number(so.totalSgst || 0).toFixed(2)}</td>
                                        </tr>
                                    )}
                                    {(so.totalCgst > 0 || so.totalSgst > 0) && (
                                        <tr style={{ background: '#f5f5f5' }}>
                                            <td colSpan="6" style={{ border: 'none' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', fontSize: '10px' }}>Total Tax</td>
                                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>₹ {Number(so.totalGst || 0).toFixed(2)}</td>
                                        </tr>
                                    )}
                                </>
                            ) : (
                                so.totalGst > 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ border: 'none' }}></td>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', fontSize: '9px' }}>Output Tax {so.gstType}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>₹ {Number(so.totalGst || 0).toFixed(2)}</td>
                                    </tr>
                                )
                            )}
                            {so.roundOff !== 0 && (
                                <tr>
                                    <td colSpan="6" style={{ border: 'none' }}></td>
                                    <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', fontSize: '9px' }}>Round Off</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{Number(so.roundOff || 0).toFixed(2)}</td>
                                </tr>
                            )}
                            <tr style={{ background: '#f5f5f5' }}>
                                <td colSpan="6" style={{ border: 'none' }}></td>
                                <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', fontSize: '14px' }}>Grand Total:</td>
                                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>₹ {Number(so.grandTotal || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colSpan="6" style={{ border: 'none' }}></td>
                                <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>Rounded Total:</td>
                                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px' }}>₹ {Number(so.roundedTotal || so.grandTotal || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colSpan="6" style={{ border: 'none' }}></td>
                                <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>In Words:</td>
                                <td style={{ border: '1px solid #000', padding: '6px', fontSize: '9px', fontStyle: 'italic', textTransform: 'capitalize' }}>{so.amountInWords}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        {/* Footer Bank Details */}
                        <div style={{ fontSize: '9px', marginTop: '16px' }}>
                            <b style={{ textTransform: 'uppercase' }}>COMPANY BANK DETAILS:</b><br />
                            <table style={{ borderCollapse: 'collapse', marginTop: '4px' }}>
                                <tbody>
                                    <tr><td style={{ width: '80px', paddingBottom: '3px', color: '#6b7280' }}>Bank Name</td><td style={{ paddingBottom: '3px' }}>: <b>BANK OF BARODA</b></td></tr>
                                    <tr><td style={{ paddingBottom: '3px', color: '#6b7280' }}>A/c No.</td><td style={{ paddingBottom: '3px' }}>: <b>20260200001544</b></td></tr>
                                    <tr><td style={{ paddingBottom: '3px', color: '#6b7280' }}>Branch & IFS Code</td><td style={{ paddingBottom: '3px' }}>: <b>SHIMPOLI & BARB0SHIBOR</b></td></tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Signature Block */}
                        <div style={{ marginTop: '20px', textAlign: 'right', fontSize: '13px' }}>
                            <div style={{ fontWeight: 900, textTransform: 'uppercase', marginBottom: '40px' }}>For {company.companyName || 'JSK INNOVATIVE TECH P LTD'}</div>
                            <div style={{ fontWeight: 900 }}>Authorized Signatory</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Application Section (Screen Only) */}
            <div className="no-print">
                {/* Application Header */}
                <div data-no-print style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <button onClick={() => navigate(PATHS.SALES.ORDERS)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Orders</button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{so.soNumber}</h1>
                                <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{so.status}</span>
                                <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: so.paymentType === 'Cash' ? '#f0fdf4' : '#fffbeb', color: so.paymentType === 'Cash' ? '#16a34a' : '#d97706', border: `1px solid ${so.paymentType === 'Cash' ? '#86efac' : '#fcd34d'}` }}>{so.paymentType}</span>
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                                <strong style={{ color: '#374151' }}>{so.customerCode || '—'}</strong> · {so.customerName} · {so.orderCategory}
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>Date: {fmt(so.soDate)} · Delivery: {fmt(so.deliveryDate)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {notCancelled && !so.productionSheetId && (
                                <button onClick={handleGeneratePS} disabled={generating} style={{ padding: '9px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                                    🖨️ {generating ? 'Generating...' : 'Generate Production Sheet'}
                                </button>
                            )}
                            {so.productionSheetId && (
                                <button onClick={() => navigate(PATHS.SALES.PRODUCTION_SHEET(so.productionSheetId))} style={{ padding: '9px 16px', background: '#f1f5f9', border: '1px solid #7c3aed', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>
                                    📋 View Production Sheet
                                </button>
                            )}
                            {so.status === 'Confirmed' && !so.invoiceId && (
                                <button onClick={() => navigate(`${PATHS.SALES.NEW_INVOICE}?soId=${id}`)} style={{ padding: '9px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                                    🧾 Create Invoice
                                </button>
                            )}
                            <button onClick={() => window.print()} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>🖨️ Print</button>
                            {notCancelled && (
                                <button onClick={() => navigate(`/sales/orders/${id}/edit`)} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>✏️ Edit</button>
                            )}
                            {notCancelled && (
                                <button onClick={handleCancel} disabled={cancelling} style={{ padding: '9px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>✕ Cancel</button>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ padding: '24px 28px' }}>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
                        {[
                            ['Grand Total', fmtCur(so.roundedTotal || so.grandTotal), '#16a34a'],
                            ['Total Items', `${so.items?.length || 0} items`, '#2563eb'],
                            ['GST Type', so.gstType || '—', '#6b7280'],
                            ['Customer PO', so.customerPO || '—', '#6b7280'],
                        ].map(([k, v, c]) => (
                            <div key={k} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: c, marginTop: 4 }}>{v}</div>
                            </div>
                        ))}
                    </div>

                    {/* Customer Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        {[['Billing Address', so.billingAddress], ['Shipping Address', so.shippingAddress]].map(([title, addr]) => (
                            <div key={title} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{so.customerName}</div>
                                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Customer Code: {so.customerCode || '—'}</div>
                                {so.customerGstin && <div style={{ fontSize: 12, color: '#6b7280' }}>GSTIN: {so.customerGstin}</div>}
                                {addr && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, whiteSpace: 'pre-wrap' }}>{addr}</div>}
                            </div>
                        ))}
                    </div>

                    {/* Items Table */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Order Items</h2></div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Sr', 'Item Code', 'Item Name', 'Additional Notes', 'HSN', 'UOM', 'Qty', 'Rate', 'GST%', 'Amount'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {(so.items || []).map((item, i) => (
                                    <tr key={i} onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ ...td, color: '#9ca3af' }}>{i + 1}</td>
                                        <td style={td}>{item.itemCode || '—'}</td>
                                        <td style={td}><div style={{ fontWeight: 500, color: '#1e293b' }}>{item.itemName}</div></td>
                                        <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{item.additionalNotes || '—'}</td>
                                        <td style={{ ...td, color: '#6b7280' }}>{item.hsnCode || '—'}</td>
                                        <td style={td}>{item.uom}</td>
                                        <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{item.qty}</td>
                                        <td style={td}>₹{item.rate}</td>
                                        <td style={{ ...td, color: '#6b7280' }}>{item.gstRate}%</td>
                                        <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(item.amount || item.qty * item.rate || 0).toLocaleString('en-IN')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {/* Totals Footer */}
                        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ minWidth: 280 }}>
                                {[['Total Amount', fmtCur(so.totalAmount)],
                                ...(so.gstType === 'CGST / SGST'
                                    ? [['CGST', fmtCur(so.totalCgst)], ['SGST', fmtCur(so.totalSgst)], ['Total Tax', fmtCur(so.totalGst)]]
                                    : [[so.gstType || 'IGST', fmtCur(so.totalGst)]]),
                                ['Freight', fmtCur(so.freightAmount)],
                                ['Round Off', fmtCur(so.roundOff)]].filter(([, v]) => v !== '₹0').map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#6b7280' }}><span>{k}</span><span>{v}</span></div>
                                ))}
                                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: '#16a34a' }}>
                                    <span>Grand Total</span><span>{fmtCur(so.roundedTotal || so.grandTotal)}</span>
                                </div>
                                <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af', fontStyle: 'italic', textTransform: 'capitalize' }}>{so.amountInWords}</div>
                            </div>
                        </div>
                    </div>

                    {/* Remarks */}
                    {so.remarks && (
                        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Remarks</div>
                            <div style={{ fontSize: 13, color: '#374151' }}>{so.remarks}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Print Styles */}
            <style>{`
                @media print { 
                    @page { margin: 0; size: A4 portrait; }
                    body { background: #fff !important; margin: 0 !important; padding: 0 !important; width: 210mm; }
                    
                    /* Hide everything in the body by default */
                    body * { visibility: hidden; }
                    
                    /* Show only the print-only container and its children */
                    .print-only, .print-only * { visibility: visible !important; }
                    .print-only { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 210mm !important; 
                        display: block !important; 
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    button, [data-no-print], .no-print, #app-sidebar, #app-header { display: none !important; } 
                    * { color: #000 !important; box-shadow: none !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    table th { background: #f5f5f5 !important; }
                }
            `}</style>
        </div>
    );
}
