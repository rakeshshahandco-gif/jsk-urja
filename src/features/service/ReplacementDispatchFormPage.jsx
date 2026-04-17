import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Truck, Save, Plus, Trash2 } from 'lucide-react';
import { createReplacementDispatch, getComplaint } from '@/services/serviceApi';
import { searchCustomers, getCustomer } from '@/services/customerApi';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    sel: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
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

const ReplacementDispatchFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { addToast } = useToast();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    // ── Customer live-search state ──────────────────────────────────────────
    const [customerOptions, setCustomerOptions] = useState([]);
    const [showCustDropdown, setShowCustDropdown] = useState(false);
    const [custHighlightIndex, setCustHighlightIndex] = useState(-1);
    const custRef = useRef(null);
    const custSearchTimeout = useRef(null);
    // ────────────────────────────────────────────────────────────────────────

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        complaintId: searchParams.get('complaintId') || '',
        complaintNo: searchParams.get('complaintNo') || '',
        customerName: searchParams.get('customer') || '',
        customerId: searchParams.get('customerId') || '',
        customerCode: '',
        dispatchAddress: '',
        salesInvoiceNo: '',
        dispatchThrough: '',
        vehicleDetails: '',
        lrNo: '',
        items: [{ itemCode: '', itemName: '', qty: 1, uom: 'NOS', remark: '' }],
        notes: '',
        preparedBy: user?.name || '',
        approvedBy: '',
        status: 'Dispatched',
    });

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (custRef.current && !custRef.current.contains(e.target)) setShowCustDropdown(false);
        };
        document.addEventListener('mousedown', handleClickOutside);

        const formatAddr = (c) => {
            if (!c) return '';
            if (c.shippingAddress) return c.shippingAddress;
            if (c.billingAddress) return c.billingAddress;
            const parts = [c.address, c.taluka, c.city, c.district, c.state].filter(Boolean);
            let addr = parts.join(', ');
            if (c.pincode) addr += addr ? ` - ${c.pincode}` : c.pincode;
            return addr;
        };

        // Fetch address if customerId is present on load
        const cId = searchParams.get('customerId');
        if (cId) {
            getCustomer(cId).then(c => {
                if (c) {
                    setForm(prev => ({
                        ...prev,
                        customerCode: c.customerCode || '',
                        dispatchAddress: formatAddr(c)
                    }));
                }
            }).catch(e => console.error('Failed to fetch customer for address:', e));
        }

        // Fetch complaint details if complaintId is present
        const complaintId = searchParams.get('complaintId');
        if (complaintId) {
            getComplaint(complaintId).then(cmp => {
                if (cmp) {
                    setForm(prev => ({
                        ...prev,
                        salesInvoiceNo: cmp.salesInvoiceNo || '',
                        customerId: prev.customerId || cmp.customerId || '',
                        items: cmp.items?.map(i => ({
                            itemId: i.itemId || null,
                            itemCode: i.itemCode || '',
                            itemName: i.itemName || '',
                            qty: Math.max(0, (i.qtyFaultyReported || 0) - (i.dispatchedQty || 0)),
                            uom: 'NOS',
                            maxQty: Math.max(0, (i.qtyFaultyReported || 0) - (i.dispatchedQty || 0)),
                            reportedQty: i.qtyFaultyReported || 0,
                            alreadyDispatched: i.dispatchedQty || 0,
                            remark: `Replacement for faulty [Ref: ${cmp.complaintNo}]`
                        })) || prev.items
                    }));
                }
            }).catch(e => console.error('Failed to fetch complaint items:', e));
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [searchParams]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items }; });
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { itemCode: '', itemName: '', qty: 1, uom: 'NOS', remark: '' }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    // ── Customer search handlers ─────────────────────────────────────────────
    const handleCustomerSearch = (val) => {
        setForm(f => {
            // Only clear ID/Code if the name has actually changed from the selected one
            const shouldReset = val !== f.customerName;
            return {
                ...f,
                customerName: val,
                customerId: shouldReset ? '' : f.customerId,
                customerCode: shouldReset ? '' : f.customerCode
            };
        });
        setCustHighlightIndex(-1);
        if (!val.trim() || val.length < 2) { setCustomerOptions([]); setShowCustDropdown(false); return; }
        setShowCustDropdown(true);
        if (custSearchTimeout.current) clearTimeout(custSearchTimeout.current);
        custSearchTimeout.current = setTimeout(async () => {
            try {
                const results = await searchCustomers(val);
                if (Array.isArray(results)) setCustomerOptions(results);
            } catch (e) { console.error('Customer search error:', e); }
        }, 300);
    };

    const handleCustomerSelect = (c) => {
        setForm(f => ({
            ...f,
            customerName: c.name,
            customerId: c.id || c._id,
            customerCode: c.customerCode || '',
            dispatchAddress: c.shippingAddress || c.billingAddress || [c.address, c.city, c.state, c.pincode].filter(Boolean).join(', '),
        }));
        setShowCustDropdown(false);
        setCustomerOptions([]);
    };
    // ────────────────────────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!form.complaintId) { addToast('Complaint ID is required', 'error'); return; }
        if (!form.customerName.trim()) { addToast('Customer name required', 'error'); return; }
        if (form.items.some(i => !i.itemName.trim() || !i.qty)) { addToast('All items need name and qty', 'error'); return; }
        setSaving(true);
        try {
            const dispatch = await createReplacementDispatch(form);
            addToast('Replacement Dispatch created! Stock reduced.', 'success');
            navigate(`/service/replacement-dispatches/${dispatch._id}/print`);
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to save';
            addToast(msg, 'error');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={15} /></button>
                    <Truck size={15} color="#1d4ed8" />
                    <span style={{ fontSize: 14, fontWeight: 800 }}>Replacement Dispatch / Delivery Order</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#93c5fd' : '#1d4ed8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Save size={13} />{saving ? 'Saving & reducing stock…' : 'Save & Print Challan'}
                    </button>
                </div>
            </div>

            <div style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#1e40af', fontWeight: 600 }}>
                ⚠️ Saving this document will immediately reduce saleable inventory for all items dispatched.
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={f.sectionTitle}>Dispatch Details</div>
                <div style={f.row(4)}>
                    <Field label="Date"><input type="date" style={f.input} value={form.date} onChange={e => set('date', e.target.value)} /></Field>
                    <Field label="Complaint No."><input style={{ ...f.input, fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }} value={form.complaintNo} onChange={e => set('complaintNo', e.target.value)} /></Field>

                    {/* ── Live-search Customer Name ── */}
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
                                <div style={{ fontSize: 10, color: '#0d9488', fontWeight: 700, marginTop: 2 }}>✓ {form.customerCode}</div>
                            )}
                            {showCustDropdown && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 240, overflowY: 'auto', zIndex: 200, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)' }}>
                                    {customerOptions.length > 0 ? customerOptions.slice(0, 10).map((c, idx) => (
                                        <div key={c.id || c._id}
                                            onClick={() => handleCustomerSelect(c)}
                                            onMouseEnter={() => setCustHighlightIndex(idx)}
                                            style={{ padding: '9px 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: custHighlightIndex === idx ? '#f1f5f9' : 'transparent' }}>
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
                </div>

                <div style={f.row(3)}>
                    <Field label="Dispatch Address" span={2}><input style={f.input} value={form.dispatchAddress} onChange={e => set('dispatchAddress', e.target.value)} placeholder="Delivery address" /></Field>
                    <Field label="Ref Invoice No."><input style={f.input} value={form.salesInvoiceNo} onChange={e => set('salesInvoiceNo', e.target.value)} /></Field>
                </div>
                <div style={f.row(3)}>
                    <Field label="Dispatch Through"><input style={f.input} value={form.dispatchThrough} onChange={e => set('dispatchThrough', e.target.value)} placeholder="Courier / Vehicle / Self" /></Field>
                    <Field label="Vehicle / Courier Details"><input style={f.input} value={form.vehicleDetails} onChange={e => set('vehicleDetails', e.target.value)} /></Field>
                    <Field label="LR No. / AWB No."><input style={f.input} value={form.lrNo} onChange={e => set('lrNo', e.target.value)} /></Field>
                </div>
                <div style={f.row(2)}>
                    <Field label="Prepared By"><input style={f.input} value={form.preparedBy} onChange={e => set('preparedBy', e.target.value)} /></Field>
                    <Field label="Approved By"><input style={f.input} value={form.approvedBy} onChange={e => set('approvedBy', e.target.value)} /></Field>
                </div>
            </div>

            {/* Items */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={f.sectionTitle}>Replacement Items</div>
                    <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={12} /> Add Row
                    </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                        {['Item Code', 'Item Name *', 'UOM', 'Qty *', 'Remark', ''].map(h =>
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 10 }}>{h}</th>
                        )}
                    </tr></thead>
                    <tbody>
                        {form.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 90, fontFamily: 'monospace' }} value={item.itemCode} onChange={e => setItem(i, 'itemCode', e.target.value)} placeholder="JSK-..." /></td>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 220 }} value={item.itemName} onChange={e => setItem(i, 'itemName', e.target.value)} placeholder="Item name" /></td>
                                <td style={{ padding: '4px 6px' }}>
                                    <select style={{ ...f.sel, width: 70 }} value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)}>
                                        {['NOS', 'PCS', 'SET'].map(u => <option key={u}>{u}</option>)}
                                    </select>
                                </td>
                                <td style={{ padding: '4px 6px' }}>
                                    <input 
                                        type="number" 
                                        style={{ ...f.input, width: 70, fontWeight: 700, borderColor: item.qty > (item.maxQty || 9999) ? '#dc2626' : '#d1d5db' }} 
                                        value={item.qty} 
                                        onChange={e => setItem(i, 'qty', Number(e.target.value))} 
                                        min={1}
                                        max={item.maxQty}
                                    />
                                    {item.maxQty !== undefined && (
                                        <div style={{ fontSize: 9, color: item.qty > item.maxQty ? '#dc2626' : '#6b7280', marginTop: 2, fontWeight: 600 }}>
                                            Max: {item.maxQty} (of {item.reportedQty})
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 180 }} value={item.remark} onChange={e => setItem(i, 'remark', e.target.value)} placeholder="Replacement for faulty" /></td>
                                <td style={{ padding: '4px 6px' }}>
                                    {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ width: 26, height: 26, background: '#fee2e2', border: 'none', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} color="#dc2626" /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <div style={f.sectionTitle}>Notes</div>
                <textarea style={{ ...f.textarea, minHeight: 50 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Dispatch notes..." />
            </div>
        </div>
    );
};

export default ReplacementDispatchFormPage;
