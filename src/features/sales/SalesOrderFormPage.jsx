import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSalesOrder, getSalesOrderById, updateSalesOrder } from '@/services/salesApi';
import { getCustomers } from '@/services/customerApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const tableInp = { padding: '7px 4px', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111827', fontWeight: 600, textAlign: 'center' };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };

const BLANK_ITEM = () => ({ itemId: null, itemCode: '', itemName: '', modelNo: '', additionalNotes: '', hsnCode: '', uom: 'NOS', qty: '', rate: '', gstRate: 18 });

const numWords = (n) => {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if (!n) return 'Zero Rupees Only';
    const tw = (num) => {
        if (num < 20) return a[num];
        if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
        if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + tw(num % 100) : '');
        if (num < 100000) return tw(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + tw(num % 1000) : '');
        if (num < 10000000) return tw(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + tw(num % 100000) : '');
        return tw(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + tw(num % 10000000) : '');
    };
    return tw(Math.floor(n)) + ' Rupees Only';
};

const Section = ({ title, children }) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>{title}</h3>
        {children}
    </div>
);
const Grid = ({ cols = 3, children }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>;
const Field = ({ label: l, children }) => <div><label style={label}>{l}</label>{children}</div>;

export default function SalesOrderFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        customerName: '', billingAddress: '', shippingAddress: '', customerGstin: '', customerState: '', customerStateCode: '',
        customerPhone: '', customerEmail: '', customerPO: '', customerPODate: '', orderCategory: 'Order',
        deliveryDate: '', remarks: '', paymentType: 'Credit', gstType: 'CGST / SGST',
        freightAmount: '', freightGstRate: 0,
        items: [BLANK_ITEM()],
    });

    const [customerOptions, setCustomerOptions] = useState([]);
    const [showCustDropdown, setShowCustDropdown] = useState(false);
    const [custHighlightIndex, setCustHighlightIndex] = useState(-1);
    const custRef = useRef(null);
    const custSearchTimeout = useRef(null);

    const [itemOptions, setItemOptions] = useState([]);
    const [activeItemRow, setActiveItemRow] = useState(null);
    const itemRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (custRef.current && !custRef.current.contains(e.target)) setShowCustDropdown(false);
            if (itemRef.current && !itemRef.current.contains(e.target)) setActiveItemRow(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const state = (form.customerState || '').trim().toLowerCase();
        const code = (form.customerStateCode || '').trim();
        const isMH = state === 'maharashtra' || code === '27';
        const newGst = isMH ? 'CGST / SGST' : ((state || code) ? 'IGST' : form.gstType);
        if (newGst !== form.gstType) setF('gstType', newGst);
    }, [form.customerState, form.customerStateCode]);

    const handleCustomerSearch = (val) => {
        setF('customerName', val);
        setCustHighlightIndex(-1);
        if (!val.trim()) { setCustomerOptions([]); setShowCustDropdown(false); return; }
        setShowCustDropdown(true);
        if (custSearchTimeout.current) clearTimeout(custSearchTimeout.current);
        custSearchTimeout.current = setTimeout(async () => {
            try {
                // Fetch broadly, we will filter strictly on the client side
                const res = await getCustomers({ search: val, limit: 40 });
                const list = res?.results || res?.data?.results || res?.data || res || [];
                if (Array.isArray(list)) setCustomerOptions(list);
            } catch (e) { console.error('Error searching customers:', e); }
        }, 300);
    };

    const handleCustomerSelect = (c) => {
        const primaryContact = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0] || {};
        const stateName = c.state || '';

        let stateCode = '';
        if (c.stateCode) stateCode = c.stateCode;
        else if (c.gstNumber && c.gstNumber.length >= 2) stateCode = c.gstNumber.substring(0, 2);

        // Build a comprehensive address string from the master
        const addrParts = [c.address, c.area, c.taluka, c.city, c.district].filter(Boolean);
        let fullAddress = addrParts.join(', ');
        if (c.pincode) fullAddress += ` - ${c.pincode}`;
        if (stateName && !fullAddress.includes(stateName)) fullAddress += `\n${stateName}`;

        setForm(p => {
            const isMH = stateName.trim().toLowerCase() === 'maharashtra' || stateCode === '27';
            return {
                ...p,
                customerName: c.customerName || c.company || '',
                customerPhone: primaryContact.mobile || '',
                customerEmail: c.companyEmail || primaryContact.email || '',
                customerGstin: c.gstNumber || '',
                customerState: stateName,
                customerStateCode: stateCode,
                billingAddress: fullAddress || '',
                shippingAddress: fullAddress || '',
                gstType: c.gstType ? c.gstType : (isMH ? 'CGST / SGST' : ((stateName.trim() || stateCode) ? 'IGST' : p.gstType))
            };
        });
        setShowCustDropdown(false);
    };

    const handleItemSearch = async (val, index) => {
        setItem(index, 'itemName', val);
        if (!val.trim()) { setItemOptions([]); setActiveItemRow(null); return; }
        setActiveItemRow(index);
        try {
            const res = await getItems({ search: val, itemCategory: 'FINISHED_GOOD', limit: 15 });
            const list = res?.data || res?.results || res || [];
            if (Array.isArray(list)) setItemOptions(list);
        } catch (e) { console.error('Error searching items:', e); }
    };

    const handleItemSelect = (selected, index) => {
        setForm(p => {
            const items = p.items.map((item, idx) => {
                if (idx !== index) return item;
                const rate = selected.standardRate || selected.rate || selected.salesPrice || 0;
                const updated = {
                    itemId: selected._id,
                    itemCode: selected.itemCode || '',
                    itemName: selected.itemName || selected.name || '',
                    modelNo: '',
                    additionalNotes: '',
                    hsnCode: selected.hsnCode || '',
                    uom: selected.uom || 'NOS',
                    rate,
                    gstRate: selected.taxRate || selected.gstRate || 18,
                };
                return { ...updated, amount: (Number(updated.qty) || 0) * (Number(updated.rate) || 0) };
            });
            return { ...p, items };
        });
        setActiveItemRow(null);
    };

    useEffect(() => {
        if (isEdit) {
            getSalesOrderById(id).then(so => {
                setForm({
                    ...so,
                    soDate: so.soDate ? so.soDate.slice(0, 10) : '',
                    deliveryDate: so.deliveryDate ? so.deliveryDate.slice(0, 10) : '',
                    customerPODate: so.customerPODate ? so.customerPODate.slice(0, 10) : '',
                    items: so.items?.length ? so.items : [BLANK_ITEM()],
                });
            }).catch(() => toast.error('Failed to load SO'));
        } else {
            // Force reset when creating a new Sales Order
            setForm({
                customerName: '', billingAddress: '', shippingAddress: '', customerGstin: '', customerState: '', customerStateCode: '',
                customerPhone: '', customerEmail: '', customerPO: '', customerPODate: '', orderCategory: 'Order',
                deliveryDate: '', remarks: '', paymentType: 'Credit', gstType: 'CGST / SGST',
                freightAmount: '', freightGstRate: 18,
                items: [BLANK_ITEM()],
            });
            setActiveItemRow(null);
            setCustHighlightIndex(-1);
            setShowCustDropdown(false);
        }
    }, [id, isEdit]);

    const setF = (k, v) => {
        setForm(p => {
            let gstType = p.gstType;
            if (k === 'customerState') {
                const isMH = v.trim().toLowerCase() === 'maharashtra';
                gstType = isMH ? 'CGST / SGST' : (v.trim() ? 'IGST' : p.gstType);
            }
            return { ...p, [k]: v, gstType };
        });
    };
    const setItem = (i, k, v) => setForm(p => {
        const items = p.items.map((item, idx) => {
            if (idx !== i) return item;
            const updated = { ...item, [k]: v };
            if (k === 'qty' || k === 'rate') {
                return { ...updated, amount: (Number(updated.qty) || 0) * (Number(updated.rate) || 0) };
            }
            return updated;
        });
        return { ...p, items };
    });
    const addItem = () => setForm(p => ({ ...p, items: [...p.items, BLANK_ITEM()] }));
    const removeItem = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

    // COMPUTED TOTALS (live)
    const isIGST = form.gstType === 'IGST';
    const processedItems = form.items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const amount = qty * rate;
        const gstRate = Number(item.gstRate) || 18;
        const cgstAmt = isIGST ? 0 : Math.round(amount * gstRate / 2 / 100 * 100) / 100;
        const igstAmt = isIGST ? Math.round(amount * gstRate / 100 * 100) / 100 : 0;
        return { ...item, amount, cgstAmt, igstAmt };
    });
    const itemTotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const itemGst = processedItems.reduce((s, i) => s + (i.cgstAmt || 0) * (isIGST ? 0 : 2) + (i.igstAmt || 0), 0);

    const freight = Number(form.freightAmount) || 0;
    const freightGstRate = Number(form.freightGstRate) || (processedItems[0]?.gstRate || 18);
    const freightGst = Math.round(freight * freightGstRate / 100 * 100) / 100;

    const totalTaxable = itemTotal + freight;
    const totalGst = itemGst + freightGst;
    const grandTotal = totalTaxable + totalGst;
    const roundedTotal = Math.round(grandTotal);

    const handleSubmit = async (nextStatus) => {
        if (!form.customerName) return toast.error('Customer name is required');
        if (form.items.some(i => !i.itemName || !i.qty || !i.rate)) return toast.error('All items need name, qty, and rate');
        setSaving(true);
        try {
            const payload = {
                ...form,
                status: nextStatus || form.status || 'Draft',
                items: form.items.map(i => ({ ...i, qty: Number(i.qty), rate: Number(i.rate), gstRate: Number(i.gstRate) || 18 }))
            };
            if (isEdit) { await updateSalesOrder(id, payload); toast.success('Updated!'); navigate(PATHS.SALES.ORDER_DETAIL(id)); }
            else { const so = await createSalesOrder(payload); toast.success('Sales Order created!'); navigate(PATHS.SALES.ORDER_DETAIL(so._id)); }
        } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
        finally { setSaving(false); }
    };


    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <style>
                {`
                    /* Hide scroll arrows on number inputs */
                    .no-spin::-webkit-inner-spin-button, 
                    .no-spin::-webkit-outer-spin-button { 
                        -webkit-appearance: none; 
                        margin: 0; 
                    }
                    .no-spin {
                        -moz-appearance: textfield;
                    }
                `}
            </style>
            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => navigate(PATHS.SALES.ORDERS)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Orders</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{isEdit ? 'Edit Sales Order' : '📋 New Sales Order'}</h1>
                    <div></div>
                </div>
            </div>

            <div style={{ padding: '20px 28px', maxWidth: 1100, margin: '0 auto' }}>
                {form.status && form.status !== 'Draft' && (
                    <div style={{ background: '#ecfdf5', color: '#065f46', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🔒</span>
                        <span>This order is <strong>{form.status}</strong>. General details are locked, but items can still be updated.</span>
                    </div>
                )}
                {/* Order Info */}
                <Section title="Order Information">
                    <Grid cols={3}>
                        <Field label="Order Date"><input type="date" value={form.soDate || ''} onChange={e => setF('soDate', e.target.value)} style={inp} disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="Order Category">
                            <select value={form.orderCategory} onChange={e => setF('orderCategory', e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={form.status && form.status !== 'Draft'}>
                                <option>Order</option><option>Sample</option><option>Replacement</option>
                            </select>
                        </Field>
                        <Field label="Delivery Date"><input type="date" value={form.deliveryDate || ''} onChange={e => setF('deliveryDate', e.target.value)} style={inp} disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="Payment Type">
                            <select value={form.paymentType} onChange={e => setF('paymentType', e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={form.status && form.status !== 'Draft'}>
                                <option>Credit</option><option>Cash</option>
                            </select>
                        </Field>
                        <div style={{ gridColumn: 'span 2' }}></div>
                        <div style={{ gridColumn: 'span 1' }}></div>
                        <Field label="Remarks" ><textarea value={form.remarks} onChange={e => setF('remarks', e.target.value)} style={{ ...inp, height: 56, resize: 'vertical', gridColumn: 'span 3' }} placeholder="Any remarks..." disabled={form.status && form.status !== 'Draft'} /></Field>
                    </Grid>
                </Section>

                {/* Customer Info */}
                <Section title="Customer Details">
                    <Grid cols={3}>
                        <Field label="Customer Name *">
                            <div ref={custRef} style={{ position: 'relative' }}>
                                <input
                                    value={form.customerName}
                                    onChange={e => handleCustomerSearch(e.target.value)}
                                    onFocus={() => customerOptions.length && setShowCustDropdown(true)}
                                    disabled={form.status && form.status !== 'Draft'}
                                    onKeyDown={e => {
                                        if (!showCustDropdown) return;
                                        const visibleOptions = customerOptions.filter(c => {
                                            const search = form.customerName.toLowerCase().trim();
                                            return (c.customerName || '').toLowerCase().startsWith(search) || (c.company || '').toLowerCase().startsWith(search);
                                        });
                                        if (e.key === 'ArrowDown') { e.preventDefault(); setCustHighlightIndex(p => Math.min(p + 1, visibleOptions.length - 1)); }
                                        else if (e.key === 'ArrowUp') { e.preventDefault(); setCustHighlightIndex(p => Math.max(p - 1, 0)); }
                                        else if (e.key === 'Enter' && custHighlightIndex >= 0 && custHighlightIndex < visibleOptions.length) {
                                            e.preventDefault(); handleCustomerSelect(visibleOptions[custHighlightIndex]);
                                        }
                                        else if (e.key === 'Escape') { setShowCustDropdown(false); }
                                    }}
                                    style={inp}
                                    placeholder="Search Customer Master..."
                                />
                                {showCustDropdown && customerOptions.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: 'auto', zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                        {customerOptions.filter(c => {
                                            const search = form.customerName.toLowerCase().trim();
                                            const name = (c.customerName || '').toLowerCase();
                                            const company = (c.company || '').toLowerCase();
                                            // STRICT PREFIX MATCHING
                                            return name.startsWith(search) || company.startsWith(search);
                                        })
                                            .sort((a, b) => {
                                                const search = form.customerName.toLowerCase().trim();
                                                const n1 = (a.customerName || a.company || '').toLowerCase();
                                                const n2 = (b.customerName || b.company || '').toLowerCase();
                                                // EXACT MATCH FIRST
                                                if (n1 === search && n2 !== search) return -1;
                                                if (n2 === search && n1 !== search) return 1;
                                                return n1.localeCompare(n2);
                                            })
                                            .slice(0, 15)
                                            .map((c, idx) => (
                                                <div
                                                    key={c._id}
                                                    onClick={() => handleCustomerSelect(c)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid #f3f4f6',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s',
                                                        background: custHighlightIndex === idx ? '#f1f5f9' : 'transparent'
                                                    }}
                                                    onMouseEnter={() => setCustHighlightIndex(idx)}
                                                >
                                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{c.customerName || c.company}</div>
                                                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                                        {c.city ? c.city + ' • ' : ''}{c.contactPersons?.[0]?.mobile || '—'}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </Field>
                        <Field label="Phone"><input value={form.customerPhone} onChange={e => setF('customerPhone', e.target.value)} style={inp} placeholder="+91 XXXXXXXXXX" disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="Email"><input value={form.customerEmail} onChange={e => setF('customerEmail', e.target.value)} style={inp} placeholder="email@domain.com" disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="GSTIN"><input value={form.customerGstin} onChange={e => setF('customerGstin', e.target.value)} style={inp} placeholder="27XXXXX..." disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="State"><input value={form.customerState} onChange={e => setF('customerState', e.target.value)} style={inp} placeholder="Maharashtra" disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="State Code"><input value={form.customerStateCode} onChange={e => setF('customerStateCode', e.target.value)} style={inp} placeholder="27" disabled={form.status && form.status !== 'Draft'} /></Field>
                        <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Billing Address"><textarea value={form.billingAddress} onChange={e => setF('billingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical' }} disabled={form.status && form.status !== 'Draft'} /></Field>
                            <Field label="Shipping Address"><textarea value={form.shippingAddress} onChange={e => setF('shippingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical' }} disabled={form.status && form.status !== 'Draft'} /></Field>
                        </div>
                        <Field label="Customer PO No."><input value={form.customerPO} onChange={e => setF('customerPO', e.target.value)} style={inp} disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="Customer PO Date"><input type="date" value={form.customerPODate || ''} onChange={e => setF('customerPODate', e.target.value)} style={inp} disabled={form.status && form.status !== 'Draft'} /></Field>
                    </Grid>
                </Section>

                {/* Items Table */}
                <Section title="Order Items">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                            <thead><tr>
                                {['Sr', 'Product Name *', 'Model No', 'Notes', 'HSN Code', 'UOM', 'Qty *', 'Rate *', 'Amount', ''].map(h => <th key={h} style={th}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {form.items.map((item, i) => {
                                    const amt = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ ...td, color: '#9ca3af', width: 36 }}>{i + 1}</td>
                                            <td style={{ ...td, minWidth: 160 }}>
                                                <div ref={activeItemRow === i ? itemRef : null} style={{ position: 'relative' }}>
                                                    <input value={item.itemName} onChange={e => handleItemSearch(e.target.value, i)} onFocus={() => itemOptions.length && setActiveItemRow(i)} style={{ ...inp, borderColor: !item.itemName ? '#fca5a5' : '#d1d5db' }} placeholder="Search Item..." autoComplete="off" />
                                                    {activeItemRow === i && itemOptions.length > 0 && (
                                                        <div style={{ position: 'absolute', top: '100%', left: 0, width: 300, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: 'auto', zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                                            {itemOptions.filter(it => {
                                                                const s = (item.itemName || '').toLowerCase();
                                                                const n = (it.itemName || it.name || '').toLowerCase();
                                                                const m = (it.modelNo || it.sku || '').toLowerCase();
                                                                const c = (it.itemCode || '').toLowerCase();
                                                                return n.includes(s) || m.includes(s) || c.includes(s);
                                                            }).map((it) => (
                                                                <div key={it._id} onClick={() => handleItemSelect(it, i)} style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{it.itemName || it.name}</div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                                                        <span>{it.itemCode ? `Code: ${it.itemCode}` : ''} {it.modelNo || it.sku || ''}</span>
                                                                        <span>HSN: {it.hsnCode || '—'}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {item.itemCode && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontWeight: 500 }}>Code: {item.itemCode}</div>}
                                            </td>
                                            <td style={{ ...td, minWidth: 100 }}><input value={item.modelNo} onChange={e => setItem(i, 'modelNo', e.target.value)} style={inp} autoComplete="off" /></td>
                                            <td style={{ ...td, minWidth: 120 }}><input value={item.additionalNotes} onChange={e => setItem(i, 'additionalNotes', e.target.value)} style={inp} autoComplete="off" /></td>
                                            <td style={{ ...td, width: 90 }}><input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} style={inp} autoComplete="off" /></td>
                                            <td style={{ ...td, width: 70 }}><input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} style={inp} autoComplete="off" /></td>
                                            <td style={{ ...td, width: 80 }}><input type="number" min="0" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} style={{ ...tableInp, textAlign: 'center', borderColor: !item.qty ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" className="no-spin" placeholder="0" /></td>
                                            <td style={{ ...td, width: 90 }}><input type="number" min="0" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} style={{ ...tableInp, textAlign: 'right', borderColor: !item.rate ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" className="no-spin" placeholder="0.00" /></td>
                                            <td style={{ ...td, color: '#16a34a', fontWeight: 600, width: 90, whiteSpace: 'nowrap' }}>₹{amt.toLocaleString('en-IN')}</td>
                                            <td style={{ ...td, width: 36 }}>
                                                {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <button onClick={addItem} style={{ padding: '7px 16px', border: '1px dashed #0d9488', background: '#f0fdfa', borderRadius: 7, cursor: 'pointer', color: '#0d9488', fontSize: 13, fontWeight: 600 }}>+ Add Item</button>
                    </div>
                </Section>

                {/* Freight + Totals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Section title="Order Summary">
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280' }}>
                                <span>Total Item Amount</span>
                                <span style={{ fontWeight: 600 }}>₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6b7280', padding: '4px 0' }}>
                                <span>Freight / Shipping</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input type="number" min="0" value={form.freightAmount} onChange={e => setF('freightAmount', e.target.value)} style={{ ...inp, width: 80, padding: '4px 8px' }} placeholder="Amt" title="Freight Amount" disabled={form.status && form.status !== 'Draft'} />
                                    <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <span>GST%</span>
                                        <input type="number" min="0" max="28" value={form.freightGstRate} onChange={e => setF('freightGstRate', e.target.value)} style={{ ...inp, width: 45, padding: '4px 4px', fontSize: 10 }} placeholder="%" title="Freight GST %" disabled={form.status && form.status !== 'Draft'} />
                                    </div>
                                    <span style={{ fontWeight: 600, color: '#4b5563', minWidth: 60, textAlign: 'right' }}>₹{freight.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#374151', fontWeight: 700, borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 4 }}>
                                <span>Total Taxable</span>
                                <span>₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2563eb', paddingTop: 4 }}>
                                <span>{isIGST ? 'IGST' : 'CGST'}</span>
                                <span>₹{(isIGST ? totalGst : totalGst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {!isIGST && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2563eb', paddingTop: 4 }}>
                                    <span>SGST</span>
                                    <span>₹{(totalGst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, color: '#16a34a', fontWeight: 800, padding: '12px 0 0', borderTop: '2px solid #16a34a' }}>
                                <span>Rounded Total</span>
                                <span>₹{roundedTotal.toLocaleString('en-IN')}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 4, textAlign: 'right' }}>{numWords(roundedTotal)}</div>
                        </div>
                    </Section>
                </div>

                {/* Form Actions Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, padding: '20px 0', borderTop: '1px solid #e5e7eb' }}>
                    <button onClick={() => navigate(PATHS.SALES.ORDERS)} style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 14 }}>Cancel</button>
                    {(!form.status || form.status === 'Draft') && (
                        <button onClick={() => handleSubmit('Draft')} disabled={saving} style={{ padding: '10px 24px', background: '#fff', color: '#0d9488', border: '1px solid #0d9488', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                            {saving ? 'Saving...' : isEdit ? 'Save Draft' : 'Save as Draft'}
                        </button>
                    )}
                    <button onClick={() => handleSubmit('Confirmed')} disabled={saving} style={{ padding: '10px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                        {saving ? 'Processing...' : (form.status === 'Draft' || !form.status) ? '✓ Submit Order' : '✓ Update Order'}
                    </button>
                </div>
            </div>
        </div>
    );
}
