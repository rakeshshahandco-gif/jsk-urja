import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ChevronLeft, 
    Save, 
    Plus, 
    Trash2, 
    AlertOctagon, 
    ClipboardList,
    CheckCircle2,
    Info,
    Calendar,
    Settings,
    FileText
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { Button } from '../../components/ui';

const REASONS = ['Damage', 'Burn', 'Broken', 'Defective', 'Short Circuit', 'Expired', 'Assembly Fail', 'Other'];
const emptyRow = () => ({ itemId: '', itemCode: '', itemName: '', rejectionQty: 1, reason: '', remarks: '' });

export default function ProductionRejectionFormPage() {
    const navigate = useNavigate();
    const [allItems, setAllItems] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);
    const [fgItems, setFgItems] = useState([]);
    const [form, setForm] = useState({ 
        date: new Date().toISOString().slice(0, 10), 
        workOrderId: '', 
        workOrderNo: '', 
        remarks: '' 
    });
    const [rows, setRows] = useState([emptyRow()]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setSaving(true);
        // Load Models
        api.get('/items', { limit: 2000 }).then(res => {
            const list = res.data || [];
            setFgItems(list.filter(i => ['FINISHED_GOOD', 'TRADING', 'WIP'].includes(i.itemCategory) || i.isManufacturable));
        }).catch(err => toast.error("Failed to load items"));

        // Load Work Orders (WO- series)
        api.get('/work-orders', { limit: 500 }).then(res => {
            const list = res.data?.workOrders || [];
            setWorkOrders(list);
        }).catch(() => { });

        setSaving(false);
    }, []);

    const handleItemChange = (idx, itemId) => {
        const item = fgItems.find(i => i._id === itemId);
        setRows(prev => prev.map((r, i) => i === idx ? { 
            ...r, 
            itemId, 
            itemCode: item?.itemCode || '', 
            itemName: item?.itemName || '' 
        } : r));
    };

    const addRow = () => setRows(prev => [...prev, emptyRow()]);
    const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validRows = rows.filter(r => r.itemId && r.rejectionQty > 0);
        if (validRows.length === 0) return toast.error('Add at least one item to reject');
        
        setSaving(true);
        try {
            await api.post('/production-rejections', { ...form, items: validRows });
            toast.success('Rejection entry saved successfully!');
            navigate('/inventory/stock/ledger');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save entry');
        } finally { setSaving(false); }
    };

    const sectionCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' };
    const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 };
    const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none' };

    return (
        <div style={{ padding: '32px 24px', background: '#F6F8FC', minHeight: '100vh', fontFamily: "'Outfit', sans-serif" }}>
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                    <button onClick={() => navigate(-1)} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <ChevronLeft size={20} color="#64748b" />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Production Rejection</h2>
                        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>Record items that failed QC or was rejected during production</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Header Details */}
                    <div style={sectionCard}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <ClipboardList size={20} color="#2563eb" />
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Entry Specifics</h3>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                            <div>
                                <label style={labelStyle}>Rejection Date</label>
                                <input type="date" style={inputStyle} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
                            </div>
                            <div>
                                <label style={labelStyle}>Related Work Order (Optional)</label>
                                <SearchableSelect 
                                    options={[
                                        { value: '', label: 'None / Manual Entry' },
                                        ...workOrders.map(w => ({ 
                                            value: w._id, 
                                            label: `${w.woNumber} — ${w.finishedProductName || 'N/A'}` 
                                        }))
                                    ]}
                                    value={form.workOrderId}
                                    onChange={val => {
                                        const wo = workOrders.find(w => w._id === val);
                                        setForm(p => ({ 
                                            ...p, 
                                            workOrderId: val, 
                                            workOrderNo: wo?.woNumber || ''
                                        }));
                                    }}
                                    placeholder="Search work order..."
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Global Remarks</label>
                                <input style={inputStyle} value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Audit trail note..." />
                            </div>
                        </div>
                    </div>

                    {/* Rejection Table */}
                    <div style={{ ...sectionCard, borderTop: '4px solid #ef4444' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <AlertOctagon size={20} color="#ef4444" />
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Rejected Components</h3>
                            </div>
                            <button type="button" onClick={addRow} style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Plus size={16} /> Add Component
                            </button>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Raw Material Item</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'center', fontSize: 13, color: '#64748b', fontWeight: 600, width: 120 }}>Qty Rejected</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600, width: 180 }}>Mandatory Reason</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Item Remarks</th>
                                        <th style={{ width: 50 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px 6px' }}>
                                                <SearchableSelect 
                                                    options={allItems.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                                                    value={row.itemId}
                                                    onChange={val => handleItemChange(idx, val)}
                                                    placeholder="Search part..."
                                                />
                                            </td>
                                            <td style={{ padding: '10px 6px' }}>
                                                <input type="number" min="0.01" step="0.01" style={{ ...inputStyle, textAlign: 'center', borderColor: '#ef4444' }} value={row.rejectionQty} onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, rejectionQty: e.target.value } : r))} required />
                                            </td>
                                            <td style={{ padding: '10px 6px' }}>
                                                <select style={inputStyle} value={row.reason} onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, reason: e.target.value } : r))} required>
                                                    <option value="">Select Reason</option>
                                                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                            </td>
                                            <td style={{ padding: '10px 6px' }}>
                                                <input style={inputStyle} value={row.remarks} onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, remarks: e.target.value } : r))} placeholder="e.g. Scrapped on floor" />
                                            </td>
                                            <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                                {rows.length > 1 && (
                                                    <button type="button" onClick={() => removeRow(idx)} style={{ color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Final Warning */}
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '20px', display: 'flex', gap: 16, marginBottom: 24 }}>
                        <div style={{ background: '#fff', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fecaca' }}>
                            <AlertOctagon size={24} color="#ef4444" />
                        </div>
                        <div style={{ fontSize: 14, color: '#991b1b', lineHeight: 1.6 }}>
                            <strong>Critical Action:</strong> This entry is final. Saving will permanently decrease your inventory stock for the selected items under the 'Production Rejection' category in the stock ledger.
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginBottom: 40 }}>
                        <Button type="button" onClick={() => navigate(-1)} variant="outline" style={{ background: '#fff', height: 48, padding: '0 30px' }}>
                            Discard
                        </Button>
                        <Button type="submit" disabled={saving} style={{ height: 48, padding: '0 40px', background: '#ef4444', color: '#fff', display: 'flex', gap: 10 }}>
                            {saving ? 'Processing...' : <><Save size={20} /> Save Rejection Entry</>}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
