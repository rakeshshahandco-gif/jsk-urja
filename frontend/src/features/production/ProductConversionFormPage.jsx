import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ChevronLeft, 
    RefreshCcw, 
    ArrowRightLeft, 
    RotateCcw, 
    Plus, 
    Trash2, 
    Save, 
    Package, 
    CheckCircle2, 
    Info, 
    ArrowRight,
    Search
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { Button } from '../../components/ui';

const emptyComponent = () => ({ itemId: '', itemCode: '', itemName: '', qty: '' });

export default function ProductConversionFormPage() {
    const navigate = useNavigate();
    const [fgItems, setFgItems] = useState([]);
    const [rawItems, setRawItems] = useState([]);
    const [saving, setSaving] = useState(false);
    
    const [form, setForm] = useState({
        date: new Date().toISOString().slice(0, 10),
        fromItemId: '',
        toItemId: '',
        qty: 1,
        remarks: ''
    });

    const [returnedComponents, setReturnedComponents] = useState([emptyComponent()]);
    const [addedComponents, setAddedComponents] = useState([emptyComponent()]);

    useEffect(() => {
        setSaving(true);
        // Correct parameter passing for custom api.get helper
        api.get('/items', { limit: 2000 })
            .then(res => {
                // In your api.js, res is the literal JSON { success, data, meta }
                // and data is the array mentioned in item.controller.js
                const allItems = res.data || [];
                
                if (!Array.isArray(allItems)) {
                    console.error("Items is not an array:", allItems);
                    return;
                }

                // Be very broad for models
                const modelList = allItems.filter(i => 
                    ['FINISHED_GOOD', 'TRADING', 'WIP'].includes(i.itemCategory) || 
                    i.isManufacturable === true
                );
                
                if (modelList.length === 0) {
                    setFgItems(allItems.filter(i => i.itemCategory !== 'RAW_MATERIAL'));
                } else {
                    setFgItems(modelList);
                }

                setRawItems(allItems.filter(i => 
                    ['RAW_MATERIAL', 'CONSUMABLE', 'WIP'].includes(i.itemCategory)
                ));
            })
            .catch(err => {
                console.error("Conversion fetch error:", err);
                toast.error("Failed to load inventory items");
            })
            .finally(() => setSaving(false));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.fromItemId === form.toItemId) return toast.error("Source and target models cannot be the same");
        
        setSaving(true);
        try {
            const payload = {
                ...form,
                returnedComponents: returnedComponents.filter(c => c.itemId && c.qty > 0),
                addedComponents: addedComponents.filter(c => c.itemId && c.qty > 0)
            };
            await api.post('/model-conversions', payload);
            toast.success('Model Conversion saved and stock updated!');
            navigate('/inventory/stock/ledger');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save conversion');
        } finally {
            setSaving(false);
        }
    };

    const addReturnedRow = () => setReturnedComponents([...returnedComponents, emptyComponent()]);
    const removeReturnedRow = (idx) => setReturnedComponents(returnedComponents.filter((_, i) => i !== idx));
    
    const addAddedRow = () => setAddedComponents([...addedComponents, emptyComponent()]);
    const removeAddedRow = (idx) => setAddedComponents(addedComponents.filter((_, i) => i !== idx));

    const handleCompChange = (list, setList, idx, itemId, type) => {
        const item = rawItems.find(i => i._id === itemId);
        setList(list.map((c, i) => i === idx ? { ...c, itemId, itemCode: item?.itemCode || '', itemName: item?.itemName || '' } : c));
    };

    const sectionCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' };
    const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 };
    const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none' };

    return (
        <div style={{ padding: '32px 24px', background: '#F6F8FC', minHeight: '100vh', fontFamily: "'Outfit', sans-serif" }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button onClick={() => navigate(-1)} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.borderColor='#2563EB'} onMouseOut={e=>e.currentTarget.style.borderColor='#e2e8f0'}>
                            <ChevronLeft size={20} color="#64748b" />
                        </button>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Model Conversion / Rework</h2>
                            <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>Convert existing models and recover component stock</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    
                    {/* Main Conversion Config */}
                    <div style={sectionCard}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                            <RefreshCcw size={20} color="#2563eb" />
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Conversion Configuration</h3>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr 140px 180px', gap: 20, alignItems: 'flex-end' }}>
                            <div>
                                <label style={labelStyle}>Source Model (From)</label>
                                <SearchableSelect 
                                    options={fgItems.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                                    value={form.fromItemId}
                                    onChange={val => setForm(p => ({ ...p, fromItemId: val }))}
                                    placeholder="Select old model"
                                    required
                                />
                            </div>
                            <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ArrowRight size={20} color="#94a3b8" />
                            </div>
                            <div>
                                <label style={labelStyle}>Target Model (To)</label>
                                <SearchableSelect 
                                    options={fgItems.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                                    value={form.toItemId}
                                    onChange={val => setForm(p => ({ ...p, toItemId: val }))}
                                    placeholder="Select new model"
                                    required
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Quantity</label>
                                <input type="number" min="1" step="1" style={inputStyle} value={form.qty} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} required />
                            </div>
                            <div>
                                <label style={labelStyle}>Conversion Date</label>
                                <input type="date" style={inputStyle} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                        
                        {/* Table A: Component Returns */}
                        <div style={{ ...sectionCard, borderLeft: '4px solid #10b981' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <RotateCcw size={18} color="#10b981" />
                                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Parts Recovered (Return to RM)</h3>
                                </div>
                                <button type="button" onClick={addReturnedRow} style={{ color: '#10b981', background: '#ecfdf5', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Plus size={14} /> Add Part
                                </button>
                            </div>
                            
                            {returnedComponents.map((c, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 40px', gap: 12, marginBottom: 12 }}>
                                    <SearchableSelect 
                                        options={rawItems.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                                        value={c.itemId}
                                        onChange={val => handleCompChange(returnedComponents, setReturnedComponents, idx, val)}
                                        placeholder="Search component..."
                                    />
                                    <input type="number" placeholder="Qty" style={inputStyle} value={c.qty} onChange={e => setReturnedComponents(returnedComponents.map((rc, i) => i === idx ? { ...rc, qty: e.target.value } : rc))} />
                                    <button type="button" onClick={() => removeReturnedRow(idx)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={18} /></button>
                                </div>
                            ))}
                            {returnedComponents.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No parts being returned</p>}
                        </div>

                        {/* Table B: Additional Usage */}
                        <div style={{ ...sectionCard, borderLeft: '4px solid #ef4444' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Package size={18} color="#ef4444" />
                                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Additional Parts Used (Consume)</h3>
                                </div>
                                <button type="button" onClick={addAddedRow} style={{ color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Plus size={14} /> Add Part
                                </button>
                            </div>

                            {addedComponents.map((c, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 40px', gap: 12, marginBottom: 12 }}>
                                    <SearchableSelect 
                                        options={rawItems.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                                        value={c.itemId}
                                        onChange={val => handleCompChange(addedComponents, setAddedComponents, idx, val)}
                                        placeholder="Search component..."
                                    />
                                    <input type="number" placeholder="Qty" style={inputStyle} value={c.qty} onChange={e => setAddedComponents(addedComponents.map((ac, i) => i === idx ? { ...ac, qty: e.target.value } : ac))} />
                                    <button type="button" onClick={() => removeAddedRow(idx)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={18} /></button>
                                </div>
                            ))}
                            {addedComponents.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No additional parts being used</p>}
                        </div>

                    </div>

                    {/* Remarks & Submit */}
                    <div style={sectionCard}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: 24, alignItems: 'flex-end' }}>
                            <div>
                                <label style={labelStyle}>Conversion Remarks</label>
                                <input style={inputStyle} placeholder="e.g. Upgrading Model A to Model B for Order #123" value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} />
                            </div>
                            <Button type="submit" disabled={saving} style={{ height: 48, width: '100%', display: 'flex', gap: 10 }}>
                                {saving ? 'Processing...' : <><Save size={20} /> Complete Conversion</>}
                            </Button>
                        </div>
                    </div>

                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 16, padding: 20, display: 'flex', gap: 16 }}>
                        <div style={{ background: '#fff', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #bfdbfe' }}>
                            <Info size={24} color="#2563eb" />
                        </div>
                        <div style={{ fontSize: 14, color: '#1e40af', lineHeight: 1.6 }}>
                            <strong>Inventory Automation Active:</strong> Upon saving, the system will automatically handle 4 stock ledger entries in your transaction history, ensuring full audit traceability for both finished goods and components.
                        </div>
                    </div>
                </form>

            </div>
        </div>
    );
}
