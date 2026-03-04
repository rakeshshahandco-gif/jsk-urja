import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSalesOrder, getSalesOrderById, updateSalesOrder } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const COMPANY = { name: 'JSK URJA', state: 'Maharashtra', stateCode: '27', gstin: '' };
const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };

const BLANK_ITEM = () => ({ itemName: '', modelNo: '', additionalNotes: '', hsnCode: '', uom: 'NOS', qty: '', rate: '', gstRate: 18 });

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
        }
    }, [id]);

    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const setItem = (i, k, v) => setForm(p => {
        const items = [...p.items];
        items[i] = { ...items[i], [k]: v };
        if (k === 'qty' || k === 'rate') {
            items[i].amount = (Number(items[i].qty) || 0) * (Number(items[i].rate) || 0);
        }
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
    const totalAmount = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const totalGst = processedItems.reduce((s, i) => s + (i.cgstAmt || 0) * (isIGST ? 0 : 2) + (i.igstAmt || 0), 0);
    const freight = Number(form.freightAmount) || 0;
    const grandTotal = totalAmount + totalGst + freight;
    const roundedTotal = Math.round(grandTotal);

    const handleSubmit = async () => {
        if (!form.customerName) return toast.error('Customer name is required');
        if (form.items.some(i => !i.itemName || !i.qty || !i.rate)) return toast.error('All items need name, qty, and rate');
        setSaving(true);
        try {
            const payload = { ...form, items: form.items.map(i => ({ ...i, qty: Number(i.qty), rate: Number(i.rate), gstRate: Number(i.gstRate) || 18 })) };
            if (isEdit) { await updateSalesOrder(id, payload); toast.success('Updated!'); navigate(PATHS.SALES.ORDER_DETAIL(id)); }
            else { const so = await createSalesOrder(payload); toast.success('Sales Order created!'); navigate(PATHS.SALES.ORDER_DETAIL(so._id)); }
        } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
        finally { setSaving(false); }
    };

    const Section = ({ title, children }) => (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>{title}</h3>
            {children}
        </div>
    );
    const Grid = ({ cols = 3, children }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>;
    const Field = ({ label: l, children }) => <div><label style={label}>{l}</label>{children}</div>;

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => navigate(PATHS.SALES.ORDERS)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Orders</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{isEdit ? 'Edit Sales Order' : '📋 New Sales Order'}</h1>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => navigate(PATHS.SALES.ORDERS)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 13 }}>Cancel</button>
                        <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                            {saving ? 'Saving...' : isEdit ? '✓ Update' : '✓ Create Sales Order'}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px 28px', maxWidth: 1100, margin: '0 auto' }}>
                {/* Order Info */}
                <Section title="Order Information">
                    <Grid cols={3}>
                        <Field label="Order Date"><input type="date" value={form.soDate || ''} onChange={e => setF('soDate', e.target.value)} style={inp} /></Field>
                        <Field label="Order Category">
                            <select value={form.orderCategory} onChange={e => setF('orderCategory', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                <option>Order</option><option>Sample</option><option>Replacement</option>
                            </select>
                        </Field>
                        <Field label="Delivery Date"><input type="date" value={form.deliveryDate || ''} onChange={e => setF('deliveryDate', e.target.value)} style={inp} /></Field>
                        <Field label="Payment Type">
                            <select value={form.paymentType} onChange={e => setF('paymentType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                <option>Credit</option><option>Cash</option>
                            </select>
                        </Field>
                        <Field label="GST Type">
                            <select value={form.gstType} onChange={e => setF('gstType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                <option>CGST / SGST</option><option>IGST</option>
                            </select>
                        </Field>
                        <div style={{ gridColumn: 'span 1' }}></div>
                        <Field label="Remarks" ><textarea value={form.remarks} onChange={e => setF('remarks', e.target.value)} style={{ ...inp, height: 56, resize: 'vertical', gridColumn: 'span 3' }} placeholder="Any remarks..." /></Field>
                    </Grid>
                </Section>

                {/* Customer Info */}
                <Section title="Customer Details">
                    <Grid cols={3}>
                        <Field label="Customer Name *"><input value={form.customerName} onChange={e => setF('customerName', e.target.value)} style={inp} placeholder="Customer / Company Name" /></Field>
                        <Field label="Phone"><input value={form.customerPhone} onChange={e => setF('customerPhone', e.target.value)} style={inp} placeholder="+91 XXXXXXXXXX" /></Field>
                        <Field label="Email"><input value={form.customerEmail} onChange={e => setF('customerEmail', e.target.value)} style={inp} placeholder="email@domain.com" /></Field>
                        <Field label="GSTIN"><input value={form.customerGstin} onChange={e => setF('customerGstin', e.target.value)} style={inp} placeholder="27XXXXX..." /></Field>
                        <Field label="State"><input value={form.customerState} onChange={e => setF('customerState', e.target.value)} style={inp} placeholder="Maharashtra" /></Field>
                        <Field label="State Code"><input value={form.customerStateCode} onChange={e => setF('customerStateCode', e.target.value)} style={inp} placeholder="27" /></Field>
                        <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Billing Address"><textarea value={form.billingAddress} onChange={e => setF('billingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical' }} /></Field>
                            <Field label="Shipping Address"><textarea value={form.shippingAddress} onChange={e => setF('shippingAddress', e.target.value)} style={{ ...inp, height: 70, resize: 'vertical' }} /></Field>
                        </div>
                        <Field label="Customer PO No."><input value={form.customerPO} onChange={e => setF('customerPO', e.target.value)} style={inp} /></Field>
                        <Field label="Customer PO Date"><input type="date" value={form.customerPODate || ''} onChange={e => setF('customerPODate', e.target.value)} style={inp} /></Field>
                    </Grid>
                </Section>

                {/* Items Table */}
                <Section title="Order Items">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                            <thead><tr>
                                {['Sr', 'Product Name *', 'Model No', 'Notes', 'HSN Code', 'UOM', 'Qty *', 'Rate *', 'GST%', 'Amount', ''].map(h => <th key={h} style={th}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {form.items.map((item, i) => {
                                    const amt = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ ...td, color: '#9ca3af', width: 36 }}>{i + 1}</td>
                                            <td style={{ ...td, minWidth: 160 }}><input value={item.itemName} onChange={e => setItem(i, 'itemName', e.target.value)} style={{ ...inp, borderColor: !item.itemName ? '#fca5a5' : '#d1d5db' }} placeholder="Product name" /></td>
                                            <td style={{ ...td, minWidth: 100 }}><input value={item.modelNo} onChange={e => setItem(i, 'modelNo', e.target.value)} style={inp} /></td>
                                            <td style={{ ...td, minWidth: 120 }}><input value={item.additionalNotes} onChange={e => setItem(i, 'additionalNotes', e.target.value)} style={inp} /></td>
                                            <td style={{ ...td, width: 90 }}><input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} style={inp} /></td>
                                            <td style={{ ...td, width: 70 }}><input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} style={inp} /></td>
                                            <td style={{ ...td, width: 80 }}><input type="number" min="0" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} style={{ ...inp, borderColor: !item.qty ? '#fca5a5' : '#d1d5db' }} /></td>
                                            <td style={{ ...td, width: 90 }}><input type="number" min="0" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} style={{ ...inp, borderColor: !item.rate ? '#fca5a5' : '#d1d5db' }} /></td>
                                            <td style={{ ...td, width: 70 }}><input type="number" min="0" max="28" value={item.gstRate} onChange={e => setItem(i, 'gstRate', e.target.value)} style={inp} /></td>
                                            <td style={{ ...td, color: '#16a34a', fontWeight: 700, width: 100, whiteSpace: 'nowrap' }}>₹{amt.toLocaleString('en-IN')}</td>
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
                    <Section title="Freight / Charges">
                        <Grid cols={2}>
                            <Field label="Freight Amount"><input type="number" min="0" value={form.freightAmount} onChange={e => setF('freightAmount', e.target.value)} style={inp} placeholder="0" /></Field>
                            <Field label="Freight GST%"><input type="number" min="0" max="28" value={form.freightGstRate} onChange={e => setF('freightGstRate', e.target.value)} style={inp} placeholder="0" /></Field>
                        </Grid>
                    </Section>
                    <Section title="Order Summary">
                        <div style={{ display: 'grid', gap: 6 }}>
                            {[['Total Amount', `₹${totalAmount.toLocaleString('en-IN')}`], ['GST (' + form.gstType + ')', `₹${totalGst.toLocaleString('en-IN')}`], ['Freight', `₹${freight.toLocaleString('en-IN')}`], ['Rounded Total', `₹${roundedTotal.toLocaleString('en-IN')}`]].map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: k === 'Rounded Total' ? '#16a34a' : '#6b7280', fontWeight: k === 'Rounded Total' ? 800 : 400, padding: k === 'Rounded Total' ? '8px 0 0' : '2px 0', borderTop: k === 'Rounded Total' ? '1px solid #e5e7eb' : 'none' }}>
                                    <span>{k}</span><span>{v}</span>
                                </div>
                            ))}
                            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 4 }}>{numWords(roundedTotal)}</div>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
