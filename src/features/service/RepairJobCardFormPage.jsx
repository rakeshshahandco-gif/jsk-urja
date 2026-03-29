import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, Wrench, Plus, Trash2 } from 'lucide-react';
import { createRepairJobCard } from '@/services/serviceApi';
import { useToast } from '@/components/ui/Toast';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    sel: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    row: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }),
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 12 },
};

const Field = ({ label, children }) => <div><label style={f.label}>{label}</label>{children}</div>;

const EMPTY_ITEM = { itemCode: '', itemName: '', uom: 'NOS', qtyReceivedForRepair: 1, faultDescription: '', rootCause: '', actionTaken: '', repairedQty: 0, scrapQty: 0, qcPassedQty: 0, pendingQty: 1, repairResult: 'Pending QC' };

const RepairJobCardFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { addToast } = useToast();
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        complaintId: searchParams.get('complaintId') || '',
        complaintNo: searchParams.get('complaintNo') || '',
        receiptNo: '',
        assignedTo: '',
        technicianName: '',
        status: 'Pending Inspection',
        expectedCompletionDate: '',
        items: [{ ...EMPTY_ITEM }],
        overallNotes: '',
    });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items }; });
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    const handleSave = async () => {
        if (!form.complaintId) { addToast('Complaint ID required', 'error'); return; }
        setSaving(true);
        try {
            await createRepairJobCard(form);
            addToast('Repair Job Card created!', 'success');
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
                    <Wrench size={15} color="#7c3aed" />
                    <span style={{ fontSize: 14, fontWeight: 800 }}>Repair / QC Job Card</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#c4b5fd' : '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Save size={13} />{saving ? 'Saving…' : 'Save Job Card'}
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={f.sectionTitle}>Job Card Details</div>
                <div style={f.row(4)}>
                    <Field label="Date"><input type="date" style={f.input} value={form.date} onChange={e => set('date', e.target.value)} /></Field>
                    <Field label="Complaint No."><input style={{ ...f.input, fontFamily: 'monospace', color: '#dc2626', fontWeight: 700 }} value={form.complaintNo} onChange={e => set('complaintNo', e.target.value)} /></Field>
                    <Field label="Faulty Receipt No."><input style={f.input} value={form.receiptNo} onChange={e => set('receiptNo', e.target.value)} placeholder="FRN-0001" /></Field>
                    <Field label="Status">
                        <select style={f.sel} value={form.status} onChange={e => set('status', e.target.value)}>
                            {['Pending Inspection', 'Under Repair', 'Awaiting Parts', 'Repaired', 'Not Repairable', 'Closed'].map(s => <option key={s}>{s}</option>)}
                        </select>
                    </Field>
                </div>
                <div style={f.row(3)}>
                    <Field label="Assigned To / Dept."><input style={f.input} value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} placeholder="QC Team / Technician Name" /></Field>
                    <Field label="Technician Name"><input style={f.input} value={form.technicianName} onChange={e => set('technicianName', e.target.value)} /></Field>
                    <Field label="Expected Completion"><input type="date" style={f.input} value={form.expectedCompletionDate} onChange={e => set('expectedCompletionDate', e.target.value)} /></Field>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={f.sectionTitle}>Items for Repair</div>
                    <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={12} /> Add Row</button>
                </div>
                {form.items.map((item, i) => (
                    <div key={i} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, marginBottom: 10, position: 'relative' }}>
                        {form.items.length > 1 && (
                            <button onClick={() => removeItem(i)} style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, background: '#fee2e2', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={11} color="#dc2626" /></button>
                        )}
                        <div style={f.row(4)}>
                            <Field label="Item Code"><input style={{ ...f.input, fontFamily: 'monospace' }} value={item.itemCode} onChange={e => setItem(i, 'itemCode', e.target.value)} /></Field>
                            <Field label="Item Name"><input style={f.input} value={item.itemName} onChange={e => setItem(i, 'itemName', e.target.value)} placeholder="Item name" /></Field>
                            <Field label="Qty for Repair"><input type="number" style={{ ...f.input, fontWeight: 700 }} value={item.qtyReceivedForRepair} onChange={e => setItem(i, 'qtyReceivedForRepair', Number(e.target.value))} min={0} /></Field>
                            <Field label="Repair Result">
                                <select style={f.sel} value={item.repairResult} onChange={e => setItem(i, 'repairResult', e.target.value)}>
                                    {['Repaired', 'Not Repairable', 'Replaced Internally', 'Scrapped', 'Returned to Customer', 'Pending QC'].map(r => <option key={r}>{r}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div style={{ ...f.row(4), marginTop: 8 }}>
                            <Field label="Repaired Qty"><input type="number" style={{ ...f.input, color: '#059669', fontWeight: 700, border: '1px solid #86efac' }} value={item.repairedQty} onChange={e => setItem(i, 'repairedQty', Number(e.target.value))} min={0} /></Field>
                            <Field label="Scrap Qty"><input type="number" style={{ ...f.input, color: '#dc2626', fontWeight: 700, border: '1px solid #fca5a5' }} value={item.scrapQty} onChange={e => setItem(i, 'scrapQty', Number(e.target.value))} min={0} /></Field>
                            <Field label="QC Passed Qty"><input type="number" style={f.input} value={item.qcPassedQty} onChange={e => setItem(i, 'qcPassedQty', Number(e.target.value))} min={0} /></Field>
                            <Field label="Pending Qty"><input type="number" style={f.input} value={item.pendingQty} onChange={e => setItem(i, 'pendingQty', Number(e.target.value))} min={0} /></Field>
                        </div>
                        <div style={{ ...f.row(3), marginTop: 8 }}>
                            <Field label="Fault Description"><input style={f.input} value={item.faultDescription} onChange={e => setItem(i, 'faultDescription', e.target.value)} placeholder="What was observed?" /></Field>
                            <Field label="Root Cause"><input style={f.input} value={item.rootCause} onChange={e => setItem(i, 'rootCause', e.target.value)} placeholder="Root cause analysis" /></Field>
                            <Field label="Action Taken"><input style={f.input} value={item.actionTaken} onChange={e => setItem(i, 'actionTaken', e.target.value)} placeholder="What was done?" /></Field>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <label style={f.label}>Overall Notes</label>
                <textarea style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }} value={form.overallNotes} onChange={e => set('overallNotes', e.target.value)} />
            </div>
        </div>
    );
};

export default RepairJobCardFormPage;
