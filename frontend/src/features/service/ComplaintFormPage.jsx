import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { createComplaint, updateComplaint, getComplaint } from '@/services/serviceApi';
import { getSalesInvoices } from '@/services/salesApi';
import { searchCustomers } from '@/services/customerApi';
import { getItems } from '@/services/itemApi';
import { useToast } from '@/components/ui/Toast';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    sel: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' },
    textarea: { width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
    row: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }),
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 12 },
};

const Field = ({ label, children, span }) => (
    <div style={span ? { gridColumn: `span ${span}` } : {}}>
        <label style={f.label}>{label}</label>
        {children}
    </div>
);

const EMPTY_ITEM = { itemCode: '', itemName: '', uom: 'NOS', qtySold: 0, qtyFaultyReported: 1, complaintReason: 'Not Working', actionRequired: 'Replacement to be sent', notes: '' };

import { BrandedLoader } from '@/components/ui/BrandedLoading';

const ComplaintFormPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);
    const { addToast } = useToast();
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(isEdit);
    const [invoices, setInvoices] = useState([]);

    // Customer live search state
    const [customerOptions, setCustomerOptions] = useState([]);
    const [showCustDropdown, setShowCustDropdown] = useState(false);
    const [custHighlightIndex, setCustHighlightIndex] = useState(-1);
    const custRef = useRef(null);
    const custSearchTimeout = useRef(null);

    // Item live search state
    const [itemOptions, setItemOptions] = useState([]);
    const [showItemDropdownRow, setShowItemDropdownRow] = useState(-1);
    const [itemHighlightIndex, setItemHighlightIndex] = useState(-1);
    const itemSearchTimeout = useRef(null);
    const itemTableRef = useRef(null);

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        status: 'Open',
        priority: 'Medium',
        customerName: '', customerId: '', customerCode: '', contactPerson: '', mobile: '', email: '',
        salesInvoiceNo: '', salesInvoiceDate: '', salesOrderNo: '',
        faultCategory: 'Customer Complaint',
        warrantyStatus: 'Unknown',
        serviceType: 'Advance Replacement',
        items: [{ ...EMPTY_ITEM }],
        internalRemarks: '',
    });

    useEffect(() => {
        getSalesInvoices({ limit: 100 }).then(r => setInvoices(r.invoices || [])).catch(() => { });
        if (isEdit) {
            getComplaint(id).then(d => {
                setForm({ ...d, date: d.date?.split('T')[0] || d.date });
                setLoading(false);
            }).catch(() => { addToast('Failed to load complaint', 'error'); setLoading(false); });
        }
        const handleClickOutside = (e) => {
            if (custRef.current && !custRef.current.contains(e.target)) setShowCustDropdown(false);
            if (itemTableRef.current && !itemTableRef.current.contains(e.target)) setShowItemDropdownRow(-1);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items }; });
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    // ─── Customer search handlers (same pattern as Sales Order) ───────────────
    const handleCustomerSearch = (val) => {
        setForm(f => ({ ...f, customerName: val, customerId: '', customerCode: '' }));
        setCustHighlightIndex(-1);
        if (!val.trim() || val.length < 2) { setCustomerOptions([]); setShowCustDropdown(false); return; }
        setShowCustDropdown(true);
        if (custSearchTimeout.current) clearTimeout(custSearchTimeout.current);
        custSearchTimeout.current = setTimeout(async () => {
            try {
                const results = await searchCustomers(val);
                if (Array.isArray(results)) setCustomerOptions(results);
            } catch (e) { console.error('Error searching customers:', e); }
        }, 300);
    };

    const handleCustomerSelect = (c) => {
        setForm(f => ({
            ...f,
            customerName: c.name,
            customerId: c.id || c._id,
            customerCode: c.customerCode || '',
            contactPerson: c.contactPerson || f.contactPerson,
            mobile: c.phone || f.mobile,
            email: c.email || f.email,
        }));
        setShowCustDropdown(false);
        setCustomerOptions([]);

        // Fetch all invoices for this customer across all years
        const cId = c.id || c._id;
        if (cId) {
            getSalesInvoices({ customerId: cId, financialYear: 'all', limit: 300 })
                .then(r => setInvoices(r.invoices || []))
                .catch(() => { });
        }
    };
    // ─────────────────────────────────────────────────────────────────────────

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

    const handleSave = async () => {
        if (!form.customerName.trim()) { addToast('Customer name is required', 'error'); return; }
        if (!form.items.length) { addToast('Add at least one item', 'error'); return; }
        setSaving(true);
        try {
            if (isEdit) await updateComplaint(id, form);
            else await createComplaint(form);
            addToast(isEdit ? 'Complaint updated!' : 'Complaint created!', 'success');
            navigate('/service/complaints');
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save', 'error');
        } finally { setSaving(false); }
    };

    if (loading) return <BrandedLoader size={120} />;

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => navigate('/service/complaints')} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ChevronLeft size={15} />
                    </button>
                    <AlertTriangle size={15} color="#dc2626" />
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{isEdit ? 'Edit Complaint' : 'New Customer Complaint'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { if (window.confirm('Discard changes and return to list?')) navigate('/service/complaints'); }} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#fca5a5' : '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Save size={13} />{saving ? 'Saving…' : (isEdit ? 'Update' : 'Save Complaint')}
                    </button>
                </div>
            </div>

            {/* Form */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={f.sectionTitle}>Complaint Details</div>
                <div style={f.row(4)}>
                    <Field label="Date"><input type="date" style={f.input} value={form.date} onChange={e => set('date', e.target.value)} /></Field>
                    <Field label="Priority">
                        <select style={f.sel} value={form.priority} onChange={e => set('priority', e.target.value)}>
                            {['Low', 'Medium', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
                        </select>
                    </Field>
                    <Field label="Fault Category">
                        <select style={f.sel} value={form.faultCategory} onChange={e => set('faultCategory', e.target.value)}>
                            {['Customer Complaint', 'Warranty Return', 'Transit Damage', 'Production Defect', 'Old Service Return'].map(c => <option key={c}>{c}</option>)}
                        </select>
                    </Field>
                    <Field label="Warranty Status">
                        <select style={f.sel} value={form.warrantyStatus} onChange={e => set('warrantyStatus', e.target.value)}>
                            {['In Warranty', 'Out of Warranty', 'Unknown'].map(w => <option key={w}>{w}</option>)}
                        </select>
                    </Field>
                    <Field label="Service Type">
                        <select style={f.sel} value={form.serviceType} onChange={e => set('serviceType', e.target.value)}>
                            {['Advance Replacement', 'Repair & Return', 'Replace After Receipt', 'Credit Note', 'Inspection Only'].map(s => <option key={s}>{s}</option>)}
                        </select>
                    </Field>
                </div>

                <div style={f.sectionTitle}>Customer Details</div>
                <div style={f.row(4)}>
                    {/* ── Live-search customer field ── */}
                    <Field label="Customer Name *" span={2}>
                        <div ref={custRef} style={{ position: 'relative' }}>
                            <input
                                style={{ ...f.input, borderColor: !form.customerName ? '#fca5a5' : '#d1d5db' }}
                                placeholder="Search company or customer name..."
                                value={form.customerName}
                                onChange={e => handleCustomerSearch(e.target.value)}
                                onFocus={() => form.customerName && form.customerName.length >= 2 && setShowCustDropdown(true)}
                                onKeyDown={e => {
                                    if (!showCustDropdown) return;
                                    if (e.key === 'ArrowDown') { e.preventDefault(); setCustHighlightIndex(p => Math.min(p + 1, customerOptions.length - 1)); }
                                    else if (e.key === 'ArrowUp') { e.preventDefault(); setCustHighlightIndex(p => Math.max(p - 1, 0)); }
                                    else if (e.key === 'Enter' && custHighlightIndex >= 0 && custHighlightIndex < customerOptions.length) {
                                        e.preventDefault(); handleCustomerSelect(customerOptions[custHighlightIndex]);
                                    }
                                    else if (e.key === 'Escape') setShowCustDropdown(false);
                                }}
                            />
                            {form.customerCode && (
                                <div style={{ fontSize: 10, color: '#0d9488', fontWeight: 700, marginTop: 2 }}>
                                    ✓ {form.customerCode}
                                </div>
                            )}
                            {showCustDropdown && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 240, overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)' }}>
                                    {customerOptions.length > 0 ? customerOptions.slice(0, 10).map((c, idx) => (
                                        <div key={c.id || c._id}
                                            onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(c); }}
                                            style={{ padding: '9px 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: custHighlightIndex === idx ? '#f1f5f9' : 'transparent', transition: 'background 0.15s' }}
                                            onMouseEnter={() => setCustHighlightIndex(idx)}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{c.name}</div>
                                            <div style={{ display: 'flex', gap: '8px 12px', flexWrap: 'wrap', marginTop: 2 }}>
                                                {c.gstin && <span style={{ fontSize: 10, color: '#0d9488', fontWeight: 600 }}>GSTIN: {c.gstin}</span>}
                                                {c.phone && <span style={{ fontSize: 10, color: '#6b7280' }}>📞 {c.phone}</span>}
                                                {(c.city || c.state) && <span style={{ fontSize: 10, color: '#6366f1', fontStyle: 'italic' }}>📍 {[c.city, c.state].filter(Boolean).join(', ')}</span>}
                                            </div>
                                        </div>
                                    )) : (
                                        <div style={{ padding: 14, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No customer found — type to search</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Field>
                    <Field label="Contact Person"><input style={f.input} value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></Field>
                    <Field label="Mobile"><input style={f.input} value={form.mobile} onChange={e => set('mobile', e.target.value)} /></Field>
                </div>

                <div style={f.sectionTitle}>Reference Documents</div>
                <div style={f.row(3)}>
                    <Field label="Sales Invoice No.">
                        <input style={f.input} list="inv-list" value={form.salesInvoiceNo} onChange={e => {
                            const val = e.target.value;
                            set('salesInvoiceNo', val);
                            const inv = invoices.find(i => (i.invoiceNumber || i.displayInvoiceNumber) === val);
                            if (inv) {
                                if (inv.invoiceDate) set('salesInvoiceDate', inv.invoiceDate.split('T')[0]);
                                if (inv.soNumber) set('salesOrderNo', inv.soNumber);
                                
                                // Auto-fill faulty items from invoice inventory
                                if (inv.items && inv.items.length > 0) {
                                    const mapped = inv.items.map(ii => ({
                                        itemCode: ii.itemCode || '',
                                        itemName: ii.itemName || '',
                                        uom: ii.uom || 'NOS',
                                        qtySold: ii.qty || 0,
                                        qtyFaultyReported: 1,
                                        complaintReason: 'Not Working',
                                        actionRequired: 'Replacement to be sent',
                                        notes: ''
                                    }));
                                    set('items', mapped);
                                }
                            }
                        }} placeholder="Select or type invoice no." />
                        <datalist id="inv-list">{invoices.map(i => <option key={i._id} value={i.invoiceNumber || i.displayInvoiceNumber} />)}</datalist>
                    </Field>
                    <Field label="Invoice Date"><input type="date" style={f.input} value={form.salesInvoiceDate} onChange={e => set('salesInvoiceDate', e.target.value)} /></Field>
                    <Field label="Sales Order No."><input style={f.input} value={form.salesOrderNo} onChange={e => set('salesOrderNo', e.target.value)} /></Field>
                </div>
            </div>

            {/* Items Table */}
            <div ref={itemTableRef} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 16px 100px 16px', marginBottom: -84 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={f.sectionTitle}>Faulty Items</div>
                    <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={12} /> Add Item
                    </button>
                </div>
                <div style={{ overflowX: 'auto', paddingBottom: 100, marginBottom: -100 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                                {['Item Code', 'Item Name *', 'UOM', 'Qty Sold', 'Faulty Qty *', 'Complaint Reason', 'Action Required', 'Notes', ''].map(h =>
                                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {form.items.map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '4px 6px' }}>
                                        <input style={{ ...f.input, width: 80, fontFamily: 'monospace' }} value={item.itemCode} onChange={e => setItem(i, 'itemCode', e.target.value)} placeholder="JSK-..." />
                                    </td>
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
                                            <div style={{ position: 'absolute', top: '100%', left: 6, right: -100, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', width: 320 }}>
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
                                    <td style={{ padding: '4px 6px' }}>
                                        <select style={{ ...f.sel, width: 70 }} value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)}>
                                            {['NOS', 'PCS', 'SET'].map(u => <option key={u}>{u}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '4px 6px' }}>
                                        <input type="number" style={{ ...f.input, width: 70 }} value={item.qtySold} onChange={e => setItem(i, 'qtySold', Number(e.target.value))} min={0} />
                                    </td>
                                    <td style={{ padding: '4px 6px' }}>
                                        <input type="number" style={{ ...f.input, width: 70, fontWeight: 700, color: '#dc2626', border: '1px solid #fca5a5' }} value={item.qtyFaultyReported} onChange={e => setItem(i, 'qtyFaultyReported', Number(e.target.value))} min={1} />
                                    </td>
                                    <td style={{ padding: '4px 6px' }}>
                                        <select style={{ ...f.sel, width: 140 }} value={item.complaintReason} onChange={e => setItem(i, 'complaintReason', e.target.value)}>
                                            {['Not Working', 'Low Output', 'Flickering', 'Dimming Issue', 'Driver Failure', 'PCB Burnt', 'CCT Not Changing', 'Physical Damage', 'Wrong Item', 'Other'].map(r => <option key={r}>{r}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '4px 6px' }}>
                                        <select style={{ ...f.sel, width: 160 }} value={item.actionRequired} onChange={e => setItem(i, 'actionRequired', e.target.value)}>
                                            {['Replacement to be sent', 'Repair only', 'Return for inspection', 'Credit note later', 'No action / under review'].map(a => <option key={a}>{a}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '4px 6px' }}>
                                        <input style={{ ...f.input, width: 160 }} value={item.notes} onChange={e => setItem(i, 'notes', e.target.value)} placeholder="Notes..." />
                                    </td>
                                    <td style={{ padding: '4px 6px' }}>
                                        {form.items.length > 1 && (
                                            <button onClick={() => removeItem(i)} style={{ width: 26, height: 26, background: '#fee2e2', border: 'none', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Trash2 size={12} color="#dc2626" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Remarks */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <div style={f.sectionTitle}>Internal Remarks</div>
                <textarea style={{ ...f.textarea, minHeight: 60 }} value={form.internalRemarks} onChange={e => set('internalRemarks', e.target.value)} placeholder="Internal notes / approval remarks..." />
            </div>
        </div>
    );
};

export default ComplaintFormPage;
