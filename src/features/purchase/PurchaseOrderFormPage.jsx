import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPurchaseOrder } from '@/services/purchaseApi';
import { getSuppliers } from '@/services/purchaseApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const label = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 };

const EMPTY_ITEM = { itemId: '', itemName: '', itemCode: '', description: '', uom: 'NOS', orderedQty: 1, rate: 0, discountPercent: 0, taxPercent: 18, componentCategory: '' };

const fmt = (n) => parseFloat((n || 0).toFixed(2));

export default function PurchaseOrderFormPage() {
    const navigate = useNavigate();
    const [suppliers, setSuppliers] = useState([]);
    const [items, setItems] = useState([]);
    const [saving, setSaving] = useState(false);

    const [header, setHeader] = useState({
        supplierId: '', poDate: new Date().toISOString().split('T')[0],
        gstType: 'CGST / SGST', paymentTerms: '30 Days',
        expectedDeliveryDate: '', warehouse: '', remarks: '',
    });
    const [lineItems, setLineItems] = useState([{ ...EMPTY_ITEM }]);
    const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }));

    useEffect(() => {
        getSuppliers({ limit: 200 }).then(d => setSuppliers(d.suppliers || [])).catch(() => { });
        getItems({ limit: 500, sortBy: 'itemName:asc' }).then(d => setItems(Array.isArray(d.data) ? d.data : [])).catch(() => { });
    }, []);

    // Line item helpers
    const addItem = () => setLineItems(l => [...l, { ...EMPTY_ITEM }]);
    const removeItem = (i) => setLineItems(l => l.filter((_, idx) => idx !== i));
    const setItem = (i, k, v) => setLineItems(prev => prev.map((item, idx) => {
        if (idx !== i) return item;
        const updated = { ...item, [k]: v };
        if (k === 'itemId') {
            const found = items.find(it => it._id === v);
            if (found) {
                updated.itemName = found.itemName;
                updated.itemCode = found.itemCode;
                updated.uom = found.uom || 'NOS';
                updated.rate = found.purchaseRate || 0;
                updated.taxPercent = found.purchaseGst || 18;
            }
        }
        return updated;
    }));

    // Calculations
    const calcRow = (item) => {
        const gross = fmt(item.orderedQty * item.rate);
        const disc = fmt(gross * (item.discountPercent || 0) / 100);
        const net = fmt(gross - disc);
        const tax = fmt(net * (item.taxPercent || 0) / 100);
        return { gross, disc, net, tax, total: fmt(net + tax) };
    };

    const totals = lineItems.reduce((acc, item) => {
        const c = calcRow(item);
        return { subTotal: fmt(acc.subTotal + c.gross), discount: fmt(acc.discount + c.disc), tax: fmt(acc.tax + c.tax), grand: fmt(acc.grand + c.total) };
    }, { subTotal: 0, discount: 0, tax: 0, grand: 0 });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!header.supplierId) return toast.error('Please select a supplier');
        if (lineItems.some(i => !i.itemId)) return toast.error('Please select item for all rows');

        setSaving(true);
        try {
            const payload = {
                ...header,
                items: lineItems.map(i => ({
                    itemId: i.itemId, itemCode: i.itemCode, itemName: i.itemName,
                    description: i.description, uom: i.uom,
                    orderedQty: Number(i.orderedQty), rate: Number(i.rate),
                    discountPercent: Number(i.discountPercent), taxPercent: Number(i.taxPercent),
                    componentCategory: i.componentCategory,
                })),
            };
            const po = await createPurchaseOrder(payload);
            toast.success(`Purchase Order ${po.poNumber} created!`);
            navigate(PATHS.PURCHASE.ORDER_DETAIL(po._id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to create PO');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.PURCHASE.ORDERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}>
                    ← Purchase Orders
                </button>
                <h1 style={{ margin: '0 0 24px', fontSize: '22px', fontWeight: 700 }}>🛒 New Purchase Order</h1>

                <form onSubmit={handleSubmit}>
                    {/* PO Header */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
                        <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#94a3b8' }}>ORDER DETAILS</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <span style={label}>Supplier *</span>
                                <select value={header.supplierId} onChange={e => setH('supplierId', e.target.value)} style={{ ...inp, cursor: 'pointer' }} required>
                                    <option value="">— Select Supplier —</option>
                                    {suppliers.map(s => <option key={s._id} value={s._id}>{s.supplierName} ({s.supplierCode})</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={label}>PO Date *</span>
                                <input type="date" value={header.poDate} onChange={e => setH('poDate', e.target.value)} style={inp} required />
                            </div>
                            <div>
                                <span style={label}>Expected Delivery</span>
                                <input type="date" value={header.expectedDeliveryDate} onChange={e => setH('expectedDeliveryDate', e.target.value)} style={inp} />
                            </div>
                            <div>
                                <span style={label}>GST Type</span>
                                <select value={header.gstType} onChange={e => setH('gstType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    <option>CGST / SGST</option>
                                    <option>IGST</option>
                                </select>
                            </div>
                            <div>
                                <span style={label}>Payment Terms</span>
                                <input value={header.paymentTerms} onChange={e => setH('paymentTerms', e.target.value)} style={inp} placeholder="e.g. 30 Days, COD" />
                            </div>
                            <div>
                                <span style={label}>Warehouse / Store</span>
                                <input value={header.warehouse} onChange={e => setH('warehouse', e.target.value)} style={inp} placeholder="Store location" />
                            </div>
                            <div style={{ gridColumn: 'span 3' }}>
                                <span style={label}>Remarks</span>
                                <input value={header.remarks} onChange={e => setH('remarks', e.target.value)} style={inp} placeholder="Any special instructions..." />
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#94a3b8' }}>ITEMS</h2>
                            <button type="button" onClick={addItem} style={{ padding: '6px 14px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>+ Add Row</button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                        {['#', 'Item', 'Category', 'UOM', 'Qty', 'Rate', 'Disc%', 'Tax%', 'Amount', ''].map(h => (
                                            <th key={h} style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #334155' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.map((item, i) => {
                                        const c = calcRow(item);
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                                <td style={{ padding: '8px 10px', color: '#475569', width: '30px' }}>{i + 1}</td>
                                                <td style={{ padding: '8px 10px', minWidth: '200px' }}>
                                                    <select value={item.itemId} onChange={e => setItem(i, 'itemId', e.target.value)} style={{ ...inp, fontSize: '12px' }}>
                                                        <option value="">— Select Item —</option>
                                                        {items.map(it => <option key={it._id} value={it._id}>{it.itemName} ({it.itemCode})</option>)}
                                                    </select>
                                                </td>
                                                <td style={{ padding: '8px 10px', minWidth: '120px' }}>
                                                    <input value={item.componentCategory} onChange={e => setItem(i, 'componentCategory', e.target.value)} placeholder="IC/PCB/etc." style={{ ...inp, fontSize: '12px' }} />
                                                </td>
                                                <td style={{ padding: '8px 10px', width: '70px' }}>
                                                    <input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} style={{ ...inp, fontSize: '12px' }} />
                                                </td>
                                                <td style={{ padding: '8px 10px', width: '80px' }}>
                                                    <input type="number" min="0.01" step="0.01" value={item.orderedQty} onChange={e => setItem(i, 'orderedQty', e.target.value)} style={{ ...inp, fontSize: '12px' }} />
                                                </td>
                                                <td style={{ padding: '8px 10px', width: '90px' }}>
                                                    <input type="number" min="0" step="0.01" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} style={{ ...inp, fontSize: '12px' }} />
                                                </td>
                                                <td style={{ padding: '8px 10px', width: '70px' }}>
                                                    <input type="number" min="0" max="100" value={item.discountPercent} onChange={e => setItem(i, 'discountPercent', e.target.value)} style={{ ...inp, fontSize: '12px' }} />
                                                </td>
                                                <td style={{ padding: '8px 10px', width: '70px' }}>
                                                    <input type="number" min="0" value={item.taxPercent} onChange={e => setItem(i, 'taxPercent', e.target.value)} style={{ ...inp, fontSize: '12px' }} />
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#10b981', fontWeight: 700, whiteSpace: 'nowrap' }}>₹{c.total.toLocaleString()}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {lineItems.length > 1 && (
                                                        <button type="button" onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Summary */}
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '16px 24px', border: '1px solid #334155', minWidth: '280px' }}>
                                {[
                                    ['Subtotal', `₹${totals.subTotal.toLocaleString()}`],
                                    ['Discount (−)', `₹${totals.discount.toLocaleString()}`],
                                    ['Tax (+)', `₹${totals.tax.toLocaleString()}`],
                                ].map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                        <span>{k}</span><span>{v}</span>
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid #334155', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px', color: '#10b981' }}>
                                    <span>Grand Total</span><span>₹{totals.grand.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => navigate(PATHS.PURCHASE.ORDERS)}
                            style={{ padding: '10px 20px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: saving ? '#334155' : 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px' }}>
                            {saving ? 'Creating...' : '📤 Create Purchase Order'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
