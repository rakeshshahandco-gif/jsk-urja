import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createSalesInvoice, getSalesOrderById, getInvoiceSeries } from '@/services/salesApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };

const BLANK_ITEM = () => ({ itemName: '', modelNo: '', hsnCode: '', uom: 'NOS', qty: '', rate: '', gstRate: 18, discountPercent: 0 });

const Section = ({ title, children }) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>{title}</h3>
        {children}
    </div>
);
const G = ({ cols = 3, g = 12, children }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: g }}>{children}</div>;
const F = ({ label: l, children }) => <div><label style={lbl}>{l}</label>{children}</div>;

export default function SalesInvoiceFormPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const soId = searchParams.get('soId');
    const [saving, setSaving] = useState(false);
    const [seriesList, setSeriesList] = useState([]);
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
        billingAddress: '',
        billingState: '',
        billingStateCode: '',
        shippingAddress: '',
        gstType: 'CGST / SGST',
        placeOfSupply: '',
        paymentType: 'Credit',
        paymentTerms: '',
        freightAmount: '',
        freightGstRate: 0,
        remarks: '',
        items: [BLANK_ITEM()],
    });

    const [itemOptions, setItemOptions] = useState([]);
    const [activeItemRow, setActiveItemRow] = useState(null);
    const itemRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (activeItemRow !== null && itemRef.current && !itemRef.current.contains(e.target)) {
                setActiveItemRow(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeItemRow]);

    useEffect(() => {
        const state = (form.billingState || '').trim().toLowerCase();
        const code = (form.billingStateCode || '').trim();
        const isMH = state === 'maharashtra' || code === '27';
        const newGst = isMH ? 'CGST / SGST' : ((state || code) ? 'IGST' : form.gstType);
        if (newGst !== form.gstType) setF('gstType', newGst);
    }, [form.billingState, form.billingStateCode]);

    useEffect(() => {
        getInvoiceSeries({ active: true }).then(s => {
            setSeriesList(s || []);
            const def = (s || []).find(x => x.isDefault);
            if (def) setForm(p => ({ ...p, seriesId: def._id }));
        }).catch(() => { });
    }, []);

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
                buyerOrderNo: so.customerPO || '',
                buyerOrderDate: so.customerPODate ? so.customerPODate.slice(0, 10) : '',
                paymentType: so.paymentType || 'Credit',
                items: so.items?.length ? so.items.map(i => ({ itemName: i.itemName || '', modelNo: i.modelNo || '', hsnCode: i.hsnCode || '', uom: i.uom || 'NOS', qty: i.qty || '', rate: i.rate || '', gstRate: i.gstRate || 18, discountPercent: 0 })) : [BLANK_ITEM()],
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
                const rate = selected.standardRate || selected.rate || selected.sellingPrice || selected.salesPrice || 0;
                return {
                    ...item,
                    itemId: selected._id,
                    itemName: selected.itemName || selected.name || '',
                    modelNo: '',
                    hsnCode: selected.hsnCode || '',
                    uom: selected.uom || 'NOS',
                    rate,
                    gstRate: selected.taxRate || selected.salesGst || selected.gstRate || 18,
                };
            });
            return { ...p, items };
        });
        setActiveItemRow(null);
    };

    // Live totals
    const isIGST = form.gstType === 'IGST';
    const processedItems = form.items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const gross = qty * rate;
        const disc = Number(item.discountPercent) || 0;
        const discAmt = Math.round(gross * disc / 100 * 100) / 100;
        const taxable = gross - discAmt;
        const gstRate = Number(item.gstRate) || 18;
        const cgstAmt = isIGST ? 0 : Math.round(taxable * gstRate / 2 / 100 * 100) / 100;
        const igstAmt = isIGST ? Math.round(taxable * gstRate / 100 * 100) / 100 : 0;
        return { ...item, gross, discAmt, taxable, cgstAmt, igstAmt, lineTotal: taxable + (isIGST ? igstAmt : cgstAmt * 2) };
    });
    const totalItemTaxable = processedItems.reduce((s, i) => s + i.taxable, 0);
    const totalItemGst = processedItems.reduce((s, i) => s + (isIGST ? i.igstAmt : i.cgstAmt * 2), 0);

    const freight = Number(form.freightAmount) || 0;
    const freightGstRate = Number(form.freightGstRate) || (processedItems[0]?.gstRate || 18);
    const freightGst = Math.round(freight * freightGstRate / 100 * 100) / 100;

    const totalTaxable = totalItemTaxable + freight;
    const totalGst = totalItemGst + freightGst;
    const grandTotal = totalTaxable + totalGst;
    const roundedTotal = Math.round(grandTotal);

    const handleSubmit = async () => {
        if (!form.customerName) return toast.error('Customer name is required');
        if (form.items.some(i => !i.itemName || !i.qty || !i.rate)) return toast.error('All items need name, qty, and rate');
        setSaving(true);
        try {
            const payload = {
                ...form,
                items: form.items.map(i => ({ ...i, qty: Number(i.qty), rate: Number(i.rate), gstRate: Number(i.gstRate) || 18, discountPercent: Number(i.discountPercent) || 0 }))
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
                        <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 13 }}>Cancel</button>
                        <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                            {saving ? 'Creating...' : '✓ Create Invoice'}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px 28px', maxWidth: 1100, margin: '0 auto' }}>
                {/* Invoice Series + Dates */}
                <Section title="Invoice Details">
                    <G cols={4}>
                        <F label="Invoice Series *">
                            <select value={form.seriesId} onChange={e => setF('seriesId', e.target.value)} style={{ ...inp, cursor: 'pointer', borderColor: !form.seriesId ? '#fca5a5' : '#d1d5db' }}>
                                <option value="">-- Select Series --</option>
                                {seriesList.map(s => <option key={s._id} value={s._id}>{s.seriesName} ({s.prefix}NNNNN) {s.isDefault ? '✓ Default' : ''}</option>)}
                            </select>
                        </F>
                        <F label="Invoice Date *"><input type="date" value={form.invoiceDate} onChange={e => setF('invoiceDate', e.target.value)} style={inp} /></F>
                        <F label="Payment Type">
                            <select value={form.paymentType} onChange={e => setF('paymentType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                <option>Credit</option><option>Cash</option>
                            </select>
                        </F>
                        <F label="Linked SO">{soId ? <input value={form.soNumber} readOnly style={{ ...inp, background: '#f1f5f9', color: '#6b7280' }} /> : <input value={form.soNumber} onChange={e => setF('soNumber', e.target.value)} style={inp} placeholder="Optional SO Number" />}</F>
                        <F label="Order Type"><input value={form.orderType} onChange={e => setF('orderType', e.target.value)} style={inp} placeholder="e.g. Supply" /></F>
                        <F label="Dispatch Through"><input value={form.dispatchThrough} onChange={e => setF('dispatchThrough', e.target.value)} style={inp} placeholder="By Road / Courier" /></F>
                        <F label="Payment Due Date"><input type="date" value={form.paymentDueDate || ''} onChange={e => setF('paymentDueDate', e.target.value)} style={inp} /></F>
                    </G>
                </Section>

                {/* Buyer Details */}
                <Section title="Buyer Details">
                    <G cols={3}>
                        <F label="Customer Name *"><input value={form.customerName} onChange={e => setF('customerName', e.target.value)} style={{ ...inp, borderColor: !form.customerName ? '#fca5a5' : '#d1d5db' }} placeholder="Customer / Company Name" /></F>
                        <F label="GSTIN"><input value={form.customerGstin} onChange={e => setF('customerGstin', e.target.value)} style={inp} placeholder="27XXXXX..." /></F>
                        <F label="Phone"><input value={form.customerPhone} onChange={e => setF('customerPhone', e.target.value)} style={inp} /></F>
                        <F label="Billing State"><input value={form.billingState} onChange={e => setF('billingState', e.target.value)} style={inp} placeholder="Maharashtra" /></F>
                        <F label="State Code"><input value={form.billingStateCode} onChange={e => setF('billingStateCode', e.target.value)} style={inp} placeholder="27" /></F>
                        <F label="Place of Supply"><input value={form.placeOfSupply} onChange={e => setF('placeOfSupply', e.target.value)} style={inp} /></F>
                        <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <F label="Billing Address"><textarea value={form.billingAddress} onChange={e => setF('billingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical' }} /></F>
                            <F label="Shipping Address"><textarea value={form.shippingAddress} onChange={e => setF('shippingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical' }} /></F>
                        </div>
                        <F label="Buyer Order No"><input value={form.buyerOrderNo} onChange={e => setF('buyerOrderNo', e.target.value)} style={inp} /></F>
                        <F label="Buyer Order Date"><input type="date" value={form.buyerOrderDate || ''} onChange={e => setF('buyerOrderDate', e.target.value)} style={inp} /></F>
                    </G>
                </Section>

                {/* Items */}
                <Section title="Items">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                            <thead><tr>{['#', 'Product *', 'Model', 'HSN', 'UOM', 'Qty *', 'Rate *', 'Disc%', 'Taxable', isIGST ? 'IGST' : 'CGST+SGST', 'Line Total', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {processedItems.map((item, i) => (
                                    <tr key={i}>
                                        <td style={{ ...td, color: '#9ca3af', width: 28 }}>{i + 1}</td>
                                        <td style={{ ...td, minWidth: 140 }}>
                                            <div ref={activeItemRow === i ? itemRef : null} style={{ position: 'relative' }}>
                                                <input value={item.itemName} onChange={e => handleItemSearch(e.target.value, i)} onFocus={() => itemOptions.length && setActiveItemRow(i)} style={{ ...inp, borderColor: !item.itemName ? '#fca5a5' : '#d1d5db' }} placeholder="Search Item..." />
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
                                                                    <span>{it.modelNo || it.sku || ''}</span>
                                                                    <span>HSN: {it.hsnCode || '—'}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ ...td, minWidth: 90 }}><input value={item.modelNo} onChange={e => setItem(i, 'modelNo', e.target.value)} style={inp} /></td>
                                        <td style={{ ...td, width: 80 }}><input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} style={inp} /></td>
                                        <td style={{ ...td, width: 60 }}><input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} style={inp} /></td>
                                        <td style={{ ...td, width: 70 }}><input type="number" min="0" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} style={{ ...inp, borderColor: !item.qty ? '#fca5a5' : '#d1d5db' }} /></td>
                                        <td style={{ ...td, width: 80 }}><input type="number" min="0" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} style={{ ...inp, borderColor: !item.rate ? '#fca5a5' : '#d1d5db' }} /></td>
                                        <td style={{ ...td, width: 60 }}><input type="number" min="0" max="100" value={item.discountPercent} onChange={e => setItem(i, 'discountPercent', e.target.value)} style={inp} /></td>
                                        <td style={{ ...td, color: '#6b7280', width: 80, textAlign: 'right' }}>₹{item.taxable.toFixed(2)}</td>
                                        <td style={{ ...td, color: '#2563eb', width: 90, textAlign: 'right' }}>{isIGST ? `₹${item.igstAmt.toFixed(2)} (${item.gstRate}%)` : `₹${(item.cgstAmt * 2).toFixed(2)} (${item.gstRate}%)`}</td>
                                        <td style={{ ...td, color: '#16a34a', fontWeight: 700, width: 90, textAlign: 'right' }}>₹{item.lineTotal.toFixed(2)}</td>
                                        <td style={{ ...td, width: 28 }}>{form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>✕</button>}</td>
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
                                <span>Freight / Shipping</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input type="number" min="0" value={form.freightAmount} onChange={e => setF('freightAmount', e.target.value)} style={{ ...inp, width: 80, padding: '4px 8px' }} placeholder="Amt" title="Freight Amount" />
                                    <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <span>GST%</span>
                                        <input type="number" min="0" max="28" value={form.freightGstRate} onChange={e => setF('freightGstRate', e.target.value)} style={{ ...inp, width: 45, padding: '4px 4px', fontSize: 10 }} placeholder="%" title="Freight GST %" />
                                    </div>
                                    <span style={{ fontWeight: 600, color: '#4b5563', minWidth: 60, textAlign: 'right' }}>₹{freight.toFixed(2)}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#374151', fontWeight: 700, borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 4 }}>
                                <span>Total Taxable</span>
                                <span>₹{totalTaxable.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2563eb', paddingTop: 4 }}>
                                <span>GST ({form.gstType})</span>
                                <span>₹{totalGst.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, color: '#16a34a', fontWeight: 800, padding: '12px 0 0', borderTop: '2px solid #16a34a' }}>
                                <span>Rounded Total</span>
                                <span>₹{roundedTotal.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
