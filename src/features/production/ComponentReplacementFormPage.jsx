import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import toast from 'react-hot-toast';

const emptyComponent = () => ({ itemId: '', itemCode: '', itemName: '', damagedQty: '', replacementQty: '', reason: '' });

export default function ComponentReplacementFormPage() {
    const navigate = useNavigate();
    const [allItems, setAllItems] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);
    const [fgItems, setFgItems] = useState([]);
    const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), workOrderId: '', workOrderNo: '', finishedItemId: '', finishedItemName: '', qtyUnderTesting: '', testedBy: '', remarks: '' });
    const [components, setComponents] = useState([emptyComponent()]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/items', { params: { limit: 500 } }).then(res => {
            const items = res.data?.data?.items || res.data?.data || [];
            setAllItems(items.filter(i => i.itemCategory === 'RAW_MATERIAL'));
            setFgItems(items.filter(i => ['FINISHED_GOOD', 'TRADING'].includes(i.itemCategory)));
        });
        api.get('/production-sheets', { params: { limit: 100 } })
            .then(res => setWorkOrders(res.data?.data?.sheets || res.data?.data || [])).catch(() => { });
    }, []);

    const handleCompItemChange = (idx, itemId) => {
        const item = allItems.find(i => i._id === itemId);
        setComponents(prev => prev.map((c, i) => i === idx ? { ...c, itemId, itemCode: item?.itemCode || '', itemName: item?.itemName || '' } : c));
    };

    const addRow = () => setComponents(prev => [...prev, emptyComponent()]);
    const removeRow = (idx) => setComponents(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validComps = components.filter(c => c.itemId && c.replacementQty);
        if (validComps.length === 0) return toast.error('Add at least one component with replacement qty');
        setSaving(true);
        try {
            await api.post('/component-replacements', { ...form, components: validComps });
            toast.success('Component Replacement entry saved!');
            navigate('/production/component-replacements');
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
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Component Replacement Entry</h2>
            </div>

            <form onSubmit={handleSubmit}>
                {/* Header */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#475569' }}>Entry Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                        <div><label style={labelStyle}>Date *</label><input type="date" style={fieldStyle} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required /></div>
                        <div><label style={labelStyle}>Work Order</label>
                            <select style={fieldStyle} value={form.workOrderId} onChange={e => {
                                const wo = workOrders.find(w => w._id === e.target.value);
                                setForm(p => ({ ...p, workOrderId: e.target.value, workOrderNo: wo ? (wo.sheetNo || '') : '' }));
                            }}>
                                <option value="">-- Select --</option>
                                {workOrders.map(w => <option key={w._id} value={w._id}>{w.sheetNo || w.workOrderNo}</option>)}
                            </select>
                        </div>
                        <div><label style={labelStyle}>Finished Item (Under Testing)</label>
                            <select style={fieldStyle} value={form.finishedItemId} onChange={e => {
                                const item = fgItems.find(i => i._id === e.target.value);
                                setForm(p => ({ ...p, finishedItemId: e.target.value, finishedItemName: item?.itemName || '' }));
                            }}>
                                <option value="">-- Select --</option>
                                {fgItems.map(i => <option key={i._id} value={i._id}>{i.itemCode} — {i.itemName}</option>)}
                            </select>
                        </div>
                        <div><label style={labelStyle}>Qty Under Testing</label><input type="number" min="0" style={fieldStyle} value={form.qtyUnderTesting} onChange={e => setForm(p => ({ ...p, qtyUnderTesting: e.target.value }))} /></div>
                        <div><label style={labelStyle}>Tested By</label><input style={fieldStyle} value={form.testedBy} onChange={e => setForm(p => ({ ...p, testedBy: e.target.value }))} placeholder="Technician name" /></div>
                        <div><label style={labelStyle}>Remarks</label><input style={fieldStyle} value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} /></div>
                    </div>
                </div>

                {/* Components Table */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#475569' }}>Component Replacement Details</h3>
                        <button type="button" onClick={addRow} style={{ padding: '5px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Add Row</button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr style={{ background: '#fef3c7' }}>
                                {['Component (Raw Material)', 'Damaged Qty', 'Replacement Qty *', 'Reason', ''].map(h => (
                                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#92400e', fontWeight: 600, borderBottom: '1px solid #fde68a' }}>{h}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {components.map((comp, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '5px 6px' }}>
                                            <select style={{ ...fieldStyle, minWidth: 200 }} value={comp.itemId} onChange={e => handleCompItemChange(idx, e.target.value)} required>
                                                <option value="">-- Select Component --</option>
                                                {allItems.map(i => <option key={i._id} value={i._id}>{i.itemCode} — {i.itemName}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ padding: '5px 6px' }}><input type="number" min="0" style={{ ...fieldStyle, width: 80 }} value={comp.damagedQty} onChange={e => setComponents(prev => prev.map((c, i) => i === idx ? { ...c, damagedQty: e.target.value } : c))} /></td>
                                        <td style={{ padding: '5px 6px' }}><input type="number" min="0.01" step="0.01" style={{ ...fieldStyle, width: 80 }} value={comp.replacementQty} onChange={e => setComponents(prev => prev.map((c, i) => i === idx ? { ...c, replacementQty: e.target.value } : c))} required /></td>
                                        <td style={{ padding: '5px 6px' }}><input style={{ ...fieldStyle, minWidth: 120 }} value={comp.reason} onChange={e => setComponents(prev => prev.map((c, i) => i === idx ? { ...c, reason: e.target.value } : c))} placeholder="e.g. Burn, Short circuit" /></td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>{components.length > 1 && <button type="button" onClick={() => removeRow(idx)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ background: '#fff7ed', border: '1px solid #f97316', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c2410c', marginBottom: 16 }}>
                    ⚠️ Saving this entry will <strong>reduce Raw Material stock</strong> for each component by its Replacement Qty.
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => navigate(-1)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                    <button type="submit" disabled={saving} style={{ padding: '8px 24px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {saving ? 'Saving...' : '✓ Save Component Replacement'}
                    </button>
                </div>
            </form>
        </div>
    );
}
