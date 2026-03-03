import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPurchaseOrderById, updatePOStatus } from '@/services/purchaseApi';
import { getGRNsByPO, createGRN } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    'Draft': { color: '#94a3b8', bg: '#1e293b' },
    'Ordered': { color: '#60a5fa', bg: '#1e3a5f' },
    'Partially Received': { color: '#fb923c', bg: '#1c0e00' },
    'Completed': { color: '#6ee7b7', bg: '#052e16' },
    'Cancelled': { color: '#ef4444', bg: '#450a0a' },
};

const inp = { padding: '7px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '12px', outline: 'none', width: '100%', boxSizing: 'border-box' };

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
            // Initialize GRN form with pending items
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
            const res = await createGRN({ poId: id, items });
            toast.success(res.message || 'GRN created!');
            setShowGRN(false);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const setFormItem = (poItemId, k, v) => setGRNForm(f => ({ ...f, [poItemId]: { ...f[poItemId], [k]: v } }));

    if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', background: '#0f172a', minHeight: '100vh' }}>Loading...</div>;
    if (!po) return <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444', background: '#0f172a', minHeight: '100vh' }}>PO not found</div>;

    const sc = STATUS_COLORS[po.status] || STATUS_COLORS['Draft'];
    const canReceive = !['Completed', 'Cancelled'].includes(po.status);

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            {/* Header */}
            <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '16px 28px' }}>
                <button onClick={() => navigate(PATHS.PURCHASE.ORDERS)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '8px' }}>
                    ← Purchase Orders
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{po.poNumber}</h1>
                            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: sc.bg, color: sc.color }}>{po.status}</span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
                            {po.supplierName} · PO Date: {fmt(po.poDate)} · Expected: {fmt(po.expectedDeliveryDate)}
                        </div>
                    </div>
                    {canReceive && (
                        <button onClick={() => setShowGRN(true)}
                            style={{ padding: '9px 18px', borderRadius: '8px', background: '#065f46', color: '#6ee7b7', border: '1px solid #10b981', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                            📦 Receive Material (GRN)
                        </button>
                    )}
                </div>
            </div>

            <div style={{ padding: '28px' }}>
                {/* PO Info Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                    {[
                        ['Grand Total', `₹${(po.grandTotal || 0).toLocaleString('en-IN')}`, '#10b981'],
                        ['Tax', `₹${(po.taxTotal || 0).toLocaleString('en-IN')}`, '#3b82f6'],
                        ['Discount', `₹${(po.discountTotal || 0).toLocaleString('en-IN')}`, '#f59e0b'],
                        ['Payment Terms', po.paymentTerms || '—', '#94a3b8'],
                    ].map(([k, v, c]) => (
                        <div key={k} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{k}</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: c, marginTop: '4px' }}>{v}</div>
                        </div>
                    ))}
                </div>

                {/* Items Table */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Order Items</h2>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                {['Item', 'UOM', 'Ordered Qty', 'Received Qty', 'Pending Qty', 'Rate', 'Tax%', 'Total Amount'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(po.items || []).map((item, i) => (
                                <tr key={item._id} style={{ background: i % 2 === 0 ? '#0f172a' : '#1e293b', borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ color: '#f1f5f9', fontWeight: 500 }}>{item.itemName}</div>
                                        <div style={{ color: '#475569', fontSize: '11px' }}>{item.itemCode}</div>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{item.uom}</td>
                                    <td style={{ padding: '12px 14px', color: '#3b82f6', fontWeight: 600 }}>{item.orderedQty}</td>
                                    <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 600 }}>{item.receivedQty}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ padding: '3px 10px', borderRadius: '10px', background: item.pendingQty > 0 ? '#1c0e00' : '#052e16', color: item.pendingQty > 0 ? '#fb923c' : '#6ee7b7', fontWeight: 700, fontSize: '12px' }}>
                                            {item.pendingQty}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>₹{item.rate}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{item.taxPercent}%</td>
                                    <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>₹{(item.totalAmount || 0).toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* GRN History */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>📦 GRN History ({grns.length})</h2>
                    </div>
                    {grns.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No GRNs yet. Click "Receive Material" to create one.</div>
                    ) : grns.map((grn, i) => (
                        <div key={grn._id} style={{ padding: '16px 20px', borderBottom: i < grns.length - 1 ? '1px solid #334155' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div>
                                    <span style={{ fontWeight: 700, color: '#60a5fa' }}>{grn.grnNumber}</span>
                                    <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '10px' }}>{fmt(grn.grnDate)}</span>
                                </div>
                                <span style={{ color: '#10b981', fontWeight: 700 }}>₹{(grn.totalAmount || 0).toLocaleString('en-IN')}</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ color: '#64748b' }}>
                                        {['Item', 'Received Qty', 'Rate', 'Amount', 'QC Status'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left' }}>{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {grn.items.map(gi => (
                                        <tr key={gi._id}>
                                            <td style={{ padding: '6px 10px', color: '#f1f5f9' }}>{gi.itemName}</td>
                                            <td style={{ padding: '6px 10px', color: '#10b981', fontWeight: 600 }}>{gi.receivedQty}</td>
                                            <td style={{ padding: '6px 10px', color: '#94a3b8' }}>₹{gi.rate}</td>
                                            <td style={{ padding: '6px 10px', color: '#10b981' }}>₹{gi.amount}</td>
                                            <td style={{ padding: '6px 10px' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: gi.qcStatus === 'Accepted' ? '#052e16' : gi.qcStatus === 'Rejected' ? '#450a0a' : '#1e293b', color: gi.qcStatus === 'Accepted' ? '#6ee7b7' : gi.qcStatus === 'Rejected' ? '#fca5a5' : '#94a3b8' }}>
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
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>📦 Receive Material – {po.poNumber}</h2>
                        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>Enter received quantities. Only items with qty &gt; 0 will be recorded. Received qty cannot exceed pending.</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
                            <thead>
                                <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                    {['Item', 'Ordered', 'Received', 'Pending', 'Receive Qty *', 'QC Status', 'Batch No'].map(h => (
                                        <th key={h} style={{ padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #334155' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(po.items || []).filter(i => i.pendingQty > 0).map(item => (
                                    <tr key={item._id} style={{ borderBottom: '1px solid #1e293b' }}>
                                        <td style={{ padding: '8px 10px', color: '#f1f5f9' }}>
                                            <div style={{ fontWeight: 500 }}>{item.itemName}</div>
                                            <div style={{ fontSize: '11px', color: '#475569' }}>{item.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '8px 10px', color: '#3b82f6', fontWeight: 600 }}>{item.orderedQty}</td>
                                        <td style={{ padding: '8px 10px', color: '#10b981' }}>{item.receivedQty}</td>
                                        <td style={{ padding: '8px 10px', color: '#fb923c', fontWeight: 700 }}>{item.pendingQty}</td>
                                        <td style={{ padding: '8px 10px', width: '110px' }}>
                                            <input type="number" min="0" max={item.pendingQty} step="0.01"
                                                value={grnForm[item._id]?.receivedQty || ''}
                                                onChange={e => setFormItem(item._id, 'receivedQty', Number(e.target.value))}
                                                style={{ ...inp, border: '1px solid #10b981' }} />
                                        </td>
                                        <td style={{ padding: '8px 10px', width: '120px' }}>
                                            <select value={grnForm[item._id]?.qcStatus || 'Pending'}
                                                onChange={e => setFormItem(item._id, 'qcStatus', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                                <option>Pending</option>
                                                <option>Accepted</option>
                                                <option>Rejected</option>
                                                <option>Hold</option>
                                            </select>
                                        </td>
                                        <td style={{ padding: '8px 10px', width: '110px' }}>
                                            <input value={grnForm[item._id]?.batchNo || ''} onChange={e => setFormItem(item._id, 'batchNo', e.target.value)} style={inp} placeholder="Batch #" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {(po.items || []).filter(i => i.pendingQty > 0).length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#6ee7b7' }}>✓ All items fully received!</div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowGRN(false)} style={{ padding: '8px 16px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleGRNSubmit} disabled={saving} style={{ padding: '8px 20px', background: '#065f46', color: '#6ee7b7', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>
                                {saving ? 'Creating GRN...' : '✓ Confirm Receipt & Update Stock'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
