import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, Wrench, Plus, Trash2 } from 'lucide-react';
import { createRepairJobCard, getComplaint } from '@/services/serviceApi';
import { getCustomer } from '@/services/customerApi';
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
        customerName: searchParams.get('customer') || '',
        customerId: searchParams.get('customerId') || '',
        customerCode: '',
        receiptNo: '',
        assignedTo: '',
        technicianName: '',
        status: 'Pending Inspection',
        expectedCompletionDate: '',
        items: [{ ...EMPTY_ITEM }],
        overallNotes: '',
    });

    React.useEffect(() => {
        const cId = searchParams.get('complaintId');
        if (cId) {
            getComplaint(cId).then(cmp => {
                if (cmp) {
                    setForm(prev => ({
                        ...prev,
                        customerName: cmp.customerName || prev.customerName,
                        customerId: cmp.customerId || prev.customerId,
                        items: cmp.items?.map(i => {
                            const availableForRepair = Math.max(0, (i.faultyReceivedQty || 0) - (i.inRepairQty || 0));
                            return {
                                ...EMPTY_ITEM,
                                itemId: i.itemId || null,
                                itemCode: i.itemCode || '',
                                itemName: i.itemName || '',
                                qtyReceivedForRepair: availableForRepair,
                                maxQty: availableForRepair,
                                receivedInWarehouse: i.faultyReceivedQty || 0,
                                alreadyInRepair: i.inRepairQty || 0,
                                pendingQty: availableForRepair,
                            };
                        }) || prev.items
                    }));
                }
            }).catch(e => console.error('Repair Job Card pull fail:', e));
        }
        
        const custId = searchParams.get('customerId');
        if (custId) {
            getCustomer(custId).then(c => {
                if (c) setForm(prev => ({ ...prev, customerCode: c.customerCode || '' }));
            });
        }
    }, [searchParams]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => {
        const items = [...f.items];
        const item = { ...items[i], [k]: v };
        
        // Auto-calculate Pending Qty
        if (['repairedQty', 'scrapQty', 'qtyReceivedForRepair'].includes(k)) {
            item.pendingQty = Math.max(0, (item.qtyReceivedForRepair || 0) - ((item.repairedQty || 0) + (item.scrapQty || 0)));
        }

        // Auto-link QC Passed to Repaired
        if (k === 'repairedQty' && item.qcPassedQty === items[i].repairedQty) {
            item.qcPassedQty = v;
        }

        items[i] = item;

        // Auto-update Status logic
        let newStatus = f.status;
        const allDone = items.every(it => (it.repairedQty + it.scrapQty) >= it.qtyReceivedForRepair);
        const anyStarted = items.some(it => (it.repairedQty > 0 || it.scrapQty > 0));

        if (allDone) {
            newStatus = 'Closed';
        } else if (anyStarted && f.status === 'Pending Inspection') {
            newStatus = 'Under Repair';
        }

        return { ...f, items, status: newStatus };
    });

    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    const handleSave = async () => {
        if (!form.complaintId) { addToast('Complaint ID required', 'error'); return; }
        
        // Final Validation
        for (const item of form.items) {
            if ((item.repairedQty + item.scrapQty) > item.qtyReceivedForRepair) {
                addToast(`Total Repaired + Scrap (${item.repairedQty + item.scrapQty}) cannot exceed Qty for Repair (${item.qtyReceivedForRepair}) for item ${item.itemCode}`, 'error');
                return;
            }
        }

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
                    <Field label="Complaint No."><input style={{ ...f.input, fontFamily: 'monospace', color: '#dc2626', fontWeight: 700 }} value={form.complaintNo} readOnly /></Field>
                    <Field label="Faulty Receipt No."><input style={f.input} value={form.receiptNo} onChange={e => set('receiptNo', e.target.value)} placeholder="FRN-0001" /></Field>
                    <Field label="Status">
                        <select style={{ ...f.sel, fontWeight: 700, color: form.status === 'Closed' ? '#059669' : '#374151' }} value={form.status} onChange={e => set('status', e.target.value)}>
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
                            <Field label="Item Code"><input style={{ ...f.input, fontFamily: 'monospace' }} value={item.itemCode} readOnly /></Field>
                            <Field label="Item Name"><input style={f.input} value={item.itemName} readOnly /></Field>
                             <Field label="Qty for Repair">
                                  <input 
                                      type="number" 
                                      style={{ ...f.input, fontWeight: 700, borderColor: item.qtyReceivedForRepair > (item.maxQty || 9999) ? '#dc2626' : '#d1d5db' }} 
                                      value={item.qtyReceivedForRepair} 
                                      onChange={e => setItem(i, 'qtyReceivedForRepair', Number(e.target.value))} 
                                      min={0}
                                      max={item.maxQty}
                                  />
                                  {item.maxQty !== undefined && (
                                      <div style={{ fontSize: 9, color: item.qtyReceivedForRepair > item.maxQty ? '#dc2626' : '#6b7280', marginTop: 2, fontWeight: 600 }}>
                                          Available: {item.maxQty}
                                      </div>
                                  )}
                             </Field>
                            <Field label="Repair Result">
                                <select style={f.sel} value={item.repairResult} onChange={e => setItem(i, 'repairResult', e.target.value)}>
                                    {['Repaired', 'Not Repairable', 'Replaced Internally', 'Scrapped', 'Returned to Customer', 'Pending QC'].map(r => <option key={r}>{r}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div style={{ ...f.row(4), marginTop: 8 }}>
                            <Field label="Repaired Qty"><input type="number" style={{ ...f.input, color: '#059669', fontWeight: 700, border: '1px solid #86efac', borderColor: (item.repairedQty + item.scrapQty) > item.qtyReceivedForRepair ? '#dc2626' : '#86efac' }} value={item.repairedQty} onChange={e => setItem(i, 'repairedQty', Number(e.target.value))} min={0} /></Field>
                            <Field label="Scrap Qty"><input type="number" style={{ ...f.input, color: '#dc2626', fontWeight: 700, border: '1px solid #fca5a5', borderColor: (item.repairedQty + item.scrapQty) > item.qtyReceivedForRepair ? '#dc2626' : '#fca5a5' }} value={item.scrapQty} onChange={e => setItem(i, 'scrapQty', Number(e.target.value))} min={0} /></Field>
                            <Field label="QC Passed Qty"><input type="number" style={f.input} value={item.qcPassedQty} onChange={e => setItem(i, 'qcPassedQty', Number(e.target.value))} min={0} /></Field>
                            <Field label="Pending Qty">
                                <input 
                                    type="number" 
                                    style={{ ...f.input, background: '#f1f5f9', fontWeight: 700, color: item.pendingQty > 0 ? '#3b82f6' : '#64748b' }} 
                                    value={item.pendingQty} 
                                    readOnly 
                                />
                            </Field>
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
