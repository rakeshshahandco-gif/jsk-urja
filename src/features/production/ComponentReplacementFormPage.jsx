import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ChevronLeft, 
    Save, 
    Plus, 
    Trash2, 
    Package, 
    ClipboardList,
    AlertTriangle,
    CheckCircle2,
    Info,
    User,
    Calendar,
    Search
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { Button } from '../../components/ui';

const emptyComponent = () => ({ itemId: '', itemCode: '', itemName: '', damagedQty: 1, replacementQty: 1, reason: '' });

export default function ComponentReplacementFormPage() {
    const navigate = useNavigate();
    const [allItems, setAllItems] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);
    const [fgItems, setFgItems] = useState([]);
    const [form, setForm] = useState({ 
        date: new Date().toISOString().slice(0, 10), 
        referenceType: 'Work Order Based',
        workOrderId: '', 
        workOrderNo: '', 
        finishedItemId: '', 
        finishedItemName: '', 
        qtyUnderTesting: 1, 
        testedBy: '', 
        remarks: '',
        customerName: '',
        salesInvoiceNo: '',
        dispatchRef: '',
        serviceRefNo: '',
        complaintRef: '',
        warrantyDetails: '',
        failureDate: ''
    });
    const [components, setComponents] = useState([emptyComponent()]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setSaving(true);
        // Load Raw Materials and Models
        api.get('/items', { limit: 2000 }).then(res => {
            const list = res.data || [];
            setAllItems(list.filter(i => i.itemCategory === 'RAW_MATERIAL'));
            setFgItems(list.filter(i => ['FINISHED_GOOD', 'TRADING', 'WIP'].includes(i.itemCategory) || i.isManufacturable));
        }).catch(err => toast.error("Failed to load items"));

        // Load Work Orders (WO- series)
        api.get('/work-orders', { limit: 500 }).then(res => {
            const list = res.data?.workOrders || [];
            setWorkOrders(list);
        }).catch(() => { });

        setSaving(false);
    }, []);

    const handleCompItemChange = (idx, itemId) => {
        const item = allItems.find(i => i._id === itemId);
        setComponents(prev => prev.map((c, i) => i === idx ? { 
            ...c, 
            itemId, 
            itemCode: item?.itemCode || '', 
            itemName: item?.itemName || '' 
        } : c));
    };

    const addRow = () => setComponents(prev => [...prev, emptyComponent()]);
    const removeRow = (idx) => setComponents(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation logic
        if (form.referenceType === 'Work Order Based' && !form.workOrderId) {
            return toast.error('Please select a Related Work Order');
        }

        const validComps = components.filter(c => c.itemId && c.replacementQty > 0);
        if (validComps.length === 0) return toast.error('Add at least one component to replace');
        
        setSaving(true);
        try {
            await api.post('/component-replacements', { ...form, components: validComps });
            toast.success('Component Replacement saved successfully!');
            navigate('/inventory/stock/ledger');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save entry');
        } finally { setSaving(false); }
    };

    const sectionCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' };
    const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 };
    const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', transition: 'all 0.2s' };

    const typeOptions = [
        { id: 'Work Order Based', icon: <ClipboardList size={18} />, desc: 'Production-linked replacement' },
        { id: 'Independent Replacement', icon: <Package size={18} />, desc: 'Post-production adjustment' },
        { id: 'Service / Warranty Replacement', icon: <AlertTriangle size={18} />, desc: 'Market return / fault' }
    ];

    return (
        <div style={{ padding: '32px 24px', background: '#F6F8FC', minHeight: '100vh', fontFamily: "'Outfit', sans-serif" }}>
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                    <button onClick={() => navigate(-1)} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <ChevronLeft size={20} color="#64748b" />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Component Replacement</h2>
                        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>Track and deduct components replaced during or after production</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    
                    {/* 1. Reference Type Selector */}
                    <div style={sectionCard}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <Info size={20} color="#2563eb" />
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Select Replacement Type</h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            {typeOptions.map(opt => (
                                <div 
                                    key={opt.id}
                                    onClick={() => setForm(p => ({ ...p, referenceType: opt.id }))}
                                    style={{
                                        padding: '16px',
                                        borderRadius: 12,
                                        border: `2px solid ${form.referenceType === opt.id ? '#2563eb' : '#e2e8f0'}`,
                                        background: form.referenceType === opt.id ? '#eff6ff' : '#fff',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: form.referenceType === opt.id ? '#2563eb' : '#64748b' }}>
                                        {opt.icon}
                                        <span style={{ fontWeight: 700, fontSize: 14 }}>{opt.id}</span>
                                    </div>
                                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{opt.desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. Core Header Details */}
                    <div style={sectionCard}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <ClipboardList size={20} color="#2563eb" />
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Reference Details</h3>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                            <div>
                                <label style={labelStyle}>Entry Date</label>
                                <input type="date" style={inputStyle} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
                            </div>

                            {form.referenceType === 'Work Order Based' ? (
                                <div>
                                    <label style={labelStyle}>Related Work Order</label>
                                    <SearchableSelect 
                                        options={workOrders.map(w => ({ 
                                            value: w._id, 
                                            label: `${w.woNumber} — ${w.finishedProductName || 'N/A'}` 
                                        }))}
                                        value={form.workOrderId}
                                        onChange={val => {
                                            const wo = workOrders.find(w => w._id === val);
                                            setForm(p => ({ 
                                                ...p, 
                                                workOrderId: val, 
                                                workOrderNo: wo?.woNumber || '',
                                                finishedItemId: wo?.finishedProductId?._id || '',
                                                finishedItemName: wo?.finishedProductName || ''
                                            }));
                                        }}
                                        placeholder="Search WO..."
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label style={labelStyle}>Finished Item / Model</label>
                                    <SearchableSelect 
                                        options={fgItems.map(i => ({ 
                                            value: i._id, 
                                            label: `${i.itemCode} — ${i.itemName}` 
                                        }))}
                                        value={form.finishedItemId}
                                        onChange={val => {
                                            const item = fgItems.find(i => i._id === val);
                                            setForm(p => ({ 
                                                ...p, 
                                                workOrderId: '', 
                                                workOrderNo: '',
                                                finishedItemId: val, 
                                                finishedItemName: item?.itemName || '' 
                                            }));
                                        }}
                                        placeholder="Select model..."
                                    />
                                </div>
                            )}

                            <div>
                                <label style={labelStyle}>Qty Under Testing</label>
                                <input type="number" style={inputStyle} value={form.qtyUnderTesting} onChange={e => setForm(p => ({ ...p, qtyUnderTesting: e.target.value }))} placeholder="e.g. 1" />
                            </div>
                        </div>

                        {/* Extra Fields for Independent/Service Modes */}
                        {form.referenceType !== 'Work Order Based' && (
                            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px dashed #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                                <div>
                                    <label style={labelStyle}>Customer Name (Optional)</label>
                                    <input style={inputStyle} value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} placeholder="Enter name..." />
                                </div>
                                <div>
                                    <label style={labelStyle}>Sales Invoice / Dispatch Ref</label>
                                    <input style={inputStyle} value={form.salesInvoiceNo} onChange={e => setForm(p => ({ ...p, salesInvoiceNo: e.target.value }))} placeholder="e.g. INV-..." />
                                </div>
                                {form.referenceType === 'Service / Warranty Replacement' && (
                                    <>
                                        <div>
                                            <label style={labelStyle}>Service / Complaint Ref</label>
                                            <input style={inputStyle} value={form.serviceRefNo} onChange={e => setForm(p => ({ ...p, serviceRefNo: e.target.value }))} placeholder="Complaint Ref..." />
                                        </div>
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={labelStyle}>Warranty / Failure Details</label>
                                            <input style={inputStyle} value={form.warrantyDetails} onChange={e => setForm(p => ({ ...p, warrantyDetails: e.target.value }))} placeholder="Explain what happened..." />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        
                        <div style={{ marginTop: 24 }}>
                            <label style={labelStyle}>Global Remarks</label>
                            <input style={inputStyle} value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Additional notes for traceability..." />
                        </div>
                    </div>

                    {/* 3. Replacement Table */}
                    <div style={sectionCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Package size={20} color="#2563eb" />
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Components to Issue</h3>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={addRow} className="btn-primary-soft">
                                <Plus size={16} /> Add Row
                            </Button>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ textAlign: 'left', padding: '12px 0', fontSize: 12, color: '#64748b', textTransform: 'uppercase', width: '40%' }}>Raw Material Component</th>
                                        <th style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Replacement Qty</th>
                                        <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Defect Reason</th>
                                        <th style={{ width: 44 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {components.map((c, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 0' }}>
                                                <SearchableSelect 
                                                    options={allItems.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                                                    value={c.itemId}
                                                    onChange={val => handleCompItemChange(idx, val)}
                                                    placeholder="Search component..."
                                                />
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                <input type="number" style={{ ...inputStyle, textAlign: 'center', width: 80, margin: '0 auto' }} value={c.replacementQty} onChange={e => setComponents(prev => prev.map((it, i) => i === idx ? { ...it, replacementQty: e.target.value } : it))} />
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <input style={inputStyle} value={c.reason} onChange={e => setComponents(prev => prev.map((it, i) => i === idx ? { ...it, reason: e.target.value } : it))} placeholder="e.g. Burn, Short circuit" />
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {components.length > 1 && (
                                                    <button type="button" onClick={() => removeRow(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 8 }}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {/* Submit Bar */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 16 }}>
                        <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={saving}>Cancel</Button>
                        <Button type="submit" disabled={saving} style={{ background: '#2563eb', color: '#fff', borderRadius: 10, padding: '0 24px', height: 48 }}>
                            {saving ? 'Processing...' : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Save size={18} /> Save Replacement Entry
                                </div>
                            )}
                        </Button>
                    </div>
                </form>

                <div style={{ marginTop: 24, padding: 20, borderRadius: 12, background: '#fffbeb', border: '1px solid #fcd34d', display: 'flex', gap: 16 }}>
                    <AlertTriangle size={20} color="#d97706" />
                    <div>
                        <p style={{ margin: 0, fontSize: 13, color: '#92400e', fontWeight: 600 }}>Inventory Warning</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#b45309' }}>Saving this entry will automatically create consumption entries in your stock ledger for the replacement quantities. This will immediately reduce your Raw Material stock levels.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
