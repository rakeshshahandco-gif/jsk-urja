import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Save, Package, ClipboardList, Warehouse, Info, CheckCircle, X } from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { Button } from '../../components/ui';

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
        setForm(p => ({ 
            ...p, 
            workOrderId: woId, 
            workOrderNo: wo ? (wo.sheetNo || wo.workOrderNo || '') : '',
            // Auto-fill finished item if available in Work Order
            finishedItemId: wo?.finishedProductId || wo?.productId || p.finishedItemId 
        }));
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

    const cardStyle = { 
        background: '#fff', 
        border: '1px solid #e2e8f0', 
        borderRadius: 16, 
        padding: 32, 
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        maxWidth: 800,
        margin: '0 auto'
    };
    const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 };
    const gridCell = { display: 'flex', flexDirection: 'column' };
    const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', transition: 'border-color 0.2s' };

    return (
        <div style={{ padding: '32px 24px', background: '#F6F8FC', minHeight: '100vh', fontFamily: "'Outfit', sans-serif" }}>
            <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button 
                        onClick={() => navigate(-1)} 
                        style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', transition: 'all 0.2s' }}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#2563EB'}
                        onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Production Output</h2>
                        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Record new finished goods production</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
                    <div style={gridCell}>
                        <label style={labelStyle}>Entry Date <span style={{ color: '#ef4444' }}>*</span></label>
                        <input 
                            type="date" 
                            style={inputStyle} 
                            value={form.date} 
                            onChange={e => setForm(p => ({ ...p, date: e.target.value }))} 
                            required 
                        />
                    </div>

                    <div style={gridCell}>
                        <label style={labelStyle}>Work Order (Optional)</label>
                        <SearchableSelect
                            options={workOrders.map(w => ({ value: w._id, label: `${w.sheetNo || w.workOrderNo} — ${w.productName || w.itemName}` }))}
                            value={form.workOrderId}
                            onChange={handleWOChange}
                            placeholder="Search Work Order..."
                            icon={<ClipboardList size={16} />}
                        />
                    </div>

                    <div style={{ ...gridCell, gridColumn: 'span 2' }}>
                        <label style={labelStyle}>Finished Item <span style={{ color: '#ef4444' }}>*</span></label>
                        <SearchableSelect
                            options={items.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                            value={form.finishedItemId}
                            onChange={val => setForm(p => ({ ...p, finishedItemId: val }))}
                            placeholder="Select Finished Product"
                            icon={<Package size={16} />}
                            required
                        />
                    </div>

                    <div style={gridCell}>
                        <label style={labelStyle}>Quantity Produced <span style={{ color: '#ef4444' }}>*</span></label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                type="number" 
                                min="0.01" 
                                step="0.01" 
                                style={{ ...inputStyle, paddingRight: 45 }} 
                                value={form.qtyProduced} 
                                onChange={e => setForm(p => ({ ...p, qtyProduced: e.target.value }))} 
                                required 
                                placeholder="0.00"
                            />
                            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>PCS</span>
                        </div>
                    </div>

                    <div style={gridCell}>
                        <label style={labelStyle}>Warehouse / Location</label>
                        <div style={{ position: 'relative' }}>
                            <Warehouse size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input 
                                style={{ ...inputStyle, paddingLeft: 40 }} 
                                value={form.warehouse} 
                                onChange={e => setForm(p => ({ ...p, warehouse: e.target.value }))} 
                                placeholder="e.g. Main Store" 
                            />
                        </div>
                    </div>

                    <div style={{ ...gridCell, gridColumn: 'span 2' }}>
                        <label style={labelStyle}>Remarks</label>
                        <textarea 
                            rows={3} 
                            style={{ ...inputStyle, resize: 'none' }} 
                            value={form.remarks} 
                            onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} 
                            placeholder="Add any internal notes here..." 
                        />
                    </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 16, display: 'flex', gap: 12, marginBottom: 32 }}>
                    <Info size={20} style={{ color: '#2563eb', flexShrink: 0 }} />
                    <div style={{ fontSize: 13, color: '#1e40af', lineHeight: '1.5' }}>
                        Recording this output will automatically <strong>increase Finished Goods stock</strong> and update inventory balances.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
                    <button 
                        type="button" 
                        onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} 
                        style={{ padding: '10px 24px', background: 'transparent', color: '#64748b', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                    >
                        Cancel
                    </button>
                    <Button 
                        type="submit" 
                        disabled={saving} 
                        style={{ padding: '10px 32px', display: 'flex', alignItems: 'center', gap: 8, height: 44 }}
                    >
                        {saving ? 'Saving...' : <><CheckCircle size={18} /> Save Output</>}
                    </Button>
                </div>
            </form>
        </div>
    );
}
