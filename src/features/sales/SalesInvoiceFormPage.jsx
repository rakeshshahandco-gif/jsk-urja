import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createSalesInvoice, getSalesOrderById, getInvoiceSeries, createInvoiceSeries, previewNextInvoiceNo } from '@/services/salesApi';
import { getItems } from '@/services/itemApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { PATHS } from '@/routes/paths';
import { numberToWords } from '@/utils/numberToWords';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown } from 'lucide-react';


const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const tableInp = { padding: '7px 4px', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111827', fontWeight: 600, textAlign: 'center' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };
const lbl = { fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' };

const BLANK_ITEM = () => ({
    itemId: '',
    itemCode: '',
    itemName: '',
    modelNo: '',
    description: '',
    additionalNotes: '',
    hsnCode: '',
    uom: 'NOS',
    qty: '',
    rate: '',
    gstRate: 18,
    discountPercent: 0
});

const Section = ({ title, children }) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>{title}</h3>
        {children}
    </div>
);
const Grid = ({ cols = 3, children }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>;
const Field = ({ label, children, style = {} }) => <div style={style}><label style={labelStyle}>{label}</label>{children}</div>;

const AddSeriesModal = ({ isOpen, onClose, onSave }) => {
    const [submitting, setSubmitting] = useState(false);
    const [data, setData] = useState({
        seriesName: '',
        financialYear: '2025-26',
        prefix: '',
        startNumber: 1,
        padLength: 5,
        gstApplicable: true,
        isDefault: false,
    });

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!data.seriesName || !data.financialYear || !data.prefix) return toast.error('Name, FY and Prefix are required');
        setSubmitting(true);
        try {
            const res = await createInvoiceSeries(data);
            toast.success('Series created!');
            onSave(res);
            onClose();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to create series');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 450, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>+ Create New Invoice Series</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Series Name *" style={{ gridColumn: 'span 2' }}>
                        <input value={data.seriesName} onChange={e => setData(p => ({ ...p, seriesName: e.target.value }))} style={inp} placeholder="e.g. GST/SALE" />
                    </Field>
                    <Field label="Prefix (Unique) *">
                        <input value={data.prefix} onChange={e => setData(p => ({ ...p, prefix: e.target.value }))} style={inp} placeholder="GST" />
                    </Field>
                    <Field label="Financial Year *">
                        <input value={data.financialYear} onChange={e => setData(p => ({ ...p, financialYear: e.target.value }))} style={inp} placeholder="2025-26" />
                    </Field>
                    <Field label="Start Number">
                        <input type="number" value={data.startNumber} onChange={e => setData(p => ({ ...p, startNumber: e.target.value }))} style={inp} />
                    </Field>
                    <Field label="Digits Padding">
                        <input type="number" value={data.padLength} onChange={e => setData(p => ({ ...p, padLength: e.target.value }))} style={inp} />
                    </Field>
                    <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 4 }}>
                        <input type="checkbox" checked={data.gstApplicable} onChange={e => setData(p => ({ ...p, gstApplicable: e.target.checked }))} style={{ width: 16, height: 16 }} />
                        <span style={{ fontWeight: 600 }}>GST Applicable (Enabled by default)</span>
                    </label>
                </div>
                <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { if (window.confirm('Discard changes?')) onClose(); }} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={handleSave} disabled={submitting} style={{ padding: '8px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>
                        {submitting ? 'Creating...' : 'ADD & CONTINUE'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function SalesInvoiceFormPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const soId = searchParams.get('soId');
    const [saving, setSaving] = useState(false);
    const [seriesList, setSeriesList] = useState([]);
    const [previewInvoiceNo, setPreviewInvoiceNo] = useState('');

    // Fetch accurate next invoice number from backend (self-healing sync)
    const fetchPreviewNo = async (seriesId) => {
        if (!seriesId) { setPreviewInvoiceNo(''); return; }
        try {
            const res = await previewNextInvoiceNo(seriesId, 'SalesInvoice');
            setPreviewInvoiceNo(res.nextInvoiceNo || '');
        } catch { setPreviewInvoiceNo(''); }
    };
    const [showAddSeries, setShowAddSeries] = useState(false);
    const [form, setForm] = useState({
        invoiceDate: new Date().toISOString().slice(0, 10),
        seriesId: '',
        soId: soId || '',
        soNumber: '',
        orderType: '',
        dispatchThrough: '',
        buyerOrderNo: '',
        buyerOrderDate: '',
        paymentDueDate: '',
        customerName: '',
        customerGstin: '',
        customerPhone: '',
        billingState: '',
        billingStateCode: '',
        shippingAddress: '',
        shippingCity: '',
        shippingState: '',
        shippingStateCode: '',
        shippingPostalCode: '',
        shippingCountry: 'India',
        shippingGstin: '',
        shippingPhone: '',
        gstType: 'CGST / SGST',
        placeOfSupply: '',
        paymentType: 'Credit',
        paymentTerms: '',
        gstApplicable: true,
        freightAmount: '',
        freightGstRate: 0,
        remarks: '',
        items: [BLANK_ITEM()],
    });

    const [allItems, setAllItems] = useState([]);

    useEffect(() => {
        // Pre-load all active items (inclusive of all saleable categories)
        getItems({ limit: 5000, active: true }).then(res => {
            const list = res?.data || res?.results || res || [];
            if (Array.isArray(list)) {
                // Sort by creation date descending to show new items first
                const sorted = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                setAllItems(sorted);
            }
        }).catch(e => console.error('Error loading items:', e));
    }, []);

    useEffect(() => {
        const state = (form.billingState || '').trim().toLowerCase();
        const code = (form.billingStateCode || '').trim();
        const isMH = state === 'maharashtra' || code === '27';
        const newGst = isMH ? 'CGST / SGST' : ((state || code) ? 'IGST' : form.gstType);
        if (newGst !== form.gstType) setF('gstType', newGst);
    }, [form.billingState, form.billingStateCode]);

    const loadSeries = useCallback(() => {
        getInvoiceSeries({ active: true }).then(async s => {
            setSeriesList(s || []);
            if (!form.seriesId && s && s.length > 0) {
                const autoSelect = s.find(x => x.isDefault) || s[0];
                setForm(p => ({ ...p, seriesId: autoSelect._id, gstApplicable: autoSelect.gstApplicable !== undefined ? autoSelect.gstApplicable : true }));
                await fetchPreviewNo(autoSelect._id);
            }
        }).catch(() => { });
    }, [form.seriesId]);

    useEffect(() => {
        loadSeries();
    }, [loadSeries]);

    useEffect(() => {
        if (!soId) return;
        getSalesOrderById(soId).then(so => {
            setForm(p => ({
                ...p,
                soId,
                soNumber: so.soNumber,
                customerName: so.customerName,
                customerGstin: so.customerGstin || '',
                customerPhone: so.customerPhone || '',
                billingAddress: so.billingAddress || '',
                billingState: so.customerState || '',
                billingStateCode: so.customerStateCode || '',
                shippingAddress: so.shippingAddress || '',
                gstType: so.gstType || 'CGST / SGST',
                gstApplicable: so.gstApplicable !== undefined ? so.gstApplicable : true,
                buyerOrderNo: so.customerPO || '',
                buyerOrderDate: so.customerPODate ? so.customerPODate.slice(0, 10) : '',
                paymentType: so.paymentType || 'Credit',
                remarks: so.remarks || '',
                freightAmount: so.freightAmount || '',
                freightGstRate: so.freightGstRate || 0,
                items: so.items?.length ? so.items.map(i => ({ 
                    itemId: i.itemId || null, 
                    itemCode: i.itemCode || i.code || i.sku || '', 
                    itemName: i.itemName || i.name || '', 
                    modelNo: i.modelNo || '', 
                    description: i.description || i.productDescription || i.itemName || i.name || '',
                    additionalNotes: i.additionalNotes || i.itemNotes || i.notes || i.addNotes || i.remark || '', 
                    hsnCode: i.hsnCode || '', 
                    uom: i.uom || 'NOS', 
                    qty: i.qty || '', 
                    rate: i.rate || '', 
                    gstRate: so.gstApplicable === false ? 0 : (i.gstRate || 18), 
                    discountPercent: 0 
                })) : [BLANK_ITEM()],
            }));
        }).catch(() => toast.error('Failed to load SO details'));
    }, [soId]);

    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const setItem = (i, k, v) => setForm(p => ({
        ...p,
        items: p.items.map((item, idx) => (idx === i ? { ...item, [k]: v } : item))
    }));
    const addItem = () => setForm(p => ({ ...p, items: [...p.items, BLANK_ITEM()] }));
    const removeItem = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

    const handleItemSelect = (val, index) => {
        const selected = allItems.find(it => it._id === val);
        if (!selected) return;
        setForm(p => {
            const items = p.items.map((item, idx) => {
                if (idx !== index) return item;
                const rate = selected.standardRate || selected.rate || selected.sellingPrice || selected.salesPrice || 0;
                return {
                    ...item,
                    itemId: selected._id,
                    itemCode: selected.itemCode || selected.code || '',
                    itemName: selected.itemName || selected.name || '',
                    description: selected.description || selected.productDescription || selected.itemName || selected.name || '',
                    modelNo: selected.modelNo || '',
                    hsnCode: selected.hsnCode || '',
                    uom: selected.uom || 'NOS',
                    rate,
                    gstRate: selected.taxRate || selected.salesGst || selected.gstRate || 18,
                    qty: item.qty || 1,
                    additionalNotes: item.additionalNotes || '',
                };
            });
            return { ...p, items };
        });
    };

    // Live totals
    const isIGST = form.gstType === 'IGST';
    const gstApplicable = form.gstApplicable !== false;

    const processedItems = form.items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const gross = qty * rate;
        const disc = Number(item.discountPercent) || 0;
        const discAmt = Math.round(gross * disc / 100 * 100) / 100;
        const taxable = gross - discAmt;
        const gstRate = gstApplicable ? (Number(item.gstRate) || 18) : 0;
        const cgstAmt = isIGST ? 0 : Math.round(taxable * gstRate / 2 / 100 * 100) / 100;
        const igstAmt = isIGST ? Math.round(taxable * gstRate / 100 * 100) / 100 : 0;
        return { ...item, gross, discAmt, taxable, cgstAmt, igstAmt, lineTotal: taxable + (gstApplicable ? (isIGST ? igstAmt : cgstAmt * 2) : 0) };
    });
    const totalItemTaxable = processedItems.reduce((s, i) => s + i.taxable, 0);
    const totalItemGst = gstApplicable ? processedItems.reduce((s, i) => s + (isIGST ? i.igstAmt : i.cgstAmt * 2), 0) : 0;

    const freight = Number(form.freightAmount) || 0;
    
    // Add freight to taxable amount
    const totalTaxable = totalItemTaxable + freight;

    // Use first item's GST rate if available, else default to 18
    const freightGstRate = gstApplicable ? (Number(form.freightGstRate) || (processedItems[0]?.gstRate || 18)) : 0;
    const freightGst = gstApplicable ? Math.round(freight * freightGstRate / 100 * 100) / 100 : 0;

    const totalGst = totalItemGst + freightGst;
    
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
                addItem();
            }
        } else if (e.key === 'ArrowUp') {
            const prev = document.querySelector(`[data-row="${rowIdx - 1}"][data-col="${colIdx}"]`);
            if (prev) {
                e.preventDefault();
                prev.focus();
            }
        } else if (e.key === 'Enter') {
            const nextColTargets = [1, 3, 4, 5, 6, 7, 8];
            const currentTargetIdx = nextColTargets.indexOf(colIdx);
            
            if (currentTargetIdx < nextColTargets.length - 1) {
                const nextCol = document.querySelector(`[data-row="${rowIdx}"][data-col="${nextColTargets[currentTargetIdx + 1]}"]`);
                if (nextCol) {
                    e.preventDefault();
                    nextCol.focus();
                }
            } else {
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

    const handleSubmit = async () => {

        if (!form.seriesId) return toast.error('⚠️ Please select an Invoice Series. The invoice number is generated from the selected series.');
        if (!form.customerName) return toast.error('Customer name is required');
        if (form.items.some(i => !i.itemName || !i.qty || !i.rate)) return toast.error('All items need name, qty, and rate');
        setSaving(true);
        try {
            const payload = {
                ...form,
                items: processedItems.map(i => ({
                    itemId: i.itemId,
                    itemCode: i.itemCode,
                    itemName: i.itemName,
                    modelNo: i.modelNo,
                    description: i.description,
                    additionalNotes: i.additionalNotes,
                    hsnCode: i.hsnCode,
                    uom: i.uom,
                    qty: Number(i.qty),
                    rate: Number(i.rate),
                    gstRate: Number(i.gstRate) || 18,
                    discountPercent: Number(i.discountPercent) || 0,
                    discountAmount: Number(i.discAmt) || 0,
                    taxableAmount: Number(i.taxable) || 0,
                    cgstRate: isIGST ? 0 : (Number(i.gstRate) || 18) / 2,
                    cgstAmount: Number(i.cgstAmt) || 0,
                    sgstRate: isIGST ? 0 : (Number(i.gstRate) || 18) / 2,
                    sgstAmount: Number(i.cgstAmt) || 0,
                    igstRate: isIGST ? (Number(i.gstRate) || 18) : 0,
                    igstAmount: Number(i.igstAmt) || 0,
                    totalAmount: Number(i.lineTotal) || 0,
                })),
                totalQty: form.items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0),
                subTotal: totalItemTaxable,
                totalTaxableAmount: totalTaxable,
                totalCgst: isIGST ? 0 : totalGst / 2,
                totalSgst: isIGST ? 0 : totalGst / 2,
                totalIgst: isIGST ? totalGst : 0,
                totalGst: totalGst,
                freightAmount: freight,
                freightGstAmount: freightGst,
                grandTotal: grandTotal,
                roundedTotal: roundedTotal,
                roundOff: Number((roundedTotal - grandTotal).toFixed(2)),
                amountInWords: numberToWords(roundedTotal)
            };
            const inv = await createSalesInvoice(payload);
            toast.success('Invoice created!');
            navigate(PATHS.SALES.INVOICE_DETAIL(inv._id));
        } catch (e) { toast.error(e.response?.data?.message || 'Create failed'); }
        finally { setSaving(false); }
    };


    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => navigate(PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Invoices</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🧾 New GST Tax Invoice</h1>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 13 }}>Cancel</button>
                        <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                            {saving ? 'Creating...' : '✓ Create Invoice'}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px 28px', maxWidth: 1200, margin: '0 auto' }}>
                {/* PRIMARY HEADER INFO (TALLY STYLE) */}
                <div style={{ background: '#fff', border: '1px solid #1e293b', borderLeft: '8px solid #0d9488', borderRadius: '8px 12px 12px 8px', padding: '20px', marginBottom: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                    <Field label="Invoice Series">
                        <div style={{ display: 'flex', gap: 6 }}>
                            <select value={form.seriesId} onChange={async e => {
                                const val = e.target.value;
                                const selected = seriesList.find(s => s._id === val);
                                const isGst = selected ? (selected.gstApplicable !== false) : true;
                                await fetchPreviewNo(val);
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
                                style={{ ...inp, cursor: 'pointer', fontWeight: 700, fontSize: 14, borderColor: !form.seriesId ? '#fca5a5' : '#1e293b' }}
                            >
                                <option value="">-- Select Series --</option>
                                {seriesList.map(s => <option key={s._id} value={s._id}>{s.seriesName} ({s.prefix})</option>)}
                            </select>
                            <button type="button" onClick={() => setShowAddSeries(true)} style={{ width: 32, height: 35, background: '#f8fafc', border: '1px solid #1e293b', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Add Series">＋</button>
                        </div>
                        {previewInvoiceNo && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: 18, fontWeight: 900, color: '#0d9488', fontFamily: 'monospace', background: '#f0fdfa', border: '2px solid #0d9488', padding: '6px 14px', borderRadius: 8, display: 'inline-block', boxShadow: '0 2px 4px rgba(13,148,136,0.1)' }}>
                                    NO: {previewInvoiceNo}
                                </div>
                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginLeft: 2 }}>System Generated Serial Number</span>
                            </div>
                        )}
                    </Field>
                    
                    <Field label="Invoice Date *">
                        <input type="date" value={form.invoiceDate} onChange={e => setF('invoiceDate', e.target.value)} style={{ ...inp, fontWeight: 700, fontSize: 14, border: '1px solid #1e293b' }} />
                    </Field>

                    <Field label="Customer (Buyer) *">
                        <input value={form.customerName} onChange={e => setF('customerName', e.target.value)} style={{ ...inp, fontWeight: 700, fontSize: 14, border: '1px solid #1e293b', borderColor: !form.customerName ? '#fca5a5' : '#1e293b' }} placeholder="Type Customer Name..." />
                        {form.customerGstin && <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontWeight: 600 }}>GSTIN: {form.customerGstin}</div>}
                    </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
                    {/* Secondary Details (Compact) */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Shipment & Payment Info</span>
                            {soId && <span style={{ fontSize: 10, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>SO: {form.soNumber}</span>}
                        </div>
                        <Grid cols={3}>
                            <Field label="Payment Type">
                                <select value={form.paymentType} onChange={e => setF('paymentType', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }}>
                                    <option>Credit</option><option>Cash</option>
                                </select>
                            </Field>
                            <Field label="Due Date"><input type="date" value={form.paymentDueDate || ''} onChange={e => setF('paymentDueDate', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} /></Field>
                            <Field label="Dispatch Thru"><input value={form.dispatchThrough} onChange={e => setF('dispatchThrough', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} placeholder="Road/Courier" /></Field>
                        </Grid>
                    </div>

                    {/* Address & GST (Compact) */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '15px' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Supply Details</span>
                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{form.gstType}</span>
                        </div>
                        <Grid cols={2}>
                            <Field label="GSTIN"><input value={form.customerGstin} onChange={e => setF('customerGstin', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} /></Field>
                            <Field label="State Code"><input value={form.billingStateCode} onChange={e => setF('billingStateCode', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} /></Field>
                        </Grid>
                    </div>
                </div>

                {/* Production Details */}
                <Section title="Production Details">
                    <div style={{ position: 'relative' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                            <thead>
                                <tr>
                                    {['Sr', 'Item Code', 'Description *', 'Additional Notes', 'HSN', 'UOM', 'Qty *', 'Rate *', 'Disc%', 'Amount', ''].filter(Boolean).map(h => <th key={h} style={{ ...th, minWidth: h === 'Qty *' ? '150px' : 'auto' }}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {processedItems.map((item, i) => (
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
                                            />
                                        </td>
                                        <td style={{ ...td, minWidth: 160 }}>
                                            <input value={item.description || item.itemName || ''} readOnly style={{ ...inp, background: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' }} placeholder="Description" tabIndex="-1" />
                                        </td>
                                        <td style={{ ...td, minWidth: 120 }}>
                                            <input value={item.additionalNotes} onChange={e => setItem(i, 'additionalNotes', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 3)} data-row={i} data-col={3} style={inp} placeholder="Additional Notes" autoComplete="off" />
                                        </td>
                                        <td style={{ ...td, width: 90 }}>
                                            <input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 4)} data-row={i} data-col={4} style={inp} placeholder="HSN" autoComplete="off" />
                                        </td>
                                        <td style={{ ...td, width: 70 }}>
                                            <input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 5)} data-row={i} data-col={5} style={inp} placeholder="UOM" autoComplete="off" />
                                        </td>
                                        <td style={{ ...td, minWidth: '120px' }}>
                                            <input type="number" min="0" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 6)} data-row={i} data-col={6} style={{ ...tableInp, textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderColor: !item.qty ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" className="no-spin" />
                                        </td>
                                        <td style={{ ...td, width: 90 }}>
                                            <input type="number" min="0" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 7)} data-row={i} data-col={7} style={{ ...tableInp, textAlign: 'right', borderColor: !item.rate ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" className="no-spin" />
                                        </td>
                                        <td style={{ ...td, width: 60 }}>
                                            <input type="number" min="0" max="100" value={item.discountPercent} onChange={e => setItem(i, 'discountPercent', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 8)} data-row={i} data-col={8} style={{ ...tableInp, textAlign: 'center' }} autoComplete="off" className="no-spin" />
                                        </td>

                                        <td style={{ ...td, color: '#16a34a', fontWeight: 600, width: 100, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            ₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ ...td, width: 36 }}>
                                            {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>✕</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button onClick={addItem} style={{ padding: '7px 16px', border: '1px dashed #0d9488', background: '#f0fdfa', borderRadius: 7, cursor: 'pointer', color: '#0d9488', fontSize: 13, fontWeight: 600 }}>+ Add Item</button>
                    </div>
                </Section>

                {/* Totals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Section title="Payment & Remarks">
                        <div style={{ marginTop: 0 }}><label style={lbl}>Payment Terms</label><input value={form.paymentTerms} onChange={e => setF('paymentTerms', e.target.value)} style={inp} placeholder="e.g. Net 30" /></div>
                        <div style={{ marginTop: 12 }}><label style={lbl}>Remarks</label><textarea value={form.remarks} onChange={e => setF('remarks', e.target.value)} style={{ ...inp, height: 56, resize: 'vertical' }} /></div>
                    </Section>
                    <Section title="Invoice Summary">
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280' }}>
                                <span>Total Item Amount</span>
                                <span style={{ fontWeight: 600 }}>₹{totalItemTaxable.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6b7280', padding: '4px 0' }}>
                                <span>+ Freight / Shipping</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input type="number" min="0" value={form.freightAmount} onChange={e => setF('freightAmount', e.target.value)} style={{ ...inp, width: 80, padding: '4px 8px' }} placeholder="Amt" title="Freight Amount" />
                                    <span style={{ fontWeight: 600, color: '#4b5563', minWidth: 60, textAlign: 'right' }}>₹{freight.toFixed(2)}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#374151', fontWeight: 700, borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 4 }}>
                                <span>Total Taxable Amount</span>
                                <span>₹{totalTaxable.toFixed(2)}</span>
                            </div>
                            {gstApplicable && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2563eb', paddingTop: 4 }}>
                                    <span>+ GST ({form.gstType})</span>
                                    <span>₹{totalGst.toFixed(2)}</span>
                                </div>
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
                        </div>
                    </Section>
                </div>
            </div>



            <AddSeriesModal

                isOpen={showAddSeries}
                onClose={() => setShowAddSeries(false)}
                onSave={(newSeries) => {
                    setSeriesList(p => [newSeries, ...p]);
                    setF('seriesId', newSeries._id);
                }}
            />
        </div>
    );
}
