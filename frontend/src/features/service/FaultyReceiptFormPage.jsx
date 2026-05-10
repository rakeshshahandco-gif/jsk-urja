import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, Package, Plus, Trash2 } from 'lucide-react';
import { createFaultyReceipt, getComplaint } from '@/services/serviceApi';
import { getCustomer } from '@/services/customerApi';
import { getItems } from '@/services/itemApi';
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
        customerId: searchParams.get('customerId') || '',
        customerCode: '',
        salesInvoiceNo: '',
        receiptNo: '',
        receivedThrough: '',
        items: [{ itemCode: '', itemName: '', uom: 'NOS', qtyExpected: 0, qtyReceived: 1, physicalCondition: 'Good Packing', remarks: '' }],
        status: 'Complete',
    });

    // Item live search state
    const [itemOptions, setItemOptions] = useState([]);
    const [showItemDropdownRow, setShowItemDropdownRow] = useState(-1);
    const [itemHighlightIndex, setItemHighlightIndex] = useState(-1);
    const itemSearchTimeout = useRef(null);
    const itemTableRef = useRef(null);

    React.useEffect(() => {
        const cId = searchParams.get('complaintId');
        if (cId) {
            getComplaint(cId).then(cmp => {
                if (cmp) {
                    setForm(prev => ({
                        ...prev,
                        customerName: cmp.customerName || prev.customerName,
                        customerId: cmp.customerId || prev.customerId,
                        salesInvoiceNo: cmp.salesInvoiceNo || '',
                        items: cmp.items?.map(i => {
                            let maxToReceive = 0;
                            if (cmp.serviceType === 'Advance Replacement') {
                                maxToReceive = Math.max(0, (i.dispatchedQty || 0) - (i.faultyReceivedQty || 0));
                            } else {
                                maxToReceive = Math.max(0, (i.qtyFaultyReported || 0) - (i.faultyReceivedQty || 0));
                            }

                            return {
                                itemId: i.itemId || null,
                                itemCode: i.itemCode || '',
                                itemName: i.itemName || '',
                                uom: 'NOS',
                                qtyExpected: cmp.serviceType === 'Advance Replacement' ? (i.dispatchedQty || 0) : (i.qtyFaultyReported || 0),
                                qtyReceived: maxToReceive,
                                maxQty: maxToReceive,
                                alreadyReceived: i.faultyReceivedQty || 0,
                                physicalCondition: 'Good Packing',
                                remarks: ''
                            };
                        }) || prev.items
                    }));
                }
            }).catch(e => console.error('Failed to fetch complaint items:', e));
        }

        const custId = searchParams.get('customerId');
        if (custId) {
            getCustomer(custId).then(c => {
                if (c) setForm(prev => ({ ...prev, customerCode: c.customerCode || '' }));
            });
        }
        const handleClickOutside = (e) => {
            if (itemTableRef.current && !itemTableRef.current.contains(e.target)) setShowItemDropdownRow(-1);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [searchParams]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items }; });
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { itemCode: '', itemName: '', uom: 'NOS', qtyExpected: 0, qtyReceived: 1, physicalCondition: 'Good Packing', remarks: '' }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    // ─── Item search handlers ────────────────────────────────────────────────
    const handleItemSearch = (val, idx) => {
        setItem(idx, 'itemName', val);
        setItemHighlightIndex(-1);
        if (!val.trim() || val.length < 2) { setItemOptions([]); setShowItemDropdownRow(-1); return; }
        setShowItemDropdownRow(idx);
        if (itemSearchTimeout.current) clearTimeout(itemSearchTimeout.current);
        itemSearchTimeout.current = setTimeout(async () => {
            try {
                const res = await getItems({ search: val, limit: 15 });
                if (res.success && Array.isArray(res.data)) setItemOptions(res.data);
            } catch (e) { console.error('Error searching items:', e); }
        }, 300);
    };

    const handleItemSelect = (it, idx) => {
        setForm(f => {
            const items = [...f.items];
            items[idx] = {
                ...items[idx],
                itemCode: it.itemCode || '',
                itemName: it.itemName || '',
                uom: it.uom || 'NOS',
            };
            return { ...f, items };
        });
        setShowItemDropdownRow(-1);
        setItemOptions([]);
    };
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!form.complaintId) { addToast('Complaint ID required', 'error'); return; }
        if (!form.customerName.trim()) { addToast('Customer name required', 'error'); return; }
        setSaving(true);
        try {
            await createFaultyReceipt(form);
            addToast('Faulty Receipt recorded!', 'success');
            navigate(-1);
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to save';
            addToast(msg, 'error');
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
                    <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
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
                    <Field label="Customer Name">
                        <input style={{ ...f.input, background: '#f9fafb' }} value={form.customerName} readOnly />
                        {form.customerCode && <div style={{ fontSize: 10, color: '#0d9488', fontWeight: 700, marginTop: 2 }}>✓ {form.customerCode}</div>}
                    </Field>
                    <Field label="Ref Invoice No."><input style={f.input} value={form.salesInvoiceNo} onChange={e => set('salesInvoiceNo', e.target.value)} /></Field>
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

            <div ref={itemTableRef} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 16px 100px 16px', marginBottom: -84 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={f.sectionTitle}>Items Received</div>
                    <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={12} /> Add Row</button>
                </div>
                <div style={{ overflowX: 'auto', paddingBottom: 150, marginBottom: -150 }}>
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
                                <td style={{ padding: '4px 6px', position: 'relative' }}>
                                    <input 
                                        style={{ ...f.input, width: 220 }} 
                                        value={item.itemName} 
                                        onChange={e => handleItemSearch(e.target.value, i)} 
                                        onFocus={() => item.itemName && item.itemName.length >= 2 && setShowItemDropdownRow(i)}
                                        onKeyDown={e => {
                                            if (showItemDropdownRow !== i) return;
                                            if (e.key === 'ArrowDown') { e.preventDefault(); setItemHighlightIndex(p => Math.min(p + 1, itemOptions.length - 1)); }
                                            else if (e.key === 'ArrowUp') { e.preventDefault(); setItemHighlightIndex(p => Math.max(p - 1, 0)); }
                                            else if (e.key === 'Enter' && itemHighlightIndex >= 0 && itemHighlightIndex < itemOptions.length) {
                                                e.preventDefault(); handleItemSelect(itemOptions[itemHighlightIndex], i);
                                            }
                                            else if (e.key === 'Escape') setShowItemDropdownRow(-1);
                                        }}
                                        placeholder="Search product name..." 
                                    />
                                    {showItemDropdownRow === i && (
                                        <div style={{ position: 'absolute', top: '100%', left: 6, right: -100, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', width: 330 }}>
                                            {itemOptions.length > 0 ? itemOptions.map((it, idx) => (
                                                <div key={it._id}
                                                    onClick={() => handleItemSelect(it, i)}
                                                    style={{ padding: '7px 10px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: itemHighlightIndex === idx ? '#f1f5f9' : 'transparent' }}
                                                    onMouseEnter={() => setItemHighlightIndex(idx)}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{it.itemName}</div>
                                                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>
                                                        <span style={{ fontWeight: 600, color: '#0d9488' }}>{it.itemCode}</span>
                                                        {it.itemGroupName && <span style={{ marginLeft: 8 }}>• {it.itemGroupName}</span>}
                                                    </div>
                                                </div>
                                            )) : (
                                                <div style={{ padding: 10, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>No product found — type to search</div>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '4px 6px' }}><select style={{ ...f.sel, width: 70 }} value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)}>{['NOS', 'PCS', 'SET'].map(u => <option key={u}>{u}</option>)}</select></td>
                                <td style={{ padding: '4px 6px' }}><input type="number" style={{ ...f.input, width: 70 }} value={item.qtyExpected} onChange={e => setItem(i, 'qtyExpected', Number(e.target.value))} min={0} /></td>
                                <td style={{ padding: '4px 6px' }}>
                                    <input 
                                        type="number" 
                                        style={{ ...f.input, width: 70, fontWeight: 700, color: '#059669', border: '1px solid #86efac', borderColor: item.qtyReceived > (item.maxQty || 9999) ? '#dc2626' : '#86efac' }} 
                                        value={item.qtyReceived} 
                                        onChange={e => setItem(i, 'qtyReceived', Number(e.target.value))} 
                                        min={0}
                                        max={item.maxQty}
                                    />
                                    {item.maxQty !== undefined && (
                                        <div style={{ fontSize: 9, color: item.qtyReceived > item.maxQty ? '#dc2626' : '#6b7280', marginTop: 2, fontWeight: 600 }}>
                                            Pending: {item.maxQty}
                                        </div>
                                    )}
                                </td>
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
        </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <label style={f.label}>Overall Remarks</label>
                <textarea style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }} value={form.overallRemarks} onChange={e => set('overallRemarks', e.target.value)} />
            </div>
        </div>
    );
};

export default FaultyReceiptFormPage;
