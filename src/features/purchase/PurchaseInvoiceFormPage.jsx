import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    createPurchaseInvoice, getSuppliers,
    getPurchaseOrders, getPurchaseOrderById,
    getGRNsByPO, getGRNsBySupplier, getGRNById
} from '@/services/purchaseApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const lbl = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 };
const r2 = (n) => Math.round((n || 0) * 100) / 100;

const FLOWS = [
    { key: 'PO→GRN→Invoice', label: 'PO → GRN → Invoice', desc: 'Standard flow. Invoice against a confirmed GRN.', icon: '📋' },
    { key: 'PO→Direct Invoice', label: 'PO → Direct Invoice', desc: 'Material received with invoice directly. No separate GRN needed.', icon: '⚡' },
    { key: 'Direct GRN→Invoice', label: 'GRN → Invoice (No PO)', desc: 'Urgent purchase done without PO. Invoice against existing GRN.', icon: '📦' },
    { key: 'Direct Invoice', label: 'Direct Invoice', desc: 'Small purchase. No PO, no GRN. Stock updates on invoice post.', icon: '🧾' },
];

const EMPTY_ROW = { itemId: '', itemName: '', itemCode: '', hsnCode: '', uom: 'NOS', qty: 1, rate: 0, discountPercent: 0, gstRate: 18, grnItemId: null, poItemId: null, maxQty: null };

export default function PurchaseInvoiceFormPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const prefillPoId = searchParams.get('poId') || '';
    const prefillGrnId = searchParams.get('grnId') || '';

    const [flowType, setFlowType] = useState('PO→GRN→Invoice');
    const [suppliers, setSuppliers] = useState([]);
    const [items, setItems] = useState([]);
    const [poList, setPoList] = useState([]);
    const [grnList, setGrnList] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loadingRef, setLoadingRef] = useState(false);

    const [header, setHeader] = useState({
        supplierId: '', invoiceDate: new Date().toISOString().split('T')[0],
        supplierInvoiceNo: '', selectedPoId: prefillPoId, selectedGrnId: prefillGrnId,
        supplierGstin: '', supplierAddress: '', supplierState: '', supplierStateCode: '',
        buyerName: 'JSK URJA', buyerGstin: '', buyerAddress: '', buyerState: 'Gujarat', buyerStateCode: '24',
        gstType: 'CGST / SGST', placeOfSupply: 'Gujarat', paymentTerms: '30 Days', remarks: '',
        transporterName: '', vehicleNo: '', lrNumber: '',
        freightAmount: 0, freightGstRate: 0,
    });
    const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
    const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }));

    useEffect(() => {
        getSuppliers({ limit: 200 }).then(d => setSuppliers(d.suppliers || [])).catch(() => { });
        getItems({ limit: 500, sortBy: 'itemName:asc' }).then(d => setItems(Array.isArray(d.data) ? d.data : [])).catch(() => { });
    }, []);

    // Load PO list when supplier + flow changes
    useEffect(() => {
        if (!header.supplierId) return;
        if (flowType === 'PO→GRN→Invoice' || flowType === 'PO→Direct Invoice') {
            getPurchaseOrders({ supplierId: header.supplierId, limit: 100 })
                .then(d => setPoList(d.orders || []))
                .catch(() => { });
        }
        if (flowType === 'Direct GRN→Invoice') {
            getGRNsBySupplier(header.supplierId)
                .then(d => setGrnList(Array.isArray(d) ? d : []))
                .catch(() => { });
        }
    }, [header.supplierId, flowType]);

    // Auto-fill supplier GST info
    const onSupplierChange = (supplierId) => {
        const s = suppliers.find(s => s._id === supplierId);
        setHeader(h => ({ ...h, supplierId, selectedPoId: '', selectedGrnId: '', supplierGstin: s?.gstNumber || '', supplierAddress: s?.address || s?.city || '', supplierState: s?.state || '' }));
        setRows([{ ...EMPTY_ROW }]);
        setPoList([]); setGrnList([]);
    };

    // Load rows from selected PO (Flow B) or GRN (Flow A & C)
    const onPoChange = useCallback(async (poId) => {
        setH('selectedPoId', poId);
        setRows([{ ...EMPTY_ROW }]);
        if (!poId) return;
        if (flowType === 'PO→Direct Invoice') {
            setLoadingRef(true);
            try {
                const po = await getPurchaseOrderById(poId);
                const poData = po.data || po;
                const newRows = (poData.items || [])
                    .filter(pi => pi.pendingQty > 0)
                    .map(pi => ({
                        itemId: pi.itemId?._id || pi.itemId,
                        itemName: pi.itemName,
                        itemCode: pi.itemCode,
                        hsnCode: pi.hsnCode || '',
                        uom: pi.uom,
                        qty: pi.pendingQty,
                        rate: pi.rate,
                        discountPercent: pi.discountPercent || 0,
                        gstRate: pi.taxPercent || 18,
                        maxQty: pi.pendingQty,
                        poItemId: pi._id,
                        grnItemId: null,
                    }));
                if (newRows.length) setRows(newRows); else toast.info('No pending items in this PO');
            } catch { toast.error('Failed to load PO items'); }
            finally { setLoadingRef(false); }
        } else if (flowType === 'PO→GRN→Invoice') {
            // Load GRNs for this PO
            setLoadingRef(true);
            try {
                const grns = await getGRNsByPO(poId);
                setGrnList(Array.isArray(grns) ? grns.filter(g => g.invoiceStatus !== 'Fully Invoiced') : []);
            } catch { toast.error('Failed to load GRNs'); }
            finally { setLoadingRef(false); }
        }
    }, [flowType]);

    const onGrnChange = useCallback(async (grnId) => {
        setH('selectedGrnId', grnId);
        setRows([{ ...EMPTY_ROW }]);
        if (!grnId) return;
        setLoadingRef(true);
        try {
            const grn = await getGRNById(grnId);
            const grnData = grn.data || grn;
            const newRows = (grnData.items || [])
                .map(gi => {
                    const avail = r2(gi.receivedQty - (gi.invoicedQty || 0));
                    return {
                        itemId: gi.itemId?._id || gi.itemId,
                        itemName: gi.itemName,
                        itemCode: gi.itemCode,
                        hsnCode: gi.hsnCode || '',
                        uom: gi.uom,
                        qty: avail,
                        rate: gi.rate,
                        discountPercent: 0,
                        gstRate: 18,
                        maxQty: avail,
                        grnItemId: gi._id,
                        poItemId: gi.poItemId || null,
                    };
                }).filter(r => r.maxQty > 0);
            if (newRows.length) setRows(newRows); else toast.info('No uninvoiced qty in this GRN');
        } catch { toast.error('Failed to load GRN items'); }
        finally { setLoadingRef(false); }
    }, []);

    // Row helpers
    const addRow = () => setRows(r => [...r, { ...EMPTY_ROW }]);
    const removeRow = (i) => setRows(r => r.filter((_, idx) => idx !== i));
    const setRow = (i, k, v) => setRows(prev => prev.map((row, idx) => {
        if (idx !== i) return row;
        const updated = { ...row, [k]: v };
        if (k === 'itemId') {
            const found = items.find(it => it._id === v);
            if (found) { updated.itemName = found.itemName; updated.itemCode = found.itemCode; updated.uom = found.uom || 'NOS'; updated.rate = found.purchaseRate || 0; updated.hsnCode = found.hsnCode || ''; updated.gstRate = found.purchaseGst || 18; }
        }
        return updated;
    }));

    // GST calculations
    const calcRow = (row) => {
        const gross = r2(row.qty * row.rate);
        const disc = r2(gross * (row.discountPercent || 0) / 100);
        const taxable = r2(gross - disc);
        const isIGST = header.gstType === 'IGST';
        const cgst = isIGST ? 0 : r2(taxable * (row.gstRate || 0) / 2 / 100);
        const sgst = isIGST ? 0 : r2(taxable * (row.gstRate || 0) / 2 / 100);
        const igst = isIGST ? r2(taxable * (row.gstRate || 0) / 100) : 0;
        return { gross, disc, taxable, cgst, sgst, igst, total: r2(taxable + cgst + sgst + igst) };
    };

    const isIGST = header.gstType === 'IGST';

    const totals = rows.reduce((acc, row) => {
        const c = calcRow(row);
        return { taxable: r2(acc.taxable + c.taxable), disc: r2(acc.disc + c.disc), cgst: r2(acc.cgst + c.cgst), sgst: r2(acc.sgst + c.sgst), igst: r2(acc.igst + c.igst), grand: r2(acc.grand + c.total) };
    }, { taxable: 0, disc: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 });

    const freightAmt = Number(header.freightAmount) || 0;
    const freightGst = Number(header.freightGstRate) || 0;
    const freightCgst = !isIGST ? r2(freightAmt * freightGst / 2 / 100) : 0;
    const freightSgst = !isIGST ? r2(freightAmt * freightGst / 2 / 100) : 0;
    const freightIgst = isIGST ? r2(freightAmt * freightGst / 100) : 0;
    const freightGstTotal = r2(freightCgst + freightSgst + freightIgst);
    const grandWithFreight = r2(totals.grand + freightAmt + freightGstTotal);

    const needPO = flowType === 'PO→GRN→Invoice' || flowType === 'PO→Direct Invoice';
    const needGRN = flowType === 'PO→GRN→Invoice' || flowType === 'Direct GRN→Invoice';
    const isManual = flowType === 'Direct Invoice';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!header.supplierId) return toast.error('Select a supplier');
        if (needPO && !header.selectedPoId) return toast.error('Select a Purchase Order');
        if (needGRN && !header.selectedGrnId) return toast.error('Select a GRN');
        if (rows.some(r => !r.itemId)) return toast.error('Select item for all rows');

        // Client-side qty check
        for (const row of rows) {
            if (row.maxQty !== null && row.qty > row.maxQty) {
                return toast.error(`Qty for "${row.itemName}" cannot exceed ${row.maxQty}`);
            }
        }

        setSaving(true);
        try {
            const payload = {
                flowType,
                supplierId: header.supplierId,
                invoiceDate: header.invoiceDate,
                supplierInvoiceNo: header.supplierInvoiceNo,
                poId: header.selectedPoId || null,
                grnId: header.selectedGrnId || null,
                supplierGstin: header.supplierGstin,
                supplierAddress: header.supplierAddress,
                supplierState: header.supplierState,
                supplierStateCode: header.supplierStateCode,
                buyerName: header.buyerName,
                buyerGstin: header.buyerGstin,
                buyerAddress: header.buyerAddress,
                buyerState: header.buyerState,
                buyerStateCode: header.buyerStateCode,
                gstType: header.gstType,
                placeOfSupply: header.placeOfSupply,
                paymentTerms: header.paymentTerms,
                remarks: header.remarks,
                transporterName: header.transporterName,
                vehicleNo: header.vehicleNo,
                lrNumber: header.lrNumber,
                freightAmount: Number(header.freightAmount) || 0,
                freightGstRate: Number(header.freightGstRate) || 0,
                items: rows.map(r => ({
                    itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
                    hsnCode: r.hsnCode, uom: r.uom,
                    qty: Number(r.qty), rate: Number(r.rate),
                    discountPercent: Number(r.discountPercent), gstRate: Number(r.gstRate),
                    grnItemId: r.grnItemId || null, poItemId: r.poItemId || null,
                })),
            };
            const inv = await createPurchaseInvoice(payload);
            toast.success(`Invoice ${inv.invoiceNumber} posted!`);
            navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id));
        } catch (err) { toast.error(err.response?.data?.message || err.message || 'Failed'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.PURCHASE.INVOICES)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}>← Purchase Invoices</button>
                <h1 style={{ margin: '0 0 20px', fontSize: '22px', fontWeight: 700 }}>🧾 New Purchase Invoice</h1>

                {/* Flow Selector */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Select Purchase Flow</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {FLOWS.map(f => (
                            <div key={f.key} onClick={() => { setFlowType(f.key); setRows([{ ...EMPTY_ROW }]); setH('selectedPoId', ''); setH('selectedGrnId', ''); }}
                                style={{ padding: '12px 14px', borderRadius: '10px', border: `2px solid ${flowType === f.key ? '#3b82f6' : '#334155'}`, background: flowType === f.key ? '#1e3a5f' : '#0f172a', cursor: 'pointer', transition: 'all 0.15s' }}>
                                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: flowType === f.key ? '#60a5fa' : '#f1f5f9', marginBottom: '4px' }}>{f.label}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>{f.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Supplier + Buyer */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px' }}>
                            <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Supplier</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                <div><span style={lbl}>Supplier *</span>
                                    <select value={header.supplierId} onChange={e => onSupplierChange(e.target.value)} style={{ ...inp, cursor: 'pointer' }} required>
                                        <option value="">— Select Supplier —</option>
                                        {suppliers.map(s => <option key={s._id} value={s._id}>{s.supplierName} ({s.supplierCode})</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div><span style={lbl}>Supplier Inv No</span><input value={header.supplierInvoiceNo} onChange={e => setH('supplierInvoiceNo', e.target.value)} style={inp} placeholder="Supplier's Inv #" /></div>
                                    <div><span style={lbl}>Invoice Date *</span><input type="date" value={header.invoiceDate} onChange={e => setH('invoiceDate', e.target.value)} style={inp} required /></div>
                                </div>
                                <div><span style={lbl}>Supplier GSTIN</span><input value={header.supplierGstin} onChange={e => setH('supplierGstin', e.target.value)} style={inp} placeholder="15-digit GSTIN" /></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                                    <div><span style={lbl}>State</span><input value={header.supplierState} onChange={e => setH('supplierState', e.target.value)} style={inp} /></div>
                                    <div><span style={lbl}>State Code</span><input value={header.supplierStateCode} onChange={e => setH('supplierStateCode', e.target.value)} style={inp} placeholder="24" /></div>
                                </div>
                            </div>
                        </div>
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px' }}>
                            <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Buyer (Our Company)</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                <div><span style={lbl}>Company Name</span><input value={header.buyerName} onChange={e => setH('buyerName', e.target.value)} style={inp} /></div>
                                <div><span style={lbl}>Our GSTIN</span><input value={header.buyerGstin} onChange={e => setH('buyerGstin', e.target.value)} style={inp} placeholder="Our GSTIN" /></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                                    <div><span style={lbl}>State</span><input value={header.buyerState} onChange={e => setH('buyerState', e.target.value)} style={inp} /></div>
                                    <div><span style={lbl}>State Code</span><input value={header.buyerStateCode} onChange={e => setH('buyerStateCode', e.target.value)} style={inp} /></div>
                                </div>
                                <div><span style={lbl}>Address</span><input value={header.buyerAddress} onChange={e => setH('buyerAddress', e.target.value)} style={inp} /></div>
                            </div>
                        </div>
                    </div>

                    {/* References + GST */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
                        <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>GST & References</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                            {needPO && (
                                <div>
                                    <span style={lbl}>Purchase Order *</span>
                                    <select value={header.selectedPoId} onChange={e => onPoChange(e.target.value)} style={{ ...inp, cursor: 'pointer' }} required={needPO}>
                                        <option value="">— Select PO —</option>
                                        {poList.map(po => <option key={po._id} value={po._id}>{po.poNumber} ({po.status})</option>)}
                                    </select>
                                    {loadingRef && <span style={{ fontSize: '11px', color: '#64748b' }}>Loading...</span>}
                                </div>
                            )}
                            {needGRN && (
                                <div>
                                    <span style={lbl}>GRN {flowType === 'PO→GRN→Invoice' ? '(from selected PO)' : ''} *</span>
                                    <select value={header.selectedGrnId} onChange={e => onGrnChange(e.target.value)} style={{ ...inp, cursor: 'pointer' }} required={needGRN}>
                                        <option value="">— Select GRN —</option>
                                        {grnList.map(g => <option key={g._id} value={g._id}>{g.grnNumber} | {g.invoiceStatus}</option>)}
                                    </select>
                                    {loadingRef && <span style={{ fontSize: '11px', color: '#64748b' }}>Loading...</span>}
                                </div>
                            )}
                            <div>
                                <span style={lbl}>GST Type *</span>
                                <select value={header.gstType} onChange={e => setH('gstType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    <option>CGST / SGST</option><option>IGST</option>
                                </select>
                            </div>
                            <div><span style={lbl}>Place of Supply</span><input value={header.placeOfSupply} onChange={e => setH('placeOfSupply', e.target.value)} style={inp} /></div>
                            <div><span style={lbl}>Payment Terms</span><input value={header.paymentTerms} onChange={e => setH('paymentTerms', e.target.value)} style={inp} /></div>
                            <div style={{ gridColumn: 'span 3' }}><span style={lbl}>Remarks</span><input value={header.remarks} onChange={e => setH('remarks', e.target.value)} style={inp} /></div>
                        </div>
                    </div>

                    {/* Transportation & Freight */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
                        <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>🚚 Transportation & Freight</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                            <div><span style={lbl}>Transporter Name</span><input value={header.transporterName} onChange={e => setH('transporterName', e.target.value)} style={inp} placeholder="e.g. Blue Dart" /></div>
                            <div><span style={lbl}>Vehicle No</span><input value={header.vehicleNo} onChange={e => setH('vehicleNo', e.target.value)} style={inp} placeholder="e.g. GJ01AB1234" /></div>
                            <div><span style={lbl}>LR / Bilty No</span><input value={header.lrNumber} onChange={e => setH('lrNumber', e.target.value)} style={inp} placeholder="LR Number" /></div>
                            <div><span style={lbl}>Freight Amount (₹)</span><input type="number" min="0" step="0.01" value={header.freightAmount} onChange={e => setH('freightAmount', e.target.value)} style={inp} placeholder="0.00" /></div>
                            <div><span style={lbl}>GST on Freight</span>
                                <select value={header.freightGstRate} onChange={e => setH('freightGstRate', Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
                                    <option value={0}>0% (Exempt)</option>
                                    <option value={5}>5% GST</option>
                                    <option value={12}>12% GST</option>
                                    <option value={18}>18% GST</option>
                                </select>
                            </div>
                            {freightAmt > 0 && freightGst > 0 && (
                                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                                    {!isIGST ? (<>
                                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>CGST ({freightGst / 2}%) = <strong style={{ color: '#3b82f6' }}>₹{freightCgst}</strong></div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>SGST ({freightGst / 2}%) = <strong style={{ color: '#7c3aed' }}>₹{freightSgst}</strong></div>
                                    </>) : (
                                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>IGST ({freightGst}%) = <strong style={{ color: '#3b82f6' }}>₹{freightIgst}</strong></div>
                                    )}
                                    <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 700 }}>Total GST on Freight = ₹{freightGstTotal}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Items */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                                Items {loadingRef ? '(loading...)' : ''}
                            </h3>
                            {isManual && <button type="button" onClick={addRow} style={{ padding: '6px 14px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>+ Add Row</button>}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                        {['#', 'Item', 'HSN', 'UOM', 'Qty', 'Max Qty', 'Rate', 'Disc%', 'GST%',
                                            isIGST ? 'IGST' : 'CGST', isIGST ? '' : 'SGST', 'Total', ''].map((h, i) =>
                                                h !== '' ? <th key={i} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th> : null
                                            )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => {
                                        const c = calcRow(row);
                                        const isLocked = !isManual && row.itemId;
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                                <td style={{ padding: '6px 10px', color: '#475569', width: '28px' }}>{i + 1}</td>
                                                <td style={{ padding: '6px 10px', minWidth: '160px' }}>
                                                    {isManual || !row.itemId ? (
                                                        <select value={row.itemId} onChange={e => setRow(i, 'itemId', e.target.value)} style={{ ...inp, fontSize: '12px' }}>
                                                            <option value="">— Select —</option>
                                                            {items.map(it => <option key={it._id} value={it._id}>{it.itemName}</option>)}
                                                        </select>
                                                    ) : (
                                                        <div style={{ color: '#f1f5f9', fontWeight: 500 }}>{row.itemName}<div style={{ color: '#64748b', fontSize: '10px' }}>{row.itemCode}</div></div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '6px 10px', width: '70px' }}><input value={row.hsnCode} onChange={e => setRow(i, 'hsnCode', e.target.value)} style={{ ...inp, fontSize: '12px' }} placeholder="HSN" /></td>
                                                <td style={{ padding: '6px 10px', width: '55px' }}><input value={row.uom} onChange={e => setRow(i, 'uom', e.target.value)} style={{ ...inp, fontSize: '12px' }} readOnly={isLocked} /></td>
                                                <td style={{ padding: '6px 10px', width: '70px' }}>
                                                    <input type="number" min="0.01" max={row.maxQty || undefined} step="0.01" value={row.qty} onChange={e => setRow(i, 'qty', e.target.value)} style={{ ...inp, fontSize: '12px', borderColor: row.maxQty && row.qty > row.maxQty ? '#ef4444' : '#334155' }} />
                                                </td>
                                                <td style={{ padding: '6px 10px', color: '#64748b', fontSize: '11px' }}>{row.maxQty ?? '—'}</td>
                                                <td style={{ padding: '6px 10px', width: '80px' }}><input type="number" min="0" step="0.01" value={row.rate} onChange={e => setRow(i, 'rate', e.target.value)} style={{ ...inp, fontSize: '12px' }} /></td>
                                                <td style={{ padding: '6px 10px', width: '55px' }}><input type="number" min="0" max="100" value={row.discountPercent} onChange={e => setRow(i, 'discountPercent', e.target.value)} style={{ ...inp, fontSize: '12px' }} /></td>
                                                <td style={{ padding: '6px 10px', width: '55px' }}><input type="number" min="0" value={row.gstRate} onChange={e => setRow(i, 'gstRate', e.target.value)} style={{ ...inp, fontSize: '12px' }} /></td>
                                                <td style={{ padding: '6px 10px', color: '#3b82f6', whiteSpace: 'nowrap' }}>₹{isIGST ? c.igst : c.cgst}</td>
                                                {!isIGST && <td style={{ padding: '6px 10px', color: '#7c3aed', whiteSpace: 'nowrap' }}>₹{c.sgst}</td>}
                                                <td style={{ padding: '6px 10px', color: '#10b981', fontWeight: 700, whiteSpace: 'nowrap' }}>₹{c.total}</td>
                                                <td style={{ padding: '6px 10px' }}>{isManual && rows.length > 1 && <button type="button" onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>✕</button>}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '16px 24px', border: '1px solid #334155', minWidth: '300px' }}>
                                {[
                                    ['Taxable Amount', `₹${totals.taxable.toLocaleString()}`],
                                    ['Discount (−)', `₹${totals.disc.toLocaleString()}`],
                                    ...(isIGST ? [['IGST (Items)', `₹${totals.igst.toLocaleString()}`]] : [['CGST (Items)', `₹${totals.cgst.toLocaleString()}`], ['SGST (Items)', `₹${totals.sgst.toLocaleString()}`]]),
                                    ...(freightAmt > 0 ? [['Freight Charges', `₹${freightAmt.toLocaleString()}`]] : []),
                                    ...(freightAmt > 0 && freightGst > 0 && !isIGST ? [['CGST (Freight)', `₹${freightCgst}`], ['SGST (Freight)', `₹${freightSgst}`]] : []),
                                    ...(freightAmt > 0 && freightGst > 0 && isIGST ? [['IGST (Freight)', `₹${freightIgst}`]] : []),
                                ].map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
                                        <span>{k}</span><span>{v}</span>
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid #334155', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '18px', color: '#10b981' }}>
                                    <span>Grand Total</span><span>₹{grandWithFreight.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => navigate(PATHS.PURCHASE.INVOICES)} style={{ padding: '10px 20px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', background: saving ? '#334155' : 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px' }}>
                            {saving ? 'Posting...' : '🧾 Post Invoice'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
