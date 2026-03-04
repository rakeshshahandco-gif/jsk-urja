import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPurchaseOrderById, updatePOStatus } from '@/services/purchaseApi';
import { getGRNsByPO, createGRN } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    'Draft': { color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
    'Ordered': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Partially Received': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Fully Received': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    'Completed': { color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' },
    'Cancelled': { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const inp = { padding: '7px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, color: '#374151', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' };
const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function PurchaseOrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [po, setPO] = useState(null);
    const [grns, setGRNs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showGRN, setShowGRN] = useState(false);
    const [grnForm, setGRNForm] = useState({});
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        Promise.all([
            getPurchaseOrderById(id),
            getGRNsByPO(id),
        ]).then(([poData, grnData]) => {
            setPO(poData);
            setGRNs(Array.isArray(grnData) ? grnData : []);
            const form = {};
            (poData.items || []).forEach(item => {
                form[item._id] = { poItemId: item._id, receivedQty: '', qcStatus: 'Pending', batchNo: '', remarks: '' };
            });
            setGRNForm(form);
        }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    const handleGRNSubmit = async () => {
        const items = Object.values(grnForm).filter(i => i.receivedQty > 0);
        if (items.length === 0) return toast.error('Enter received quantity for at least one item');
        setSaving(true);
        try {
            const res = await createGRN({ sourceType: 'Against PO', poId: id, items });
            toast.success(res.message || 'GRN created!');
            setShowGRN(false);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const setFormItem = (poItemId, k, v) => setGRNForm(f => ({ ...f, [poItemId]: { ...f[poItemId], [k]: v } }));

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh' }}>Loading...</div>;
    if (!po) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh' }}>PO not found</div>;

    const sc = STATUS_COLORS[po.status] || STATUS_COLORS['Draft'];
    const canReceive = !['Completed', 'Cancelled'].includes(po.status);

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => navigate(PATHS.PURCHASE.ORDERS)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
                    ← Purchase Orders
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{po.poNumber}</h1>
                            <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{po.status}</span>
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                            {po.supplierName} · PO Date: {fmt(po.poDate)} · Expected: {fmt(po.expectedDeliveryDate)}
                        </div>
                    </div>
                    {canReceive && (
                        <button onClick={() => setShowGRN(true)}
                            style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                            📦 Receive Material (GRN)
                        </button>
                    )}
                </div>
            </div>

            <div style={{ padding: '24px 28px' }}>
                {/* Info Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                    {[
                        ['Grand Total', `₹${(po.grandTotal || 0).toLocaleString('en-IN')}`, '#16a34a'],
                        ['Tax', `₹${(po.taxTotal || 0).toLocaleString('en-IN')}`, '#2563eb'],
                        ['Discount', `₹${(po.discountTotal || 0).toLocaleString('en-IN')}`, '#d97706'],
                        ['Payment Terms', po.paymentTerms || '—', '#6b7280'],
                    ].map(([k, v, c]) => (
                        <div key={k} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: c, marginTop: 4 }}>{v}</div>
                        </div>
                    ))}
                </div>

                {/* Items Table */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Order Items</h2>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                {['Item', 'UOM', 'Ordered Qty', 'Received Qty', 'Pending Qty', 'Rate', 'Tax%', 'Total Amount'].map(h => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(po.items || []).map((item) => (
                                <tr key={item._id}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={td}>
                                        <div style={{ color: '#1e293b', fontWeight: 500 }}>{item.itemName}</div>
                                        <div style={{ color: '#9ca3af', fontSize: 11 }}>{item.itemCode}</div>
                                    </td>
                                    <td style={td}>{item.uom}</td>
                                    <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{item.orderedQty}</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 600 }}>{item.receivedQty}</td>
                                    <td style={td}>
                                        <span style={{
                                            padding: '2px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                                            background: item.pendingQty > 0 ? '#fffbeb' : '#f0fdf4',
                                            color: item.pendingQty > 0 ? '#d97706' : '#16a34a',
                                            border: `1px solid ${item.pendingQty > 0 ? '#fcd34d' : '#86efac'}`
                                        }}>
                                            {item.pendingQty}
                                        </span>
                                    </td>
                                    <td style={td}>₹{item.rate}</td>
                                    <td style={td}>{item.taxPercent}%</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(item.totalAmount || 0).toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* GRN History */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📦 GRN History ({grns.length})</h2>
                    </div>
                    {grns.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No GRNs yet. Click "Receive Material" to create one.</div>
                    ) : grns.map((grn, i) => (
                        <div key={grn._id} style={{ padding: '16px 20px', borderBottom: i < grns.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div>
                                    <span style={{ fontWeight: 700, color: '#2563eb' }}>{grn.grnNumber}</span>
                                    <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 10 }}>{fmt(grn.grnDate)}</span>
                                </div>
                                <span style={{ color: '#16a34a', fontWeight: 700 }}>₹{(grn.totalAmount || 0).toLocaleString('en-IN')}</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f9fafb' }}>
                                        {['Item', 'Received Qty', 'Rate', 'Amount', 'QC Status'].map(h => <th key={h} style={{ padding: '5px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {grn.items.map(gi => (
                                        <tr key={gi._id}>
                                            <td style={{ padding: '6px 10px', color: '#374151' }}>{gi.itemName}</td>
                                            <td style={{ padding: '6px 10px', color: '#16a34a', fontWeight: 600 }}>{gi.receivedQty}</td>
                                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>₹{gi.rate}</td>
                                            <td style={{ padding: '6px 10px', color: '#16a34a' }}>₹{gi.amount}</td>
                                            <td style={{ padding: '6px 10px' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                    background: gi.qcStatus === 'Accepted' ? '#f0fdf4' : gi.qcStatus === 'Rejected' ? '#fef2f2' : '#f1f5f9',
                                                    color: gi.qcStatus === 'Accepted' ? '#16a34a' : gi.qcStatus === 'Rejected' ? '#dc2626' : '#64748b',
                                                    border: `1px solid ${gi.qcStatus === 'Accepted' ? '#86efac' : gi.qcStatus === 'Rejected' ? '#fca5a5' : '#e2e8f0'}`
                                                }}>
                                                    {gi.qcStatus}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>

            {/* GRN Modal */}
            {showGRN && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28, width: '100%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>📦 Receive Material – {po.poNumber}</h2>
                        <p style={{ margin: '0 0 20px', color: '#9ca3af', fontSize: 13 }}>Enter received quantities. Only items with qty &gt; 0 will be recorded.</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                            <thead>
                                <tr>
                                    {['Item', 'Ordered', 'Received', 'Pending', 'Receive Qty *', 'QC Status', 'Batch No'].map(h => (
                                        <th key={h} style={th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(po.items || []).filter(i => i.pendingQty > 0).map(item => (
                                    <tr key={item._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500, color: '#1e293b' }}>{item.itemName}</div>
                                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.itemCode}</div>
                                        </td>
                                        <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{item.orderedQty}</td>
                                        <td style={{ ...td, color: '#16a34a' }}>{item.receivedQty}</td>
                                        <td style={{ ...td, color: '#d97706', fontWeight: 700 }}>{item.pendingQty}</td>
                                        <td style={{ ...td, width: 110 }}>
                                            <input type="number" min="0" max={item.pendingQty} step="0.01"
                                                value={grnForm[item._id]?.receivedQty || ''}
                                                onChange={e => setFormItem(item._id, 'receivedQty', Number(e.target.value))}
                                                style={{ ...inp, border: '1px solid #0d9488' }} />
                                        </td>
                                        <td style={{ ...td, width: 120 }}>
                                            <select value={grnForm[item._id]?.qcStatus || 'Pending'}
                                                onChange={e => setFormItem(item._id, 'qcStatus', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                                <option>Pending</option>
                                                <option>Accepted</option>
                                                <option>Rejected</option>
                                                <option>Hold</option>
                                            </select>
                                        </td>
                                        <td style={{ ...td, width: 110 }}>
                                            <input value={grnForm[item._id]?.batchNo || ''} onChange={e => setFormItem(item._id, 'batchNo', e.target.value)} style={inp} placeholder="Batch #" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {(po.items || []).filter(i => i.pendingQty > 0).length === 0 && (
                            <div style={{ padding: 20, textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>✓ All items fully received!</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowGRN(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleGRNSubmit} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>
                                {saving ? 'Creating GRN...' : '✓ Confirm Receipt & Update Stock'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
