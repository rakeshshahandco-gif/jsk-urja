import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPurchaseOrder, getPurchaseOrderById, updatePurchaseOrder } from '@/services/purchaseApi';
import { getSuppliers } from '@/services/purchaseApi';
import { getStickers as getStickerList } from '@/services/stickerApi';
import { getItems } from '@/services/itemApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui';
import { ArrowUp, ArrowDown } from 'lucide-react';


const inp = { padding: '9px 12px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '7px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' };
const label = { fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em' };

const EMPTY_ITEM = { itemId: '', itemName: '', itemCode: '', description: '', hsnCode: '', uom: 'NOS', orderedQty: 1, rate: 0, discountPercent: 0, taxPercent: 18, itemGroup: '', additionalNotes: '' };

const fmt = (n) => parseFloat((n || 0).toFixed(2));

let globalIsSubmitting = false;

export default function PurchaseOrderFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id;
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [suppliers, setSuppliers] = useState([]);
    const [items, setItems] = useState([]);
    const [stickerOptions, setStickerOptions] = useState([]);

    const [header, setHeader] = useState({
        supplierId: '', poDate: new Date().toISOString().split('T')[0],
        gstType: 'CGST / SGST', paymentTerms: '30 Days',
        expectedDeliveryDate: '', warehouse: '',
        supplierAddress: '', supplierGstNumber: '',
        transporterName: '', vehicleNo: '', lrNumber: '',
        freightAmount: 0, freightGstRate: 0,
        stickerType: ''
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
                    supplierState: supplier.state || '',
                    supplierContact: supplier.phone || '',
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
                const [supData, itemData, stickRes] = await Promise.all([
                    getSuppliers({ limit: 200 }),
                    getItems({ limit: 5000, sortBy: 'itemName:asc' }),
                    getStickerList().catch(() => [])
                ]);
                setSuppliers(supData.suppliers || []);
                if (Array.isArray(stickRes)) setStickerOptions(stickRes.map(s => s.name));
                const itemsList = Array.isArray(itemData.data) ? itemData.data : [];
                // Sort by latest created first
                const sorted = [...itemsList].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                setItems(sorted);

                if (isEdit) {
                    const po = await getPurchaseOrderById(id);
                    setHeader({
                        poNumber: po.poNumber,
                        status: po.status,
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
                        stickerType: po.stickerType || ''
                    });
                    setLineItems(po.items.map(i => ({
                        itemId: i.itemId?._id || i.itemId,
                        itemName: i.itemName,
                        itemCode: i.itemCode,
                        hsnCode: i.hsnCode || '',
                        description: i.description,
                        uom: i.uom,
                        orderedQty: i.orderedQty,
                        rate: i.rate,
                        discountPercent: i.discountPercent || 0,
                        taxPercent: i.taxPercent || 18,
                        itemGroup: i.componentCategory || '',
                        additionalNotes: i.additionalNotes || ''
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
                updated.hsnCode = found.hsnCode || '';
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
        return {
            itemTaxable: fmt(acc.itemTaxable + c.net),
            itemTax: fmt(acc.itemTax + c.tax),
            discount: fmt(acc.discount + c.disc)
        };
    }, { itemTaxable: 0, itemTax: 0, discount: 0 });

    const freight = Number(header.freightAmount) || 0;
    const freightGstRate = Number(header.freightGstRate) || (lineItems[0]?.taxPercent || 18);
    const freightTax = fmt(freight * freightGstRate / 100);

    const totalTaxable = fmt(totals.itemTaxable + freight);
    const totalTax = fmt(totals.itemTax + freightTax);
    const grandTotal = fmt(totalTaxable + totalTax);

    // ── Keyboard Navigation ───────────────────────────────────────────────
    const handleRowKeyDown = (e, rowIdx, colIdx) => {
        if (e.key === 'ArrowDown') {
            const next = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="${colIdx}"]`);
            if (next) {
                e.preventDefault();
                next.focus();
            } else if (rowIdx === lineItems.length - 1 && lineItems[rowIdx].itemId) {
                addItem();
            }
        } else if (e.key === 'ArrowUp') {
            const prev = document.querySelector(`[data-row="${rowIdx - 1}"][data-col="${colIdx}"]`);
            if (prev) {
                e.preventDefault();
                prev.focus();
            }
        } else if (e.key === 'Enter') {
            const nextColTargets = [1, 2, 3, 4, 5, 6, 7];
            const currentTargetIdx = nextColTargets.indexOf(colIdx);
            
            if (currentTargetIdx < nextColTargets.length - 1) {
                const nextCol = document.querySelector(`[data-row="${rowIdx}"][data-col="${nextColTargets[currentTargetIdx + 1]}"]`);
                if (nextCol) {
                    e.preventDefault();
                    nextCol.focus();
                }
            } else {
                if (rowIdx < lineItems.length - 1) {
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

    const handleSubmit = async (e) => {

        e.preventDefault();
        if (saving || globalIsSubmitting) return;
        
        if (!header.supplierId) return toast.error('Please select a supplier');
        if (lineItems.some(i => !i.itemId)) return toast.error('Please select item for all rows');

        globalIsSubmitting = true;
        setSaving(true);
        try {
            const payload = {
                ...header,
                status: isEdit ? header.status : 'Ordered',
                freightAmount: Number(header.freightAmount) || 0,
                freightGstRate: Number(header.freightGstRate) || (lineItems[0]?.taxPercent || 18),
                stickerType: header.stickerType || '',
                items: lineItems.map(i => ({
                    itemId: i.itemId, itemCode: i.itemCode, itemName: i.itemName,
                    description: i.description, hsnCode: i.hsnCode || '', uom: i.uom,
                    orderedQty: Number(i.orderedQty) || 0, rate: Number(i.rate) || 0,
                    discountPercent: Number(i.discountPercent) || 0, taxPercent: Number(i.taxPercent) || 0,
                    componentCategory: i.itemGroup || '',
                    additionalNotes: i.additionalNotes || '',
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
            setTimeout(() => { globalIsSubmitting = false; }, 2000); // release lock after navigation
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to create PO');
            globalIsSubmitting = false;
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.PURCHASE.ORDERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Back to Purchase Orders
                </button>
                <h1 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                    {isEdit ? '✎ Edit Purchase Order' : '🛒 New Purchase Order'}
                </h1>
                {loading ? <BrandedLoader size={120} /> : (

                    <form onSubmit={handleSubmit} style={{ pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.7 : 1 }}>
                        <fieldset disabled={saving} style={{ border: 'none', padding: 0, margin: 0 }}>
                        {/* PO Header */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <h2 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ORDER DETAILS</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                                {isEdit && header.poNumber && (
                                    <div>
                                        <span style={label}>PO Number</span>
                                        <input value={header.poNumber} style={{ ...inp, background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#64748b', fontWeight: 700 }} readOnly />
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
                                    <input value={header.supplierAddress} style={{ ...inp, background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#64748b' }} readOnly placeholder="Address will show once supplier is selected" />
                                </div>
                                <div>
                                    <span style={label}>Supplier GST Number</span>
                                    <input value={header.supplierGstNumber} style={{ ...inp, background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#64748b' }} readOnly placeholder="GST Number" />
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
                                <div>
                                    <span style={label}>Sticker Type</span>
                                    <select value={header.stickerType} onChange={e => setH('stickerType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                        <option value="">-- No Sticker --</option>
                                        {stickerOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Transportation & Freight */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <h2 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🚚 TRANSPORTATION & FREIGHT</h2>
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
                            </div>
                        </div>

                        {/* Line Items */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ITEMS</h2>
                                <button type="button" onClick={addItem} style={{ padding: '6px 14px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Row</button>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                            {['#', 'Item', 'Group', 'Additional Notes', 'HSN/SAC', 'UOM', 'Qty', 'Rate', 'Amount', ''].map(h => (
                                                <th key={h} style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: h === 'Qty' ? '80px' : h === 'UOM' ? '100px' : 'auto' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineItems.map((item, i) => {
                                            const c = calcRow(item);
                                            return (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px 10px', color: '#475569', width: '30px' }}>{i + 1}</td>
                                                    <td style={{ padding: '8px 10px', minWidth: '200px' }}>
                                                        <SearchableSelect
                                                            options={items.map(it => ({ 
                                                                value: it._id, 
                                                                label: `${it.itemCode} — ${it.itemName || ''}`, 
                                                                meta: `${it.itemCode} ${it.itemName || ''} ${it.description || ''} ${it.hsnCode || ''}` 
                                                            }))}
                                                            value={item.itemId}
                                                            onChange={v => setItem(i, 'itemId', v)}
                                                            onKeyDown={(e) => handleRowKeyDown(e, i, 1)}
                                                            data-row={i}
                                                            data-col={1}
                                                            placeholder="— Search Item —"
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px 10px', minWidth: '120px' }}>
                                                        <input value={item.itemGroup} onChange={e => setItem(i, 'itemGroup', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 2)} data-row={i} data-col={2} placeholder="Item Group" style={{ ...inp, fontSize: '12px' }} />
                                                    </td>
                                                    <td style={{ padding: '8px 10px', minWidth: '150px' }}>
                                                        <input value={item.additionalNotes} onChange={e => setItem(i, 'additionalNotes', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 3)} data-row={i} data-col={3} placeholder="Additional Notes" style={{ ...inp, fontSize: '12px' }} />
                                                    </td>
                                                    <td style={{ padding: '8px 10px', width: '100px' }}>
                                                        <input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 4)} data-row={i} data-col={4} placeholder="HSN/SAC" style={{ ...inp, fontSize: '12px' }} />
                                                    </td>
                                                    <td style={{ padding: '8px 10px', width: '100px' }}>
                                                        <input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 5)} data-row={i} data-col={5} style={{ ...inp, fontSize: '12px' }} />
                                                    </td>
                                                    <td style={{ padding: '8px 10px', minWidth: '80px' }}>
                                                        <input type="number" min="0.01" step="0.01" value={item.orderedQty} onChange={e => setItem(i, 'orderedQty', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 6)} data-row={i} data-col={6} style={{ ...inp, fontSize: '12px', fontWeight: 'bold' }} />
                                                    </td>
                                                    <td style={{ padding: '8px 10px', minWidth: '140px' }}>
                                                        <input type="number" min="0" step="0.01" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 7)} data-row={i} data-col={7} style={{ ...inp, fontSize: '13px', fontWeight: 'bold' }} />
                                                    </td>


                                                    <td style={{ padding: '8px 10px', color: '#059669', fontWeight: 700, whiteSpace: 'nowrap' }}>₹{c.total.toLocaleString()}</td>
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
                                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px 24px', border: '1px solid #e2e8f0', minWidth: '320px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                        <span>Item Taxable Amount</span>
                                        <span style={{ color: '#1e293b', fontWeight: 600 }}>₹{totals.itemTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px', color: '#64748b', padding: '4px 0' }}>
                                        <span>Freight / Shipping</span>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <input type="number" min="0" step="0.01" value={header.freightAmount} onChange={e => setH('freightAmount', e.target.value)} style={{ ...inp, width: '70px', padding: '4px 8px' }} placeholder="Amt" title="Freight Amount" />
                                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>@</span>
                                                <input type="number" min="0" max="100" value={header.freightGstRate || (lineItems[0]?.taxPercent || 18)} onChange={e => setH('freightGstRate', e.target.value)} style={{ ...inp, width: '45px', padding: '4px 4px', textAlign: 'center' }} placeholder="%" title="Freight GST %" />
                                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>%</span>
                                            </div>
                                            <span style={{ color: '#1e293b', fontWeight: 600, minWidth: '70px', textAlign: 'right' }}>₹{freight.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', padding: '8px 0', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>
                                        <span>Total Taxable</span>
                                        <span>₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>

                                    {header.gstType === 'IGST' ? (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                            <span>IGST (+)</span>
                                            <span style={{ color: '#1e293b', fontWeight: 600 }}>₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                                <span>CGST (+)</span>
                                                <span style={{ color: '#1e293b', fontWeight: 600 }}>₹{fmt(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                                <span>SGST (+)</span>
                                                <span style={{ color: '#1e293b', fontWeight: 600 }}>₹{fmt(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#4b5563', fontWeight: 600, borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                                        <span>Total Tax Amount</span>
                                        <span>₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div style={{ borderTop: '2px solid #059669', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '20px', color: '#059669' }}>
                                        <span>Grand Total</span>
                                        <span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }}
                                style={{ padding: '10px 24px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}
                                style={{ padding: '10px 28px', borderRadius: '8px', background: saving ? '#cbd5e1' : '#2563eb', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }}>
                                {saving ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? '💾 Update Purchase Order' : '📤 Create Purchase Order')}
                            </button>
                        </div>
                        </fieldset>
                    </form>
                )}
            </div>


        </div>
    );
}

