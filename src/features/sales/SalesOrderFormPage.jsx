import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSalesOrder, getSalesOrderById, updateSalesOrder, getInvoiceSeries } from '@/services/salesApi';
import { getCustomers, searchCustomers } from '@/services/customerApi';
import { getItems } from '@/services/itemApi';
import { getStickers } from '@/services/stickerApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { numberToWords } from '@/utils/numberToWords';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown } from 'lucide-react';


const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const tableInp = { padding: '7px 4px', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111827', fontWeight: 600, textAlign: 'center' };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };

const BLANK_ITEM = () => ({ itemId: null, itemCode: '', itemName: '', modelNo: '', additionalNotes: '', hsnCode: '', uom: 'NOS', qty: '', rate: '', gstRate: 18 });


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
        customerPhone: '', customerEmail: '', customerPO: '', customerPODate: '', orderCategory: 'Order',
        customerCode: '',
        soDate: new Date().toISOString().split('T')[0],
        deliveryDate: '', remarks: '', paymentType: 'Credit', gstType: 'CGST / SGST',
        warrantyDetails: '',
        freightAmount: '', freightGstRate: 0,
        creditPeriod: 0,
        seriesId: '',
        gstApplicable: true,
        stickerType: '',
        items: [BLANK_ITEM()],
    });

    const [customerOptions, setCustomerOptions] = useState([]);
    const [seriesList, setSeriesList] = useState([]);
    const [showCustDropdown, setShowCustDropdown] = useState(false);
    const [custHighlightIndex, setCustHighlightIndex] = useState(-1);
    const custRef = useRef(null);
    const custSearchTimeout = useRef(null);

    const [allItems, setAllItems] = useState([]);
    const [stickerOptions, setStickerOptions] = useState([]);
    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (custRef.current && !custRef.current.contains(e.target)) setShowCustDropdown(false);
        };
        document.addEventListener('mousedown', handleClickOutside);

        // Pre-load items
        getItems({ limit: 5000 }).then(res => {
            const list = res?.data || res?.results || res || [];
            if (Array.isArray(list)) {
                const filtered = list.filter(i => {
                    return i.itemCategory === 'FINISHED_GOOD';
                });
                setAllItems(filtered);
            }
        }).catch(e => console.error('Error loading items:', e));

        getStickers().then(res => {
            if (Array.isArray(res)) setStickerOptions(res.map(s => s.name));
        }).catch(e => console.error('Error loading stickers:', e));

        getInvoiceSeries({ active: true }).then(s => {
            setSeriesList(s || []);
            const def = (s || []).find(x => x.isDefault);
            if (def && !isEdit) setForm(p => ({ ...p, seriesId: def._id, gstApplicable: def.gstApplicable !== undefined ? def.gstApplicable : true }));
        }).catch(() => { });

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const state = (form.customerState || '').trim().toLowerCase();
        const code = (form.customerStateCode || '').trim();
        const gstPrefix = (form.customerGstin || '').trim().substring(0, 2);
        
        const isMH = state === 'maharashtra' || code === '27' || gstPrefix === '27';
        const newGst = isMH ? 'CGST / SGST' : ((state || code || gstPrefix) ? 'IGST' : form.gstType);
        
        if (newGst && newGst !== form.gstType) setF('gstType', newGst);
    }, [form.customerState, form.customerStateCode, form.customerGstin]);

    const handleCustomerSearch = (val) => {
        setF('customerName', val);
        setCustHighlightIndex(-1);

        if (!val.trim()) {
            setForm(p => ({
                ...p,
                customerName: '',
                customerCode: '',
                customerPhone: '',
                customerEmail: '',
                customerGstin: '',
                customerState: '',
                customerStateCode: '',
                billingAddress: '',
                shippingAddress: '',
                customerId: null,
                creditPeriod: 0
            }));
            setCustomerOptions([]);
            setShowCustDropdown(false);
            return;
        }

        if (val.length < 2) {
            setCustomerOptions([]);
            setShowCustDropdown(false);
            return;
        }

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
        setForm(p => ({
            ...p,
            customerName: c.name,
            customerCode: c.customerCode || '',
            customerPhone: c.phone || '',
            customerEmail: c.email || '',
            customerGstin: c.gstin || '',
            customerState: c.state || '',
            customerStateCode: c.stateCode || '',
            billingAddress: c.billingAddress || '',
            shippingAddress: c.shippingAddress || '',
            gstType: c.gstType || p.gstType,
            customerId: c.id,
            creditPeriod: c.creditPeriod || 0,
            paymentType: c.paymentType || (c.creditPeriod > 0 ? 'Credit' : 'Cash')
        }));
        setShowCustDropdown(false);
    };

    const handleItemSelect = (val, index) => {
        const selected = allItems.find(it => it._id === val);
        if (!selected) return;
        setForm(p => {
            const items = p.items.map((item, idx) => {
                if (idx !== index) return item;
                const rate = selected.standardRate || selected.rate || selected.salesPrice || '';
                const updated = {
                    itemId: selected._id,
                    itemCode: selected.itemCode || '',
                    itemName: selected.itemName || selected.name || '',
                    description: selected.description || selected.itemName || selected.name || '',
                    modelNo: selected.modelNo || '',
                    additionalNotes: '',
                    hsnCode: selected.hsnCode || '',
                    uom: selected.uom || 'NOS',
                    rate,
                    gstRate: selected.taxRate || selected.gstRate || 18,
                    qty: item.qty || '', // Keep existing quantity or default empty
                };
                return { ...updated, amount: (Number(updated.qty) || 0) * (Number(updated.rate) || 0) };
            });
            return { ...p, items };
        });
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
            setForm({
                customerName: '', billingAddress: '', shippingAddress: '', customerGstin: '', customerState: '', customerStateCode: '',
                customerPhone: '', customerEmail: '', customerPO: '', customerPODate: '', orderCategory: 'Order',
                soDate: new Date().toISOString().split('T')[0],
                deliveryDate: '', remarks: '', paymentType: 'Credit', gstType: 'CGST / SGST',
                warrantyDetails: '',
                freightAmount: '', freightGstRate: 18,
                creditPeriod: 0,
                items: [BLANK_ITEM()],
            });
            setCustHighlightIndex(-1);
            setShowCustDropdown(false);
        }
    }, [id, isEdit]);

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

    const isIGST = form.gstType === 'IGST';
    const gstApplicable = form.gstApplicable !== false;
    const processedItems = form.items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const amount = qty * rate;
        const gstRate = gstApplicable ? (Number(item.gstRate) || 18) : 0;
        const cgstAmt = isIGST ? 0 : Math.round(amount * gstRate / 2 / 100 * 100) / 100;
        const igstAmt = isIGST ? Math.round(amount * gstRate / 100 * 100) / 100 : 0;
        return { ...item, amount, cgstAmt, igstAmt };
    });
    const itemTotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const itemGst = gstApplicable ? processedItems.reduce((s, i) => s + (i.cgstAmt || 0) * (isIGST ? 0 : 2) + (i.igstAmt || 0), 0) : 0;

    const freight = Number(form.freightAmount) || 0;
    const freightGstRate = gstApplicable ? (Number(form.freightGstRate) || (processedItems[0]?.gstRate || 18)) : 0;
    const freightGst = gstApplicable ? Math.round(freight * freightGstRate / 100 * 100) / 100 : 0;

    const totalTaxable = itemTotal + freight;
    const totalGst = itemGst + freightGst;
    const grandTotal = totalTaxable + totalGst;
    const roundedTotal = Math.round(grandTotal);

    // ── Keyboard Navigation ───────────────────────────────────────────────
    const handleRowKeyDown = (e, rowIdx, colIdx) => {
        if (e.key === 'ArrowDown') {
            const next = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="${colIdx}"]`);
            if (next) {
                e.preventDefault();
                next.focus();
            } else if (rowIdx === form.items.length - 1 && form.items[rowIdx].itemId) {
                // Auto add row on down arrow at last row
                addItem();
            }
        } else if (e.key === 'ArrowUp') {
            const prev = document.querySelector(`[data-row="${rowIdx - 1}"][data-col="${colIdx}"]`);
            if (prev) {
                e.preventDefault();
                prev.focus();
            }
        } else if (e.key === 'Enter') {
            const nextColTargets = [1, 3, 4, 5, 6, 7]; // Columns that are inputs (skipping readonly 2)
            const currentTargetIdx = nextColTargets.indexOf(colIdx);
            
            if (currentTargetIdx < nextColTargets.length - 1) {
                const nextCol = document.querySelector(`[data-row="${rowIdx}"][data-col="${nextColTargets[currentTargetIdx + 1]}"]`);
                if (nextCol) {
                    e.preventDefault();
                    nextCol.focus();
                }
            } else {
                // Enter on last column
                if (rowIdx < form.items.length - 1) {
                    const nextRowCol1 = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="1"]`);
                    if (nextRowCol1) {
                        e.preventDefault();
                        nextRowCol1.focus();
                    }
                } else {
                    addItem();
                }
            }
        }
    };

    const handleSubmit = async (nextStatus) => {

        if (!form.customerName) return toast.error('Customer name is required');
        if (form.orderCategory === 'Replacement' && !form.warrantyDetails?.trim()) return toast.error('Please enter Warranty Details for Replacement order.');
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
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => { if (window.confirm('Discard changes?')) navigate(PATHS.SALES.ORDERS); }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Orders</button>
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
                <Section title="Order Information">
                    <Grid cols={4}>
                        <Field label="Order Series *">
                            <select
                                value={form.seriesId}
                                onChange={e => {
                                    const val = e.target.value;
                                    const s = seriesList.find(x => x._id === val);
                                    const isGst = s ? (s.gstApplicable !== false) : true;
                                    setForm(p => ({
                                        ...p,
                                        seriesId: val,
                                        gstApplicable: isGst,
                                        // Reset GST rates on all items if switching to a non-GST series
                                        items: p.items.map(item => ({
                                            ...item,
                                            gstRate: isGst ? (item.gstRate || 18) : 0
                                        })),
                                        freightGstRate: isGst ? (p.freightGstRate || 18) : 0
                                    }));
                                }}
                                style={{ ...inp, cursor: 'pointer', borderColor: !form.seriesId ? '#fca5a5' : '#d1d5db' }}
                                disabled={isEdit}
                            >
                                <option value="">-- Select Series --</option>
                                {seriesList.map(s => <option key={s._id} value={s._id}>{s.seriesName} ({s.prefix}NNNNN)</option>)}
                            </select>
                            {form.seriesId && !form.gstApplicable && (
                                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span>⚠️</span> This series is non-GST. Tax will not be applied.
                                </div>
                            )}
                        </Field>
                        <Field label="Order Date"><input type="date" value={form.soDate || ''} onChange={e => setF('soDate', e.target.value)} style={inp} disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="Order Category">
                            <select value={form.orderCategory} onChange={e => setF('orderCategory', e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={form.status && form.status !== 'Draft'}>
                                <option>Order</option><option>Sample</option><option>Replacement</option>
                            </select>
                        </Field>
                        {form.orderCategory === 'Replacement' && (
                            <Field label="Warranty Details *">
                                <textarea 
                                    value={form.warrantyDetails} 
                                    onChange={e => setF('warrantyDetails', e.target.value)} 
                                    style={{ ...inp, height: 56, resize: 'vertical', borderColor: !form.warrantyDetails?.trim() ? '#fca5a5' : '#d1d5db' }} 
                                    placeholder="Enter replacement reason / warranty details..." 
                                    disabled={form.status && form.status !== 'Draft'} 
                                />
                            </Field>
                        )}
                        <Field label="Delivery Date"><input type="date" value={form.deliveryDate || ''} onChange={e => setF('deliveryDate', e.target.value)} style={inp} disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="Sticker Type">
                            <select value={form.stickerType || ''} onChange={e => setF('stickerType', e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={form.status && form.status !== 'Draft'}>
                                <option value="">-- No Sticker --</option>
                                {stickerOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </Field>
                        <Field label="Remarks" ><textarea value={form.remarks} onChange={e => setF('remarks', e.target.value)} style={{ ...inp, height: 56, resize: 'vertical' }} placeholder="Any remarks..." disabled={form.status && form.status !== 'Draft'} /></Field>
                    </Grid>
                </Section>

                <Section title="Customer Details">
                    <Grid cols={3}>
                        <Field label="Customer Name *">
                            <div ref={custRef} style={{ position: 'relative' }}>
                                <input placeholder="Search company or name..." value={form.customerName} onChange={e => handleCustomerSearch(e.target.value)}
                                    onFocus={() => form.customerName && setShowCustDropdown(true)} style={inp}
                                    disabled={form.status && form.status !== 'Draft'}
                                    onKeyDown={e => {
                                        if (!showCustDropdown) return;
                                        if (e.key === 'ArrowDown') { e.preventDefault(); setCustHighlightIndex(p => Math.min(p + 1, customerOptions.length - 1)); }
                                        else if (e.key === 'ArrowUp') { e.preventDefault(); setCustHighlightIndex(p => Math.max(p - 1, 0)); }
                                        else if (e.key === 'Enter' && custHighlightIndex >= 0 && custHighlightIndex < customerOptions.length) {
                                            e.preventDefault(); handleCustomerSelect(customerOptions[custHighlightIndex]);
                                        }
                                        else if (e.key === 'Escape') { setShowCustDropdown(false); }
                                    }}
                                />
                                {form.customerCode && <div style={{ fontSize: 11, color: '#0d9488', fontWeight: 700, marginTop: 4 }}>SELECTED CODE: {form.customerCode}</div>}
                                {showCustDropdown && (!form.status || form.status === 'Draft') && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 250, overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
                                        {customerOptions.length > 0 ? (
                                            customerOptions.slice(0, 10).map((c, idx) => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => handleCustomerSelect(c)}
                                                    style={{
                                                        padding: '10px 14px',
                                                        borderBottom: '1px solid #f3f4f6',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s',
                                                        background: custHighlightIndex === idx ? '#f1f5f9' : 'transparent'
                                                    }}
                                                    onMouseEnter={() => setCustHighlightIndex(idx)}
                                                >
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{c.name}</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', marginTop: 3 }}>
                                                        {c.gstin && <div style={{ fontSize: 11, color: '#0d9488', fontWeight: 600 }}>GSTIN: {c.gstin}</div>}
                                                        {c.phone && <div style={{ fontSize: 11, color: '#6b7280' }}>Phone: {c.phone}</div>}
                                                        {(c.city || c.state) && <div style={{ fontSize: 11, color: '#6366f1', fontStyle: 'italic' }}>Location: {[c.city, c.state].filter(Boolean).join(', ')}</div>}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ padding: '14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No customer found</div>
                                        )}
                                        <div
                                            onClick={() => navigate(PATHS.CUSTOMERS + '/new')}
                                            style={{
                                                padding: '12px 14px',
                                                borderTop: '2px solid #f3f4f6',
                                                cursor: 'pointer',
                                                color: '#0d9488',
                                                fontSize: 13,
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                background: '#f0fdfa'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#e6fffa'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#f0fdfa'}
                                        >
                                            <span style={{ fontSize: 16 }}>+</span>
                                            Create New Customer
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Field>
                        <Field label="Phone">
                            <input value={form.customerPhone} onChange={e => setF('customerPhone', e.target.value)} style={{ ...inp, background: form.customerId ? '#f9fafb' : '#fff' }} placeholder="+91 XXXXXXXXXX" readOnly={Boolean(form.customerId)} disabled={form.status && form.status !== 'Draft'} />
                        </Field>
                        <Field label="Email">
                            <input value={form.customerEmail} onChange={e => setF('customerEmail', e.target.value)} style={{ ...inp, background: form.customerId ? '#f9fafb' : '#fff' }} placeholder="email@domain.com" readOnly={Boolean(form.customerId)} disabled={form.status && form.status !== 'Draft'} />
                        </Field>
                        <Field label="GSTIN">
                            <input value={form.customerGstin} onChange={e => setF('customerGstin', e.target.value)} style={{ ...inp, background: form.customerId ? '#f9fafb' : '#fff' }} placeholder="e.g. 27XXXXX..." readOnly={Boolean(form.customerId)} disabled={form.status && form.status !== 'Draft'} />
                        </Field>
                        <Field label="State">
                            <input value={form.customerState} onChange={e => setF('customerState', e.target.value)} style={{ ...inp, background: form.customerId ? '#f9fafb' : '#fff' }} placeholder="Maharashtra" readOnly={Boolean(form.customerId)} disabled={form.status && form.status !== 'Draft'} />
                        </Field>
                        <Field label="State Code">
                            <input value={form.customerStateCode} onChange={e => setF('customerStateCode', e.target.value)} style={{ ...inp, background: form.customerId ? '#f9fafb' : '#fff' }} placeholder="27" readOnly={Boolean(form.customerId)} disabled={form.status && form.status !== 'Draft'} />
                        </Field>
                        <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Billing Address">
                                <textarea value={form.billingAddress} onChange={e => setF('billingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical', background: form.customerId ? '#f9fafb' : '#fff' }} readOnly={Boolean(form.customerId)} disabled={form.status && form.status !== 'Draft'} />
                            </Field>
                            <Field label="Shipping Address">
                                <textarea value={form.shippingAddress} onChange={e => setF('shippingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical', background: form.customerId ? '#f9fafb' : '#fff' }} readOnly={Boolean(form.customerId)} disabled={form.status && form.status !== 'Draft'} />
                            </Field>
                        </div>
                        <Field label="Customer PO Date"><input type="date" value={form.customerPODate || ''} onChange={e => setF('customerPODate', e.target.value)} style={inp} disabled={form.status && form.status !== 'Draft'} /></Field>
                        <Field label="Payment Type">
                            <select value={form.paymentType} onChange={e => setF('paymentType', e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={form.status && form.status !== 'Draft'}>
                                <option>Credit</option><option>Cash</option>
                            </select>
                        </Field>
                        <Field label="Credit Period (Days)">
                            <input value={form.creditPeriod} readOnly style={{ ...inp, background: '#f9fafb', color: '#6b7280', fontWeight: 'bold' }} />
                        </Field>
                    </Grid>
                </Section>

                <Section title="Production Details">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                            <thead><tr>
                                {['Sr', 'Item Code *', 'Description', 'Additional Notes', 'HSN Code', 'UOM', 'Qty *', 'Rate *', 'Amount', ''].map(h => <th key={h} style={{ ...th, minWidth: h === 'Qty *' ? '150px' : 'auto' }}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {form.items.map((item, i) => {
                                    const amt = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ ...td, color: '#9ca3af', width: 36 }}>{i + 1}</td>
                                            <td style={{ ...td, minWidth: 140 }}>
                                                <SearchableSelect
                                                    options={allItems.map(it => ({ value: it._id, label: it.itemName, meta: it.itemCode }))}
                                                    value={item.itemId}
                                                    onChange={v => handleItemSelect(v, i)}
                                                    onKeyDown={(e) => handleRowKeyDown(e, i, 1)}
                                                    data-row={i}
                                                    data-col={1}
                                                    placeholder="Item Code..."
                                                    noOptionsMessage={
                                                        <div style={{ padding: '8px', color: '#64748b' }}>
                                                            No saleable products found.
                                                            <br />
                                                            <span style={{ fontSize: '11px' }}>
                                                                Check <strong>Finished Good</strong> or <strong>Manufacturable</strong> status in Item Master.
                                                            </span>
                                                        </div>
                                                    }
                                                />
                                            </td>
                                            <td style={{ ...td, minWidth: 160 }}>
                                                <input value={item.description || item.itemName || ''} readOnly style={{ ...inp, background: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' }} placeholder="Description" tabIndex="-1" />
                                            </td>
                                            <td style={{ ...td, minWidth: 120 }}><input value={item.additionalNotes} onChange={e => setItem(i, 'additionalNotes', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 3)} data-row={i} data-col={3} style={inp} autoComplete="off" /></td>
                                            <td style={{ ...td, width: 90 }}><input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 4)} data-row={i} data-col={4} style={inp} autoComplete="off" /></td>
                                            <td style={{ ...td, width: 70 }}><input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 5)} data-row={i} data-col={5} style={inp} autoComplete="off" /></td>
                                            <td style={{ ...td, minWidth: '120px' }}><input type="number" min="0" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 6)} data-row={i} data-col={6} style={{ ...tableInp, textAlign: 'center', fontSize: 12, fontWeight: 'bold', borderColor: !item.qty ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" className="no-spin" /></td>
                                            <td style={{ ...td, width: 90 }}><input type="number" min="0" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 7)} data-row={i} data-col={7} style={{ ...tableInp, textAlign: 'right', borderColor: !item.rate ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" className="no-spin" /></td>

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
                                    {gstApplicable && (
                                        <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <span>GST%</span>
                                            <input type="number" min="0" max="28" value={form.freightGstRate} onChange={e => setF('freightGstRate', e.target.value)} style={{ ...inp, width: 45, padding: '4px 4px', fontSize: 10 }} placeholder="%" title="Freight GST %" disabled={form.status && form.status !== 'Draft'} />
                                        </div>
                                    )}
                                    <span style={{ fontWeight: 600, color: '#4b5563', minWidth: 60, textAlign: 'right' }}>₹{freight.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#374151', fontWeight: 700, borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 4 }}>
                                <span>Total Taxable</span>
                                <span>₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {gstApplicable && (
                                <>
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4b5563', paddingTop: 4, fontWeight: 600 }}>
                                        <span>Total Tax</span>
                                        <span>₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </>
                            )}
                            {!gstApplicable && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#f59e0b', paddingTop: 4, fontWeight: 700 }}>
                                    <span>TAX MODE</span>
                                    <span>WITHOUT GST</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, color: '#16a34a', fontWeight: 800, padding: '12px 0 0', borderTop: '2px solid #16a34a' }}>
                                <span>Rounded Total</span>
                                <span>₹{roundedTotal.toLocaleString('en-IN')}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 4, textAlign: 'right' }}>{numberToWords(roundedTotal)}</div>
                        </div>
                    </Section>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, padding: '20px 0', borderTop: '1px solid #e5e7eb' }}>
                    <button onClick={() => { if (window.confirm('Discard changes and return to list?')) navigate(PATHS.SALES.ORDERS); }} style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 14 }}>Cancel</button>
                    {(!form.status || form.status === 'Draft') && (
                        <button onClick={() => handleSubmit('Draft')} disabled={saving} style={{ padding: '10px 24px', background: '#fff', color: '#0d9488', border: '1px solid #0d9488', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                            {saving ? 'Saving...' : isEdit ? 'Save Draft' : 'Save as Draft'}
                        </button>
                    )}
                    {(isEdit || form.id) && (form.status === 'Draft' || form.status === 'Confirmed') && (
                        <button onClick={() => handleSubmit('Confirmed')} disabled={saving} style={{ padding: '10px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                            {saving ? 'Processing...' : form.status === 'Draft' ? '✓ Submit Order' : '✓ Update Order'}
                        </button>
                    )}
                </div>
            </div>


        </div>
    );
}

