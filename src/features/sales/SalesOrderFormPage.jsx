import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSalesOrder, getSalesOrderById, updateSalesOrder, getInvoiceSeries, getInvoiceSeriesById, previewNextInvoiceNo } from '@/services/salesApi';
import { getCustomers, searchCustomers, getCustomer } from '@/services/customerApi';
import { getItems } from '@/services/itemApi';
import { getStickers } from '@/services/stickerApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { numberToWords } from '@/utils/numberToWords';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';


const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const tableInp = { padding: '7px 4px', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111827', fontWeight: 600, textAlign: 'center' };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };

const BLANK_ITEM = () => ({ itemId: null, itemCode: '', itemName: '', modelNo: '', additionalNotes: '', hsnCode: '', uom: 'NOS', qty: '', rate: '', gstRate: 18 });

const normalizeSeriesId = (seriesId) => {
    if (!seriesId) return '';
    if (typeof seriesId === 'object' && seriesId._id) return String(seriesId._id);
    return String(seriesId);
};

const mergeSeriesList = (list, extra) => {
    const base = list || [];
    if (!extra) return base;
    const id = String(extra._id || extra);
    if (base.some(s => String(s._id) === id)) return base;
    return [...base, {
        _id: extra._id || id,
        seriesName: extra.seriesName || 'Current series',
        prefix: extra.prefix || '',
        gstApplicable: extra.gstApplicable,
        isActive: extra.isActive,
    }];
};

/** Resolve saved series for edit — id, populated object, or prefix match on order number */
const resolveOrderSeries = async (so, activeList) => {
    let seriesId = normalizeSeriesId(so.seriesId);
    let seriesDoc = so.seriesId && typeof so.seriesId === 'object' && so.seriesId.seriesName
        ? so.seriesId
        : null;

    if (seriesId && !seriesDoc) {
        try {
            seriesDoc = await getInvoiceSeriesById(seriesId);
        } catch {
            seriesDoc = null;
        }
    }

    if (!seriesId && activeList?.length) {
        const num = String(so.soNumber || '');
        let matched = [...activeList]
            .filter(s => s.prefix && num.startsWith(s.prefix))
            .sort((a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0))[0];
        if (!matched && so.seriesName) {
            const snap = String(so.seriesName).trim().toLowerCase();
            matched = activeList.find(s => String(s.seriesName || '').trim().toLowerCase() === snap);
        }
        if (matched) {
            seriesId = String(matched._id);
            seriesDoc = matched;
        }
    }

    if (!seriesId && so.seriesName) {
        seriesDoc = {
            _id: '',
            seriesName: so.seriesName,
            prefix: '',
            gstApplicable: so.gstApplicable !== false,
            isActive: false,
        };
    }

    return { seriesId, seriesDoc };
};

/** Draft / Confirmed without invoice — series can be changed on edit */
const canChangeSeriesOnEdit = (form) => {
    if (form.invoiceId) return false;
    const status = form.status || 'Draft';
    return status === 'Draft' || status === 'Confirmed';
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
    const [loading, setLoading] = useState(isEdit);
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
        referralDetails: {
            sourceType: 'Direct',
            salespersonId: null,
            distributorId: null,
            incentiveApplicable: false,
            incentiveType: 'Percentage of sales',
            incentiveValue: 0,
        },
        items: [BLANK_ITEM()],
    });

    const [customerOptions, setCustomerOptions] = useState([]);
    const [seriesList, setSeriesList] = useState([]);
    const [originalSeriesId, setOriginalSeriesId] = useState('');
    const [previewSONo, setPreviewSONo] = useState('');
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

        // Pre-load items: ALL items in 'Finished Goods' category for Sales Orders
        // This includes all groups like Drivers, Dimmers, etc. as long as category is Finished Goods
        getItems({ limit: 5000, active: true, itemCategory: 'FINISHED_GOOD' }).then(res => {
            const list = res?.data || res?.results || res || [];
            if (Array.isArray(list)) {
                // Strict category filtering to include all finished goods variations
                const finishedVariations = ['FINISHED_GOOD', 'FINISHED', 'FINISHED GOOD', 'FINISHED GOODS'];
                const filtered = list.filter(i => 
                    finishedVariations.includes((i.itemCategory || '').trim().toUpperCase())
                );
                // Sort by creation date descending to show new items first
                const sorted = [...filtered].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                setAllItems(sorted);
            }
        }).catch(e => {
            console.error('❌ [SalesOrder] Error loading items:', e);
            toast.error('Failed to load items list');
        });

        getStickers().then(res => {
            if (Array.isArray(res)) setStickerOptions(res.map(s => s.name));
        }).catch(e => console.error('Error loading stickers:', e));

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
                customerName: val,
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

    const handleCustomerSelect = async (c) => {
        console.log('🎯 [SelectionTrace] Selected:', c.name, 'Sticker:', c.sticker, 'Trace:', c.backend_trace);
        if (!c.backend_trace) console.warn('⚠️ [SelectionTrace] WARNING: Missing backend_trace! Server might be stale.');
        
        try {
            // Fetch full customer details to get referral info
            const fullCustomer = await getCustomer(c.id || c._id);
            setForm(p => ({
                ...p,
                customerName: c.name || c.company || c.customerName || '',
                customerCode: c.customerCode || '',
                customerPhone: c.phone || '',
                customerEmail: c.email || '',
                customerGstin: c.gstin || '',
                customerState: c.state || '',
                customerStateCode: c.stateCode || '',
                billingAddress: c.billingAddress || '',
                shippingAddress: c.shippingAddress || c.billingAddress || '',
                gstType: c.gstType || p.gstType,
                customerId: c.id || c._id,
                creditPeriod: c.creditPeriod || 0,
                paymentType: c.paymentType || (c.creditPeriod > 0 ? 'Credit' : 'Cash'),
                stickerType: c.sticker || '',
                referralDetails: fullCustomer.referralDetails || {
                    sourceType: 'Direct',
                    salespersonId: null,
                    distributorId: null,
                    incentiveApplicable: false,
                    incentiveType: 'Percentage of sales',
                    incentiveValue: 0,
                },
            }));
        } catch (error) {
            toast.error('Failed to load full customer details');
            // Fallback to what we have
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
                paymentType: c.paymentType || (c.creditPeriod > 0 ? 'Credit' : 'Cash'),
                stickerType: c.sticker || '',
            }));
        }
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

    const fetchPreviewSONo = async (seriesId) => {
        if (!seriesId) { setPreviewSONo(''); return; }
        try {
            const res = await previewNextInvoiceNo(seriesId, 'SalesOrder');
            setPreviewSONo(res?.nextInvoiceNo || '');
        } catch {
            setPreviewSONo('');
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (isEdit && id) {
                    const [list, so] = await Promise.all([
                        getInvoiceSeries({ active: true }),
                        getSalesOrderById(id),
                    ]);
                    if (cancelled) return;
                    const { seriesId, seriesDoc } = await resolveOrderSeries(so, list || []);
                    const mergedList = mergeSeriesList(list || [], seriesDoc);
                    setSeriesList(mergedList);
                    setOriginalSeriesId(seriesId);
                    setPreviewSONo('');
                    const { seriesId: _popSeries, ...soRest } = so;
                    setForm({
                        ...soRest,
                        seriesId,
                        seriesName: seriesDoc?.seriesName || so.seriesName || '',
                        gstApplicable: seriesDoc?.gstApplicable !== false ? (so.gstApplicable !== false) : false,
                        soDate: so.soDate ? so.soDate.slice(0, 10) : '',
                        deliveryDate: so.deliveryDate ? so.deliveryDate.slice(0, 10) : '',
                        customerPODate: so.customerPODate ? so.customerPODate.slice(0, 10) : '',
                        items: so.items?.length ? so.items : [BLANK_ITEM()],
                    });
                } else if (!isEdit) {
                    const list = (await getInvoiceSeries({ active: true })) || [];
                    if (cancelled) return;
                    setSeriesList(list);
                    const def = list.find(x => x.isDefaultForSalesOrder);
                    if (def) {
                        setForm(p => ({
                            ...p,
                            seriesId: String(def._id),
                            gstApplicable: def.gstApplicable !== undefined ? def.gstApplicable : true,
                        }));
                    } else {
                        toast.error('Please set default series in Series Master.', { id: 'so-no-default' });
                    }
                    setCustHighlightIndex(-1);
                    setShowCustDropdown(false);
                }
            } catch {
                if (isEdit) toast.error('Failed to load sales order');
            } finally {
                if (isEdit && !cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
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
        if (!form.customerId) return toast.error('Please select customer from the list or create new customer.');
        if (!form.seriesId) return toast.error('Please select an Invoice Series.');
        if (form.orderCategory === 'Replacement' && !form.warrantyDetails?.trim()) return toast.error('Please enter Warranty Details for Replacement order.');
        if (form.items.some(i => !i.itemName || !i.qty || !i.rate)) return toast.error('All items need name, qty, and rate');
        setSaving(true);
        try {
            const selectedSeries = seriesList.find(s => String(s._id) === normalizeSeriesId(form.seriesId));
            const payload = {
                ...form,
                seriesId: normalizeSeriesId(form.seriesId) || form.seriesId,
                seriesName: selectedSeries?.seriesName || form.seriesName || '',
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
                {loading ? <BrandedLoader size={120} /> : (
                <>
                {form.status && form.status !== 'Draft' && (
                    <div style={{ background: '#ecfdf5', color: '#065f46', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🔒</span>
                        <span>This order is <strong>{form.status}</strong>. General details are locked, but items can still be updated.</span>
                    </div>
                )}
                <Section title="Order Information">
                    <Grid cols={4}>
                        {isEdit && (
                            <Field label="Order Number">
                                <input value={form.soNumber || ''} readOnly style={{ ...inp, background: '#f9fafb', fontWeight: 700, color: '#2563eb' }} />
                            </Field>
                        )}
                        <Field label="Invoice Series *">
                            <select
                                value={normalizeSeriesId(form.seriesId)}
                                onChange={async e => {
                                    const val = e.target.value;
                                    const s = seriesList.find(x => String(x._id) === String(val));
                                    const isGst = s ? (s.gstApplicable !== false) : true;
                                    if (isEdit && val && val !== originalSeriesId && canChangeSeriesOnEdit(form)) {
                                        await fetchPreviewSONo(val);
                                    } else {
                                        setPreviewSONo('');
                                    }
                                    setForm(p => ({
                                        ...p,
                                        seriesId: val,
                                        gstApplicable: isGst,
                                        items: p.items.map(item => ({
                                            ...item,
                                            gstRate: isGst ? (item.gstRate || 18) : 0
                                        })),
                                        freightGstRate: isGst ? (p.freightGstRate || 18) : 0
                                    }));
                                }}
                                style={{
                                    ...inp,
                                    cursor: isEdit && !canChangeSeriesOnEdit(form) ? 'not-allowed' : 'pointer',
                                    borderColor: !form.seriesId ? '#fca5a5' : '#d1d5db',
                                    fontWeight: isEdit ? 700 : 400,
                                }}
                                disabled={isEdit && !canChangeSeriesOnEdit(form)}
                            >
                                <option value="">-- Select Invoice Series --</option>
                                {seriesList.map(s => (
                                    <option key={String(s._id)} value={String(s._id)}>
                                        {s.seriesName} ({s.prefix || ''})
                                    </option>
                                ))}
                            </select>
                            {isEdit && form.seriesId && (() => {
                                const cur = seriesList.find(s => String(s._id) === normalizeSeriesId(form.seriesId));
                                return cur ? (
                                    <div style={{ fontSize: 11, color: '#374151', marginTop: 4, fontWeight: 600 }}>
                                        Saved series: <span style={{ color: '#0d9488' }}>{cur.seriesName}</span>
                                        {cur.prefix ? ` (${cur.prefix})` : ''}
                                        {cur.isActive === false ? ' — inactive' : ''}
                                    </div>
                                ) : null;
                            })()}
                            {form.seriesId && !form.gstApplicable && (
                                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span>⚠️</span> This series is non-GST. Tax will not be applied.
                                </div>
                            )}
                            {isEdit && canChangeSeriesOnEdit(form) && form.seriesId && form.seriesId !== originalSeriesId && previewSONo && (
                                <div style={{ fontSize: 11, color: '#0d9488', fontWeight: 700, marginTop: 6 }}>
                                    New number on save: <span style={{ fontFamily: 'monospace' }}>{previewSONo}</span>
                                </div>
                            )}
                            {isEdit && !form.seriesId && form.seriesName && (
                                <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700, marginTop: 6 }}>
                                    Original series was <strong>{form.seriesName}</strong> — select it from the list above and save.
                                </div>
                            )}
                            {isEdit && !canChangeSeriesOnEdit(form) && (
                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                                    {form.invoiceId
                                        ? 'Series cannot be changed — order is linked to an invoice.'
                                        : 'Series cannot be changed for this status.'}
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
                                    onFocus={() => form.customerName && setShowCustDropdown(true)} 
                                    onBlur={() => setTimeout(() => setShowCustDropdown(false), 200)}
                                    style={inp}
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
                                                    onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(c); }}
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
                                            onMouseDown={(e) => { e.preventDefault(); navigate(PATHS.CUSTOMERS + '/new'); }}
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
                        <Field label="Customer PO No">
                            <input value={form.customerPO || ''} onChange={e => setF('customerPO', e.target.value)} style={inp} placeholder="e.g. PO/2026/001" disabled={form.status && form.status !== 'Draft'} />
                        </Field>
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
                    <div style={{ position: 'relative' }}>
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
                                                    options={allItems.map(it => ({ 
                                                        value: it._id, 
                                                        label: `${it.itemCode} — ${it.itemName || ''}`, 
                                                        meta: `${it.itemCode} ${it.itemName || ''} ${it.description || ''} ${it.hsnCode || ''}`
                                                    }))}
                                                    value={item.itemId}
                                                    onChange={v => handleItemSelect(v, i)}
                                                    onKeyDown={(e) => handleRowKeyDown(e, i, 1)}
                                                    data-row={i}
                                                    data-col={1}
                                                    placeholder="Item Code..."
                                                    noOptionsMessage={
                                                        <div style={{ padding: '8px', color: '#64748b' }}>
                                                            {allItems.length === 0 ? "Loading products..." : "No matching items found."}
                                                            <br />
                                                            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>
                                                                Only items with category <strong>Finished Goods</strong> are allowed in Sales Orders.
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
                    <Section title="Sales / Referral & Remarks">
                        <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                            <label style={{ fontSize: '11px', color: '#0d9488', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Incentive Tracking</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '11px' }}>
                                <div><strong>Source:</strong> {form.referralDetails?.sourceType}</div>
                                <div><strong>Applicable:</strong> {form.referralDetails?.incentiveApplicable ? 'Yes' : 'No'}</div>
                                {form.referralDetails?.incentiveApplicable && (
                                    <div style={{ gridColumn: 'span 2', color: '#16a34a', fontWeight: 600 }}>
                                        {form.referralDetails.incentiveType}: {form.referralDetails.incentiveValue}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ marginTop: 0 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Remarks</label><textarea value={form.remarks} onChange={e => setF('remarks', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical' }} placeholder="Any remarks..." disabled={form.status && form.status !== 'Draft'} /></div>
                    </Section>
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
                </>
                )}
            </div>


        </div>
    );
}

