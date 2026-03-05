import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPurchaseOrder, getPurchaseOrderById, updatePurchaseOrder } from '@/services/purchaseApi';
import { getSuppliers } from '@/services/purchaseApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const label = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 };

const EMPTY_ITEM = { itemId: '', itemName: '', itemCode: '', description: '', uom: 'NOS', orderedQty: 1, rate: 0, discountPercent: 0, taxPercent: 18, itemGroup: '' };

const fmt = (n) => parseFloat((n || 0).toFixed(2));

export default function PurchaseOrderFormPage() {
    const { id } = useParams();
    const isEdit = !!id;
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [suppliers, setSuppliers] = useState([]);
    const [items, setItems] = useState([]);

    const [header, setHeader] = useState({
        supplierId: '', poDate: new Date().toISOString().split('T')[0],
        gstType: 'CGST / SGST', paymentTerms: '30 Days',
        expectedDeliveryDate: '', warehouse: '',
        supplierAddress: '', supplierGstNumber: '',
        transporterName: '', vehicleNo: '', lrNumber: '',
        freightAmount: 0, freightGstRate: 0,
    });
    const [lineItems, setLineItems] = useState([{ ...EMPTY_ITEM }]);
    const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }));

    const handleSupplierChange = (supplierId) => {
        setH('supplierId', supplierId);
        if (supplierId) {
            const supplier = suppliers.find(s => s._id === supplierId);
            if (supplier) {
                const addr = [supplier.address, supplier.city, supplier.state, supplier.pincode].filter(Boolean).join(', ');
                setHeader(h => ({
                    ...h,
                    supplierId,
                    gstType: supplier.gstType || 'CGST / SGST',
                    paymentTerms: supplier.paymentTerms || h.paymentTerms,
                    supplierAddress: addr,
                    supplierGstNumber: supplier.gstNumber || '',
                }));
            }
        } else {
            setHeader(h => ({
                ...h,
                supplierId: '',
                gstType: 'CGST / SGST',
                paymentTerms: '30 Days',
                supplierAddress: '',
                supplierGstNumber: '',
            }));
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [supData, itemData] = await Promise.all([
                    getSuppliers({ limit: 200 }),
                    getItems({ limit: 500, sortBy: 'itemName:asc' })
                ]);
                setSuppliers(supData.suppliers || []);
                const itemsList = Array.isArray(itemData.data) ? itemData.data : [];
                setItems(itemsList);

                if (isEdit) {
                    const po = await getPurchaseOrderById(id);
                    setHeader({
                        poNumber: po.poNumber,
                        supplierId: po.supplierId?._id || po.supplierId,
                        poDate: po.poDate ? po.poDate.split('T')[0] : '',
                        gstType: po.gstType || 'CGST / SGST',
                        paymentTerms: po.paymentTerms || '',
                        expectedDeliveryDate: po.expectedDeliveryDate ? po.expectedDeliveryDate.split('T')[0] : '',
                        warehouse: po.warehouse || '',
                        supplierAddress: po.supplierAddress || '',
                        supplierGstNumber: po.supplierGstNumber || '',
                        transporterName: po.transporterName || '',
                        vehicleNo: po.vehicleNo || '',
                        lrNumber: po.lrNumber || '',
                        freightAmount: po.freightAmount || 0,
                        freightGstRate: po.freightGstRate || 0,
                    });
                    setLineItems(po.items.map(i => ({
                        itemId: i.itemId?._id || i.itemId,
                        itemName: i.itemName,
                        itemCode: i.itemCode,
                        description: i.description,
                        uom: i.uom,
                        orderedQty: i.orderedQty,
                        rate: i.rate,
                        discountPercent: i.discountPercent || 0,
                        taxPercent: i.taxPercent || 18,
                        itemGroup: i.componentCategory || ''
                    })));
                }
            } catch (err) {
                toast.error('Failed to load data');
            } finally {
                setLoading(false);
            }
        };
        loadInitialData();
    }, [id, isEdit]);

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
                updated.itemGroup = found.itemGroupName || '';
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
                freightAmount: Number(header.freightAmount) || 0,
                freightGstRate: Number(header.freightGstRate) || 0,
                items: lineItems.map(i => ({
                    itemId: i.itemId, itemCode: i.itemCode, itemName: i.itemName,
                    description: i.description, uom: i.uom,
                    orderedQty: Number(i.orderedQty) || 0, rate: Number(i.rate) || 0,
                    discountPercent: Number(i.discountPercent) || 0, taxPercent: Number(i.taxPercent) || 0,
                    componentCategory: i.itemGroup || '',
                })),
            };
            let result;
            if (isEdit) {
                await updatePurchaseOrder(id, payload);
                toast.success('Purchase Order updated!');
                result = { _id: id };
            } else {
                result = await createPurchaseOrder(payload);
                toast.success(`Purchase Order ${result.poNumber} created!`);
            }
            navigate(PATHS.PURCHASE.ORDER_DETAIL(result?._id));
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
                <h1 style={{ margin: '0 0 24px', fontSize: '22px', fontWeight: 700 }}>
                    {isEdit ? '✎ Edit Purchase Order' : '🛒 New Purchase Order'}
                </h1>
                {loading ? <div style={{ color: '#94a3b8' }}>Loading order data...</div> : (

                    <form onSubmit={handleSubmit}>
                        {/* PO Header */}
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
                            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#94a3b8' }}>ORDER DETAILS</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                                {isEdit && header.poNumber && (
                                    <div>
                                        <span style={label}>PO Number</span>
                                        <input value={header.poNumber} style={{ ...inp, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontWeight: 700 }} readOnly />
                                    </div>
                                )}
                                <div style={{ gridColumn: isEdit && header.poNumber ? 'span 1' : 'span 2' }}>
                                    <span style={label}>Supplier *</span>
                                    <select value={header.supplierId} onChange={e => handleSupplierChange(e.target.value)} style={{ ...inp, cursor: 'pointer' }} required>
                                        <option value="">— Select Supplier —</option>
                                        {suppliers.map(s => <option key={s._id} value={s._id}>{s.supplierName} ({s.supplierCode})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <span style={label}>PO Date *</span>
                                    <input type="date" value={header.poDate} onChange={e => setH('poDate', e.target.value)} style={inp} required />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <span style={label}>Supplier Address</span>
                                    <input value={header.supplierAddress} style={{ ...inp, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }} readOnly placeholder="Address will show once supplier is selected" />
                                </div>
                                <div>
                                    <span style={label}>Supplier GST Number</span>
                                    <input value={header.supplierGstNumber} style={{ ...inp, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }} readOnly placeholder="GST Number" />
                                </div>
                                <div>
                                    <span style={label}>Expected Delivery</span>
                                    <input type="date" value={header.expectedDeliveryDate} onChange={e => setH('expectedDeliveryDate', e.target.value)} style={inp} />
                                </div>
                                <div>
                                    <span style={label}>Payment Terms</span>
                                    <input value={header.paymentTerms} onChange={e => setH('paymentTerms', e.target.value)} style={inp} placeholder="e.g. 30 Days, COD" />
                                </div>
                                <div>
                                    <span style={label}>Warehouse / Store</span>
                                    <input value={header.warehouse} onChange={e => setH('warehouse', e.target.value)} style={inp} placeholder="Store location" />
                                </div>
                            </div>
                        </div>

                        {/* Transportation & Freight */}
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
                            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#94a3b8' }}>🚚 TRANSPORTATION & FREIGHT</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                                <div>
                                    <span style={label}>Transporter Name</span>
                                    <input value={header.transporterName} onChange={e => setH('transporterName', e.target.value)} style={inp} placeholder="e.g. Blue Dart" />
                                </div>
                                <div>
                                    <span style={label}>Vehicle No</span>
                                    <input value={header.vehicleNo} onChange={e => setH('vehicleNo', e.target.value)} style={inp} placeholder="e.g. GJ01AB1234" />
                                </div>
                                <div>
                                    <span style={label}>LR / Bilty No</span>
                                    <input value={header.lrNumber} onChange={e => setH('lrNumber', e.target.value)} style={inp} placeholder="LR Number" />
                                </div>
                                <div>
                                    <span style={label}>Freight Amount (₹)</span>
                                    <input type="number" min="0" step="0.01" value={header.freightAmount} onChange={e => setH('freightAmount', e.target.value)} style={inp} />
                                </div>
                                <div>
                                    <span style={label}>GST on Freight</span>
                                    <select value={header.freightGstRate} onChange={e => setH('freightGstRate', Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
                                        <option value={0}>0% (Exempt)</option>
                                        <option value={5}>5% GST</option>
                                        <option value={12}>12% GST</option>
                                        <option value={18}>18% GST</option>
                                    </select>
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
                                            {['#', 'Item', 'Group', 'UOM', 'Qty', 'Rate', 'Disc%', 'Tax%', 'Amount', ''].map(h => (
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
                                                        <input value={item.itemGroup} onChange={e => setItem(i, 'itemGroup', e.target.value)} placeholder="Item Group" style={{ ...inp, fontSize: '12px' }} />
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                        <span>Subtotal</span><span>₹{totals.subTotal.toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                        <span>Discount (−)</span><span>₹{totals.discount.toLocaleString()}</span>
                                    </div>
                                    {header.gstType === 'IGST' ? (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                            <span>IGST (+)</span><span>₹{totals.tax.toLocaleString()}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                                <span>CGST (+)</span><span>₹{fmt(totals.tax / 2).toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                                <span>SGST (+)</span><span>₹{fmt(totals.tax / 2).toLocaleString()}</span>
                                            </div>
                                        </>
                                    )}
                                    <div style={{ borderTop: '1px solid #334155', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px', color: '#10b981' }}>
                                        <span>Grand Total</span><span>₹{totals.grand.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => navigate(-1)}
                                style={{ padding: '10px 20px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}
                                style={{ padding: '10px 24px', borderRadius: '8px', background: saving ? '#334155' : '#fff', color: saving ? '#fff' : '#0f172a', border: '1px solid #334155', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                {saving ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? '💾 Update Purchase Order' : '📤 Create Purchase Order')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
