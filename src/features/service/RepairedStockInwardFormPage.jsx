import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { createRepairedStockInward } from '@/services/serviceApi';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    row: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }),
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 12 },
};

const Field = ({ label, children }) => <div><label style={f.label}>{label}</label>{children}</div>;

const RepairedStockInwardFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { addToast } = useToast();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        jobCardId: searchParams.get('jobCardId') || '',
        jobCardNo: searchParams.get('jobCardNo') || '',
        complaintId: searchParams.get('complaintId') || '',
        complaintNo: searchParams.get('complaintNo') || '',
        items: [{ itemCode: '', itemName: '', uom: 'NOS', qtyRepaired: 1, qtyPassedQC: 1, warehouse: '' }],
        notes: '',
        addedBy: user?.name || '',
    });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items }; });
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { itemCode: '', itemName: '', uom: 'NOS', qtyRepaired: 1, qtyPassedQC: 1, warehouse: '' }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    const handleSave = async () => {
        if (!form.jobCardId) { addToast('Job Card ID required', 'error'); return; }
        setSaving(true);
        try {
            await createRepairedStockInward(form);
            addToast('Repaired stock added back to inventory!', 'success');
            navigate(-1);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save', 'error');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => navigate(-1)} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={15} /></button>
                    <CheckCircle size={15} color="#059669" />
                    <span style={{ fontSize: 14, fontWeight: 800 }}>Repaired Stock Inward</span>
                </div>
                <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#6ee7b7' : '#059669', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Save size={13} />{saving ? 'Adding to stock…' : 'Save & Add to Inventory'}
                </button>
            </div>

            <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#065f46', fontWeight: 600 }}>
                ✅ Saving this will increase saleable inventory for the repaired items.
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={f.sectionTitle}>Inward Details</div>
                <div style={f.row(4)}>
                    <Field label="Date"><input type="date" style={f.input} value={form.date} onChange={e => set('date', e.target.value)} /></Field>
                    <Field label="Job Card No."><input style={{ ...f.input, fontFamily: 'monospace', color: '#7c3aed', fontWeight: 700 }} value={form.jobCardNo} onChange={e => set('jobCardNo', e.target.value)} /></Field>
                    <Field label="Complaint No."><input style={{ ...f.input, fontFamily: 'monospace', color: '#dc2626' }} value={form.complaintNo} onChange={e => set('complaintNo', e.target.value)} /></Field>
                    <Field label="Added By"><input style={f.input} value={form.addedBy} onChange={e => set('addedBy', e.target.value)} /></Field>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={f.sectionTitle}>Repaired Items</div>
                    <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={12} /> Add Row</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr style={{ background: '#f0fdf4' }}>
                        {['Item Code', 'Item Name *', 'UOM', 'Qty Repaired *', 'QC Passed Qty', 'Warehouse', ''].map(h =>
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#065f46', fontSize: 10 }}>{h}</th>
                        )}
                    </tr></thead>
                    <tbody>
                        {form.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 90, fontFamily: 'monospace' }} value={item.itemCode} onChange={e => setItem(i, 'itemCode', e.target.value)} /></td>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 200 }} value={item.itemName} onChange={e => setItem(i, 'itemName', e.target.value)} placeholder="Item name" /></td>
                                <td style={{ padding: '4px 6px' }}><select style={{ ...f.input, width: 70 }} value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)}>{['NOS', 'PCS', 'SET'].map(u => <option key={u}>{u}</option>)}</select></td>
                                <td style={{ padding: '4px 6px' }}><input type="number" style={{ ...f.input, width: 80, color: '#059669', fontWeight: 700, border: '1px solid #86efac' }} value={item.qtyRepaired} onChange={e => setItem(i, 'qtyRepaired', Number(e.target.value))} min={0} /></td>
                                <td style={{ padding: '4px 6px' }}><input type="number" style={{ ...f.input, width: 80 }} value={item.qtyPassedQC} onChange={e => setItem(i, 'qtyPassedQC', Number(e.target.value))} min={0} /></td>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 120 }} value={item.warehouse} onChange={e => setItem(i, 'warehouse', e.target.value)} placeholder="Shelf / Location" /></td>
                                <td style={{ padding: '4px 6px' }}>{form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ width: 26, height: 26, background: '#fee2e2', border: 'none', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} color="#dc2626" /></button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <label style={f.label}>Notes</label>
                <textarea style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
        </div>
    );
};

export default RepairedStockInwardFormPage;
