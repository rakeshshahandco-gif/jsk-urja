import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import toast from 'react-hot-toast';

export default function ProductionOutputFormPage() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);
    const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), workOrderId: '', workOrderNo: '', finishedItemId: '', qtyProduced: '', warehouse: '', remarks: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/items', { params: { limit: 500 } })
            .then(res => setItems((res.data?.data?.items || res.data?.data || []).filter(i => ['FINISHED_GOOD', 'TRADING'].includes(i.itemCategory))));
        api.get('/production-sheets', { params: { limit: 100 } })
            .then(res => setWorkOrders(res.data?.data?.sheets || res.data?.data || [])).catch(() => { });
    }, []);

    const handleWOChange = (woId) => {
        const wo = workOrders.find(w => w._id === woId);
        setForm(p => ({ ...p, workOrderId: woId, workOrderNo: wo ? (wo.sheetNo || wo.workOrderNo || '') : '' }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.finishedItemId || !form.qtyProduced) return toast.error('Item and quantity are required');
        setSaving(true);
        try {
            await api.post('/production-outputs', form);
            toast.success('Production Output recorded successfully!');
            navigate('/production/outputs');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally { setSaving(false); }
    };

    const fieldStyle = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, background: '#fff' };
    const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 };
    const gridCell = { display: 'flex', flexDirection: 'column' };

    return (
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', maxWidth: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Back</button>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Production Output Entry</h2>
            </div>

            <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div style={gridCell}>
                        <label style={labelStyle}>Date *</label>
                        <input type="date" style={fieldStyle} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
                    </div>
                    <div style={gridCell}>
                        <label style={labelStyle}>Work Order (Optional)</label>
                        <select style={fieldStyle} value={form.workOrderId} onChange={e => handleWOChange(e.target.value)}>
                            <option value="">-- Select Work Order --</option>
                            {workOrders.map(w => <option key={w._id} value={w._id}>{w.sheetNo || w.workOrderNo} — {w.productName || w.itemName}</option>)}
                        </select>
                    </div>
                    <div style={{ ...gridCell, gridColumn: 'span 2' }}>
                        <label style={labelStyle}>Finished Item *</label>
                        <select style={fieldStyle} value={form.finishedItemId} onChange={e => setForm(p => ({ ...p, finishedItemId: e.target.value }))} required>
                            <option value="">-- Select Finished Item --</option>
                            {items.map(i => <option key={i._id} value={i._id}>{i.itemCode} — {i.itemName}</option>)}
                        </select>
                    </div>
                    <div style={gridCell}>
                        <label style={labelStyle}>Qty Produced *</label>
                        <input type="number" min="0.01" step="0.01" style={fieldStyle} value={form.qtyProduced} onChange={e => setForm(p => ({ ...p, qtyProduced: e.target.value }))} required placeholder="Enter quantity" />
                    </div>
                    <div style={gridCell}>
                        <label style={labelStyle}>Warehouse / Location</label>
                        <input style={fieldStyle} value={form.warehouse} onChange={e => setForm(p => ({ ...p, warehouse: e.target.value }))} placeholder="e.g. Main Store" />
                    </div>
                    <div style={{ ...gridCell, gridColumn: 'span 2' }}>
                        <label style={labelStyle}>Remarks</label>
                        <textarea rows={2} style={{ ...fieldStyle, resize: 'vertical' }} value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional notes..." />
                    </div>
                </div>

                <div style={{ background: '#dcfce7', border: '1px solid #16a34a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534', marginBottom: 16 }}>
                    📦 Saving this entry will <strong>increase Finished Goods stock</strong> by the quantity entered.
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => navigate(-1)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                    <button type="submit" disabled={saving} style={{ padding: '8px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {saving ? 'Saving...' : '✓ Save Production Output'}
                    </button>
                </div>
            </form>
        </div>
    );
}
