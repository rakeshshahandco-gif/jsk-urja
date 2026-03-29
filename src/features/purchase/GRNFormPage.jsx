import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSuppliers, getPurchaseOrders, getPurchaseOrderById, createGRN } from '@/services/purchaseApi';
import { getItems } from '@/services/itemApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { getComplaints } from '@/services/serviceApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const lbl = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 };

const EMPTY_ITEM = { itemId: '', itemName: '', itemCode: '', hsnCode: '', uom: 'NOS', receivedQty: 1, rate: 0, qcStatus: 'Accepted', batchNo: '', serialNo: '', remarks: '' };

export default function GRNFormPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const prefillPoId = searchParams.get('poId') || '';

    const [sourceType, setSourceType] = useState(prefillPoId ? 'Against PO' : 'Direct GRN');
    const [suppliers, setSuppliers] = useState([]);
    const [poList, setPoList] = useState([]);
    const [allItems, setAllItems] = useState([]);
    const [complaints, setComplaints] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loadingPO, setLoadingPO] = useState(false);

    const [header, setHeader] = useState({
        supplierId: '', selectedPoId: prefillPoId,
        grnDate: new Date().toISOString().split('T')[0],
        warehouse: '', remarks: '',
        complaintId: '', complaintNo: '',
    });
    // For Against PO → items come from PO
    const [poItems, setPoItems] = useState([]); // { poItem, receivedQty, qcStatus, batchNo, serialNo, remarks }
    // For Direct GRN → items are manual
    const [directItems, setDirectItems] = useState([{ ...EMPTY_ITEM }]);

    const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }));

    useEffect(() => {
        getSuppliers({ limit: 200 }).then(d => setSuppliers(d.suppliers || [])).catch(() => { });
        getComplaints({ status: 'Approved', limit: 100 }).then(d => setComplaints(d.data || [])).catch(() => { });
        getItems({ limit: 5000, sortBy: 'itemName:asc' }).then(d => setAllItems(Array.isArray(d.data) ? d.data : [])).catch(() => { });
    }, []);

    useEffect(() => {
        if (sourceType === 'Against PO' && header.supplierId) {
            getPurchaseOrders({ supplierId: header.supplierId, limit: 100 })
                .then(d => setPoList((d.purchaseOrders || d.orders || [])))
                .catch(() => { });
        }
    }, [header.supplierId, sourceType]);

    // Auto-load PO if prefilled
    useEffect(() => {
        if (prefillPoId) {
            loadPO(prefillPoId);
        }
    }, []);

    const loadPO = useCallback(async (poId) => {
        if (!poId) { setPoItems([]); return; }
        setLoadingPO(true);
        try {
            const po = await getPurchaseOrderById(poId);
            const poData = po.data || po;
            // Pre-fill supplier
            setH('supplierId', poData.supplierId?._id || poData.supplierId);
            const pendingItems = (poData.items || []).filter(i => i.pendingQty > 0).map(i => ({
                poItemId: i._id,
                itemId: i.itemId?._id || i.itemId,
                itemName: i.itemName,
                itemCode: i.itemCode,
                hsnCode: i.hsnCode || '',
                uom: i.uom,
                orderedQty: i.orderedQty,
                previouslyReceivedQty: i.receivedQty,
                pendingQty: i.pendingQty,
                rate: i.rate,
                receivedQty: i.pendingQty, // default to full pending
                qcStatus: 'Accepted',
                batchNo: '',
                serialNo: '',
                remarks: '',
            }));
            setPoItems(pendingItems);
            setHeader(h => ({
                ...h,
                supplierId: poData.supplierId?._id || poData.supplierId,
                complaintId: poData.complaintId?._id || poData.complaintId || '',
                complaintNo: poData.complaintNo || '',
            }));
            if (pendingItems.length === 0) toast.info('All items in this PO are already fully received');
        } catch { toast.error('Failed to load PO items'); }
        finally { setLoadingPO(false); }
    }, []);

    const onPoChange = async (poId) => {
        setH('selectedPoId', poId);
        await loadPO(poId);
    };

    const setPoItem = (idx, k, v) => setPoItems(prev => prev.map((item, i) => i === idx ? { ...item, [k]: v } : item));

    // Direct item helpers
    const addDirectItem = () => setDirectItems(prev => [...prev, { ...EMPTY_ITEM }]);
    const removeDirectItem = (idx) => setDirectItems(prev => prev.filter((_, i) => i !== idx));
    const setDirectItem = (idx, k, v) => setDirectItems(prev => prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [k]: v };
        if (k === 'itemId') {
            const found = allItems.find(it => it._id === v);
            if (found) {
                updated.itemName = found.itemName;
                updated.itemCode = found.itemCode || '';
                updated.uom = found.uom || 'NOS';
                updated.rate = found.purchaseRate || 0;
                updated.hsnCode = found.hsnCode || '';
            }
        }
        return updated;
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!header.supplierId && sourceType === 'Direct GRN') return toast.error('Select a supplier');

        if (sourceType === 'Against PO') {
            if (!header.selectedPoId) return toast.error('Select a Purchase Order');
            const itemsToSend = poItems.filter(i => Number(i.receivedQty) > 0);
            if (itemsToSend.length === 0) return toast.error('Enter received quantity for at least one item');
            for (const item of itemsToSend) {
                if (Number(item.receivedQty) > item.pendingQty) {
                    return toast.error(`Received qty for "${item.itemName}" cannot exceed pending qty (${item.pendingQty})`);
                }
            }
            setSaving(true);
            try {
                const res = await createGRN({
                    sourceType: 'Against PO',
                    poId: header.selectedPoId,
                    grnDate: header.grnDate,
                    warehouse: header.warehouse,
                    remarks: header.remarks,
                    items: itemsToSend.map(i => ({
                        poItemId: i.poItemId,
                        receivedQty: Number(i.receivedQty),
                        qcStatus: i.qcStatus,
                        batchNo: i.batchNo,
                        serialNo: i.serialNo,
                        remarks: i.remarks,
                    })),
                });
                toast.success(res.message || `GRN created! Stock updated.`);
                navigate(PATHS.PURCHASE.GRN);
            } catch (err) { toast.error(err.response?.data?.message || err.message || 'Failed to create GRN'); }
            finally { setSaving(false); }
        } else {
            // Direct GRN
            const validItems = directItems.filter(i => i.itemId && Number(i.receivedQty) > 0);
            if (validItems.length === 0) return toast.error('Add at least one item with qty > 0');
            setSaving(true);
            try {
                const res = await createGRN({
                    sourceType: 'Direct GRN',
                    supplierId: header.supplierId,
                    grnDate: header.grnDate,
                    warehouse: header.warehouse,
                    remarks: header.remarks,
                    items: validItems.map(i => ({
                        itemId: i.itemId,
                        itemCode: i.itemCode,
                        itemName: i.itemName,
                        hsnCode: i.hsnCode,
                        uom: i.uom,
                        receivedQty: Number(i.receivedQty),
                        rate: Number(i.rate),
                        qcStatus: i.qcStatus,
                        batchNo: i.batchNo,
                        serialNo: i.serialNo,
                        remarks: i.remarks,
                    })),
                });
                toast.success(res.message || 'Direct GRN created! Stock updated.');
                navigate(PATHS.PURCHASE.GRN);
            } catch (err) { toast.error(err.response?.data?.message || err.message || 'Failed to create GRN'); }
            finally { setSaving(false); }
        }
    };

    const card = { background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '16px' };
    const cardH = { margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.PURCHASE.GRN)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}>
                    ← Goods Receipt Notes
                </button>
                <h1 style={{ margin: '0 0 20px', fontSize: '22px', fontWeight: 700 }}>📦 Create Goods Receipt Note</h1>

                {/* Flow Selector */}
                <div style={card}>
                    <h3 style={cardH}>GRN Type</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {[
                            { key: 'Against PO', icon: '📋', label: 'Against Purchase Order', desc: 'Material received for an existing PO. Qty cannot exceed PO pending qty.' },
                            { key: 'Direct GRN', icon: '🚚', label: 'Direct GRN (No PO)', desc: 'Urgent purchase without PO. Add items manually. Invoice can be created later.' },
                        ].map(f => (
                            <div key={f.key} onClick={() => { setSourceType(f.key); setPoItems([]); setDirectItems([{ ...EMPTY_ITEM }]); setH('selectedPoId', ''); }}
                                style={{ padding: '14px 18px', borderRadius: '10px', border: `2px solid ${sourceType === f.key ? '#3b82f6' : '#334155'}`, background: sourceType === f.key ? '#1e3a5f' : '#0f172a', cursor: 'pointer', transition: 'all 0.15s' }}>
                                <div style={{ fontSize: '22px', marginBottom: '6px' }}>{f.icon}</div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: sourceType === f.key ? '#60a5fa' : '#f1f5f9', marginBottom: '4px' }}>{f.label}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>{f.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Header */}
                    <div style={card}>
                        <h3 style={cardH}>GRN Details</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                            <div>
                                <span style={lbl}>Supplier *</span>
                                <select value={header.supplierId} onChange={e => setH('supplierId', e.target.value)} style={{ ...inp, cursor: 'pointer' }} required={sourceType === 'Direct GRN'} disabled={sourceType === 'Against PO' && !!header.selectedPoId}>
                                    <option value="">— Select Supplier —</option>
                                    {suppliers.map(s => <option key={s._id} value={s._id}>{s.supplierName} ({s.supplierCode})</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={lbl}>GRN Date *</span>
                                <input type="date" value={header.grnDate} onChange={e => setH('grnDate', e.target.value)} style={inp} required />
                            </div>
                            <div>
                                <span style={lbl}>Warehouse / Store</span>
                                <input value={header.warehouse} onChange={e => setH('warehouse', e.target.value)} style={inp} placeholder="e.g. Main Warehouse" />
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <span style={lbl}>Remarks</span>
                                <input value={header.remarks} onChange={e => setH('remarks', e.target.value)} style={inp} placeholder="Optional remarks" />
                            </div>
                            <div style={{ gridColumn: 'span 1' }}>
                                <span style={lbl}>Link to Complaint</span>
                                {sourceType === 'Against PO' ? (
                                    <input value={header.complaintNo ? `Linked to ${header.complaintNo}` : 'No Complaint Linked'} style={{ ...inp, background: '#1e293b', color: '#94a3b8' }} readOnly />
                                ) : (
                                    <SearchableSelect
                                        options={complaints.map(c => ({ value: c._id, label: `${c.complaintNo} - ${c.customerName}` }))}
                                        value={header.complaintId}
                                        onChange={v => {
                                            const found = complaints.find(c => c._id === v);
                                            setHeader(h => ({ ...h, complaintId: v, complaintNo: found ? found.complaintNo : '' }));
                                        }}
                                        placeholder="— Select Complaint —"
                                        dark={true}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Items – Against PO */}
                    {sourceType === 'Against PO' && poItems.length > 0 && (
                        <div style={card}>
                            <h3 style={cardH}>Items to Receive</h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                            {['Item', 'UOM', 'Ordered', 'Prev. Received', 'Pending', 'Receive Qty *', 'QC Status', 'Batch No', 'Serial No'].map(h => (
                                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {poItems.map((item, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{item.itemName}</div>
                                                    <div style={{ fontSize: '11px', color: '#475569' }}>{item.itemCode}</div>
                                                </td>
                                                <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{item.uom}</td>
                                                <td style={{ padding: '10px 12px', color: '#3b82f6', fontWeight: 600 }}>{item.orderedQty}</td>
                                                <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{item.previouslyReceivedQty}</td>
                                                <td style={{ padding: '10px 12px', color: '#fb923c', fontWeight: 700 }}>{item.pendingQty}</td>
                                                <td style={{ padding: '10px 12px', width: '110px' }}>
                                                    <input type="number" min="0" max={item.pendingQty} step="0.01"
                                                        value={item.receivedQty}
                                                        onChange={e => setPoItem(idx, 'receivedQty', e.target.value)}
                                                        style={{ ...inp, fontSize: '12px', borderColor: Number(item.receivedQty) > item.pendingQty ? '#ef4444' : '#10b981' }} />
                                                </td>
                                                <td style={{ padding: '10px 12px', width: '130px' }}>
                                                    <select value={item.qcStatus} onChange={e => setPoItem(idx, 'qcStatus', e.target.value)} style={{ ...inp, fontSize: '12px', cursor: 'pointer' }}>
                                                        <option>Accepted</option><option>Pending</option><option>Rejected</option><option>Hold</option>
                                                    </select>
                                                </td>
                                                <td style={{ padding: '10px 12px', width: '100px' }}>
                                                    <input value={item.batchNo} onChange={e => setPoItem(idx, 'batchNo', e.target.value)} style={{ ...inp, fontSize: '12px' }} placeholder="Batch #" />
                                                </td>
                                                <td style={{ padding: '10px 12px', width: '100px' }}>
                                                    <input value={item.serialNo} onChange={e => setPoItem(idx, 'serialNo', e.target.value)} style={{ ...inp, fontSize: '12px' }} placeholder="Serial #" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {sourceType === 'Against PO' && !header.selectedPoId && (
                        <div style={{ ...card, textAlign: 'center', color: '#64748b', padding: '32px' }}>
                            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📋</div>
                            <div>Select a Purchase Order above to view pending items</div>
                        </div>
                    )}

                    {/* Items – Direct GRN */}
                    {sourceType === 'Direct GRN' && (
                        <div style={card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h3 style={{ ...cardH, margin: 0 }}>Items</h3>
                                <button type="button" onClick={addDirectItem}
                                    style={{ padding: '7px 16px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                    + Add Item
                                </button>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                            {['#', 'Item *', 'HSN', 'UOM', 'Received Qty *', 'Rate *', 'Amount', 'QC Status', 'Batch No', ''].map((h, i) => (
                                                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {directItems.map((item, idx) => {
                                            const amount = Math.round(Number(item.receivedQty) * Number(item.rate) * 100) / 100;
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                                                    <td style={{ padding: '8px 12px', color: '#475569', width: '30px' }}>{idx + 1}</td>
                                                    <td style={{ padding: '8px 12px', minWidth: '160px' }}>
                                                        <SearchableSelect
                                                            options={allItems.map(it => ({ value: it._id, label: it.itemName, meta: it.itemCode }))}
                                                            value={item.itemId}
                                                            onChange={v => setDirectItem(idx, 'itemId', v)}
                                                            placeholder="— Search —"
                                                            dark={true}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px 12px', width: '80px' }}><input value={item.hsnCode} onChange={e => setDirectItem(idx, 'hsnCode', e.target.value)} style={{ ...inp, fontSize: '12px' }} placeholder="HSN" /></td>
                                                    <td style={{ padding: '8px 12px', width: '60px' }}><input value={item.uom} onChange={e => setDirectItem(idx, 'uom', e.target.value)} style={{ ...inp, fontSize: '12px' }} /></td>
                                                    <td style={{ padding: '8px 12px', width: '100px' }}><input type="number" min="0.01" step="0.01" value={item.receivedQty} onChange={e => setDirectItem(idx, 'receivedQty', e.target.value)} style={{ ...inp, fontSize: '12px', borderColor: '#10b981' }} /></td>
                                                    <td style={{ padding: '8px 12px', width: '100px' }}><input type="number" min="0" step="0.01" value={item.rate} onChange={e => setDirectItem(idx, 'rate', e.target.value)} style={{ ...inp, fontSize: '12px' }} /></td>
                                                    <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700, whiteSpace: 'nowrap' }}>₹{amount.toLocaleString('en-IN')}</td>
                                                    <td style={{ padding: '8px 12px', width: '130px' }}>
                                                        <select value={item.qcStatus} onChange={e => setDirectItem(idx, 'qcStatus', e.target.value)} style={{ ...inp, fontSize: '12px', cursor: 'pointer' }}>
                                                            <option>Accepted</option><option>Pending</option><option>Rejected</option><option>Hold</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', width: '100px' }}><input value={item.batchNo} onChange={e => setDirectItem(idx, 'batchNo', e.target.value)} style={{ ...inp, fontSize: '12px' }} placeholder="Batch #" /></td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        {directItems.length > 1 && <button type="button" onClick={() => removeDirectItem(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Total */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                    <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px 24px', minWidth: '260px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                                            <span>Items</span><span>{directItems.filter(i => i.itemId).length}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: '#10b981', borderTop: '1px solid #334155', paddingTop: '8px' }}>
                                            <span>Total Amount</span>
                                            <span>₹{directItems.reduce((s, i) => s + Math.round(Number(i.receivedQty) * Number(i.rate) * 100) / 100, 0).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Info banner */}
                    <div style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: '10px', padding: '12px 18px', marginBottom: '16px', fontSize: '12px', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>ℹ️</span>
                        <span>Stock will increase automatically when this GRN is saved. {sourceType === 'Against PO' ? 'PO status will update to Partially/Fully Received.' : 'You can create a Purchase Invoice against this GRN later.'}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => { if (window.confirm('Discard changes?')) navigate(PATHS.PURCHASE.GRN); }}
                            style={{ padding: '10px 20px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            style={{ padding: '10px 28px', borderRadius: '8px', background: saving ? '#334155' : 'linear-gradient(135deg,#065f46,#10b981)', color: saving ? '#94a3b8' : '#ecfdf5', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px' }}>
                            {saving ? 'Saving...' : '📦 Confirm Receipt & Update Stock'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
