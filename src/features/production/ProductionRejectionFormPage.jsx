import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import toast from 'react-hot-toast';

const REASONS = ['Damage', 'Burn', 'Broken', 'Defective', 'Short Circuit', 'Expired', 'Other'];
const emptyItem = () => ({ itemId: '', itemCode: '', itemName: '', rejectionQty: '', reason: '', remarks: '' });

export default function ProductionRejectionFormPage() {
    const navigate = useNavigate();
    const [allItems, setAllItems] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);
    const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), workOrderId: '', workOrderNo: '', remarks: '' });
    const [items, setItems] = useState([emptyItem()]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/items', { params: { limit: 500 } }).then(res => {
            setAllItems((res.data?.data?.items || res.data?.data || []).filter(i => i.itemCategory === 'RAW_MATERIAL'));
        });
        api.get('/production-sheets', { params: { limit: 100 } })
            .then(res => setWorkOrders(res.data?.data?.sheets || res.data?.data || [])).catch(() => { });
    }, []);

    const handleItemChange = (idx, itemId) => {
        const item = allItems.find(i => i._id === itemId);
        setItems(prev => prev.map((r, i) => i === idx ? { ...r, itemId, itemCode: item?.itemCode || '', itemName: item?.itemName || '' } : r));
    };

    const addRow = () => setItems(prev => [...prev, emptyItem()]);
    const removeRow = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validItems = items.filter(r => r.itemId && r.rejectionQty && r.reason);
        if (validItems.length === 0) return toast.error('Add at least one item with qty and reason');
        setSaving(true);
        try {
            await api.post('/production-rejections', { ...form, items: validItems });
            toast.success('Production Rejection entry saved!');
            navigate('/production/rejections');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally { setSaving(false); }
    };

    const fieldStyle = { width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, background: '#fff' };
    const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 };

    return (
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', maxWidth: 900 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Back</button>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Production Rejection Entry</h2>
            </div>

            <form onSubmit={handleSubmit}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#475569' }}>Entry Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                        <div><label style={labelStyle}>Date *</label><input type="date" style={fieldStyle} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required /></div>
                        <div><label style={labelStyle}>Work Order (Optional)</label>
                            <select style={fieldStyle} value={form.workOrderId} onChange={e => {
                                const wo = workOrders.find(w => w._id === e.target.value);
                                setForm(p => ({ ...p, workOrderId: e.target.value, workOrderNo: wo ? (wo.sheetNo || '') : '' }));
                            }}>
                                <option value="">-- Select --</option>
                                {workOrders.map(w => <option key={w._id} value={w._id}>{w.sheetNo || w.workOrderNo}</option>)}
                            </select>
                        </div>
                        <div><label style={labelStyle}>Remarks</label><input style={fieldStyle} value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional notes" /></div>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#475569' }}>Rejected Components</h3>
                        <button type="button" onClick={addRow} style={{ padding: '5px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Add Row</button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr style={{ background: '#fee2e2' }}>
                                {['Item (Raw Material) *', 'Rejection Qty *', 'Reason *', 'Remarks', ''].map(h => (
                                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#991b1b', fontWeight: 600, borderBottom: '1px solid #fecaca' }}>{h}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {items.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '5px 6px' }}>
                                            <select style={{ ...fieldStyle, minWidth: 200 }} value={row.itemId} onChange={e => handleItemChange(idx, e.target.value)} required>
                                                <option value="">-- Select --</option>
                                                {allItems.map(i => <option key={i._id} value={i._id}>{i.itemCode} — {i.itemName}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ padding: '5px 6px' }}><input type="number" min="0.01" step="0.01" style={{ ...fieldStyle, width: 90 }} value={row.rejectionQty} onChange={e => setItems(prev => prev.map((r, i) => i === idx ? { ...r, rejectionQty: e.target.value } : r))} required /></td>
                                        <td style={{ padding: '5px 6px' }}>
                                            <select style={{ ...fieldStyle, minWidth: 120 }} value={row.reason} onChange={e => setItems(prev => prev.map((r, i) => i === idx ? { ...r, reason: e.target.value } : r))} required>
                                                <option value="">-- Select Reason --</option>
                                                {REASONS.map(r => <option key={r}>{r}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ padding: '5px 6px' }}><input style={{ ...fieldStyle, minWidth: 120 }} value={row.remarks} onChange={e => setItems(prev => prev.map((r, i) => i === idx ? { ...r, remarks: e.target.value } : r))} placeholder="Optional" /></td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>{items.length > 1 && <button type="button" onClick={() => removeRow(idx)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
                    ⛔ Saving will <strong>permanently remove the Rejection Qty from Raw Material stock</strong>. Reason is mandatory for each item.
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                    <button type="submit" disabled={saving} style={{ padding: '8px 24px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {saving ? 'Saving...' : '✓ Save Rejection Entry'}
                    </button>
                </div>
            </form>
        </div>
    );
}
