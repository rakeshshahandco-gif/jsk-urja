import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPurchaseRfqById, cancelPurchaseRfq } from '@/services/purchaseRfqApi';
import { PATHS } from '@/routes/paths';
import { exportRfqExcel, printRfqPdf } from './purchaseRfqExport';
import toast from 'react-hot-toast';

export default function PurchaseRfqDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [rfq, setRfq] = useState(null);
    const [quotations, setQuotations] = useState([]);

    const load = () => {
        getPurchaseRfqById(id).then((d) => {
            setRfq(d.rfq || d);
            setQuotations(d.quotations || []);
        }).catch(() => toast.error('Failed to load RFQ'));
    };

    useEffect(() => { load(); }, [id]);

    if (!rfq) return <div style={{ padding: 40 }}>Loading…</div>;

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>← Purchase RFQ</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, margin: '12px 0 20px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{rfq.rfqNumber}</h1>
                    <p style={{ margin: 4, color: '#64748b' }}>Status: <strong>{rfq.status}</strong> · Priority: {rfq.priority}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {rfq.status === 'Draft' && (
                        <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ_EDIT(id))} style={btn('#f1f5f9', '#374151')}>Edit</button>
                    )}
                    <button type="button" onClick={() => navigate(`${PATHS.PURCHASE.SUPPLIER_QUOTATIONS}?rfqId=${id}`)} style={btn('#eff6ff', '#2563eb')}>Enter Quotation</button>
                    <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ_COMPARISON(id))} style={btn('#f5f3ff', '#7c3aed')}>Compare</button>
                    <button type="button" onClick={() => exportRfqExcel(rfq, { forSupplier: false })} style={btn('#ecfdf5', '#059669')}>Export Excel</button>
                    <button type="button" onClick={() => exportRfqExcel(rfq, { forSupplier: true })} style={btn('#ecfdf5', '#047857')}>Supplier Excel (fill rates)</button>
                    <button type="button" onClick={() => printRfqPdf(rfq)} style={btn('#fff', '#374151')}>Print / PDF</button>
                    {rfq.status !== 'Cancelled' && rfq.status !== 'Converted to PO' && (
                        <button type="button" onClick={() => {
                            const reason = window.prompt('Cancel reason?');
                            if (!reason) return;
                            cancelPurchaseRfq(id, { reason }).then(() => { toast.success('Cancelled'); load(); });
                        }} style={btn('#fef2f2', '#dc2626')}>Cancel</button>
                    )}
                </div>
            </div>

            <div style={card}>
                <p><strong>RFQ Date:</strong> {fmt(rfq.rfqDate)} · <strong>Required By:</strong> {fmt(rfq.requiredByDate)}</p>
                <p><strong>Department:</strong> {rfq.department || '—'} · <strong>Requested By:</strong> {rfq.requestedBy || '—'}</p>
                <p><strong>Contact:</strong> {rfq.requestedByPhone || '—'} · <strong>Email:</strong> {rfq.requestedByEmail || '—'}</p>
                {rfq.remarks && <p><strong>Remarks:</strong> {rfq.remarks}</p>}
            </div>

            <div style={{ ...card, marginTop: 16 }}>
                <h3 style={{ marginTop: 0 }}>Items</h3>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#f9fafb' }}>
                        {['#', 'Item', 'Qty', 'UOM', 'Exp. Rate', 'Last Pur. Rate', 'Stock'].map((h) => <th key={h} style={{ padding: 8, textAlign: 'left' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                        {(rfq.items || []).map((it, i) => (
                            <tr key={it._id || i}>
                                <td style={{ padding: 8 }}>{i + 1}</td>
                                <td style={{ padding: 8 }}>{it.itemCode} — {it.itemName}</td>
                                <td style={{ padding: 8 }}>{it.requiredQty}</td>
                                <td style={{ padding: 8 }}>{it.uom}</td>
                                <td style={{ padding: 8 }}>{it.expectedRate > 0 ? it.expectedRate : '—'}</td>
                                <td style={{ padding: 8 }}>{it.lastPurchaseRate ?? '—'}</td>
                                <td style={{ padding: 8 }}>{it.currentStock ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ ...card, marginTop: 16 }}>
                <h3 style={{ marginTop: 0 }}>Suppliers ({rfq.suppliers?.length || 0})</h3>
                {(rfq.suppliers || []).length === 0 ? (
                    <p style={{ color: '#64748b', margin: 0 }}>No suppliers linked — use <strong>Supplier Excel (fill rates)</strong> above to email/WhatsApp this RFQ to vendors.</p>
                ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(rfq.suppliers || []).map((s) => (
                            <li key={String(s.supplierId?._id || s.supplierId)} style={{ marginBottom: 6 }}>{s.supplierName} — {s.mobile || s.email || ''}</li>
                        ))}
                    </ul>
                )}
            </div>

            <div style={{ ...card, marginTop: 16 }}>
                <h3 style={{ marginTop: 0 }}>Quotations received ({quotations.length})</h3>
                {quotations.length === 0 ? <p style={{ color: '#9ca3af' }}>No quotations yet</p> : (
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f9fafb' }}>
                            {['Supplier', 'Quotation No', 'Date', 'Status', 'PO'].map((h) => <th key={h} style={{ padding: 8, textAlign: 'left' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {quotations.map((q) => (
                                <tr key={q._id}>
                                    <td style={{ padding: 8 }}>{q.supplierName}</td>
                                    <td style={{ padding: 8 }}>{q.quotationNo || '—'}</td>
                                    <td style={{ padding: 8 }}>{fmt(q.quotationDate)}</td>
                                    <td style={{ padding: 8 }}>{q.status}</td>
                                    <td style={{ padding: 8 }}>{q.convertedPoNumber || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 };
const btn = (bg, color) => ({ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: bg, color, fontWeight: 600, cursor: 'pointer', fontSize: 13 });
