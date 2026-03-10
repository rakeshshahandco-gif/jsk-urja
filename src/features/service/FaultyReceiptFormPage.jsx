import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, Package, Plus, Trash2 } from 'lucide-react';
import { createFaultyReceipt } from '@/services/serviceApi';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    sel: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    row: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }),
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 12 },
};

const Field = ({ label, children }) => <div><label style={f.label}>{label}</label>{children}</div>;

const FaultyReceiptFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { addToast } = useToast();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        complaintId: searchParams.get('complaintId') || '',
        complaintNo: searchParams.get('complaintNo') || '',
        customerName: searchParams.get('customer') || '',
        doNo: '',
        items: [{ itemCode: '', itemName: '', uom: 'NOS', qtyExpected: 0, qtyReceived: 1, physicalCondition: 'Good Packing', remarks: '' }],
        overallRemarks: '',
        receivedBy: user?.name || '',
        status: 'Complete',
    });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items }; });
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { itemCode: '', itemName: '', uom: 'NOS', qtyExpected: 0, qtyReceived: 1, physicalCondition: 'Good Packing', remarks: '' }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    const handleSave = async () => {
        if (!form.complaintId) { addToast('Complaint ID required', 'error'); return; }
        if (!form.customerName.trim()) { addToast('Customer name required', 'error'); return; }
        setSaving(true);
        try {
            await createFaultyReceipt(form);
            addToast('Faulty Receipt recorded!', 'success');
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
                    <Package size={15} color="#d97706" />
                    <span style={{ fontSize: 14, fontWeight: 800 }}>Faulty Material Receipt</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => navigate(-1)} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#fcd34d' : '#d97706', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Save size={13} />{saving ? 'Saving…' : 'Save Receipt'}
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={f.sectionTitle}>Receipt Details</div>
                <div style={f.row(4)}>
                    <Field label="Date"><input type="date" style={f.input} value={form.date} onChange={e => set('date', e.target.value)} /></Field>
                    <Field label="Complaint No."><input style={{ ...f.input, fontFamily: 'monospace', color: '#dc2626', fontWeight: 700 }} value={form.complaintNo} onChange={e => set('complaintNo', e.target.value)} /></Field>
                    <Field label="Customer Name"><input style={f.input} value={form.customerName} onChange={e => set('customerName', e.target.value)} /></Field>
                    <Field label="Replacement DO Ref."><input style={f.input} value={form.doNo} onChange={e => set('doNo', e.target.value)} placeholder="RDO-0001" /></Field>
                </div>
                <div style={f.row(2)}>
                    <Field label="Received By"><input style={f.input} value={form.receivedBy} onChange={e => set('receivedBy', e.target.value)} /></Field>
                    <Field label="Status">
                        <select style={f.sel} value={form.status} onChange={e => set('status', e.target.value)}>
                            <option value="Complete">Complete</option>
                            <option value="Partial">Partial</option>
                        </select>
                    </Field>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={f.sectionTitle}>Items Received</div>
                    <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={12} /> Add Row</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr style={{ background: '#f8fafc' }}>
                        {['Item Code', 'Item Name *', 'UOM', 'Qty Expected', 'Qty Received *', 'Condition', 'Remarks', ''].map(h =>
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 10 }}>{h}</th>
                        )}
                    </tr></thead>
                    <tbody>
                        {form.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 90, fontFamily: 'monospace' }} value={item.itemCode} onChange={e => setItem(i, 'itemCode', e.target.value)} /></td>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 200 }} value={item.itemName} onChange={e => setItem(i, 'itemName', e.target.value)} placeholder="Item name" /></td>
                                <td style={{ padding: '4px 6px' }}><select style={{ ...f.sel, width: 70 }} value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)}>{['NOS', 'PCS', 'SET'].map(u => <option key={u}>{u}</option>)}</select></td>
                                <td style={{ padding: '4px 6px' }}><input type="number" style={{ ...f.input, width: 70 }} value={item.qtyExpected} onChange={e => setItem(i, 'qtyExpected', Number(e.target.value))} min={0} /></td>
                                <td style={{ padding: '4px 6px' }}><input type="number" style={{ ...f.input, width: 70, fontWeight: 700, color: '#059669', border: '1px solid #86efac' }} value={item.qtyReceived} onChange={e => setItem(i, 'qtyReceived', Number(e.target.value))} min={0} /></td>
                                <td style={{ padding: '4px 6px' }}>
                                    <select style={{ ...f.sel, width: 140 }} value={item.physicalCondition} onChange={e => setItem(i, 'physicalCondition', e.target.value)}>
                                        {['Good Packing', 'Damaged Packing', 'No Packing', 'Partial Damage'].map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </td>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 160 }} value={item.remarks} onChange={e => setItem(i, 'remarks', e.target.value)} /></td>
                                <td style={{ padding: '4px 6px' }}>{form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ width: 26, height: 26, background: '#fee2e2', border: 'none', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} color="#dc2626" /></button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <label style={f.label}>Overall Remarks</label>
                <textarea style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }} value={form.overallRemarks} onChange={e => set('overallRemarks', e.target.value)} />
            </div>
        </div>
    );
};

export default FaultyReceiptFormPage;
