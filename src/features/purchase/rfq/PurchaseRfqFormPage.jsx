import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPurchaseRfqById, createPurchaseRfq, updatePurchaseRfq, sendPurchaseRfq } from '@/services/purchaseRfqApi';
import { getSuppliers } from '@/services/purchaseApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const blankItem = () => ({
    itemId: '', itemCode: '', itemName: '', makeBrand: '', specification: '', hsnCode: '',
    requiredQty: 1, uom: 'NOS', expectedRate: 0, requiredDeliveryDate: '', remarks: '',
});

function deptName(user) {
    const d = user?.department;
    if (!d) return '';
    return typeof d === 'object' ? (d.name || '') : String(d);
}

export default function PurchaseRfqFormPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [suppliers, setSuppliers] = useState([]);
    const [supplierSearch, setSupplierSearch] = useState('');
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({
        rfqDate: new Date().toISOString().slice(0, 10),
        requiredByDate: '',
        department: '',
        requestedBy: '',
        requestedByPhone: '',
        requestedByEmail: '',
        priority: 'Normal',
        status: 'Draft',
        remarks: '',
        items: [blankItem()],
        supplierIds: [],
    });

    useEffect(() => {
        if (isEdit || !user) return;
        setForm((p) => ({
            ...p,
            requestedBy: p.requestedBy || user.name || '',
            requestedByPhone: p.requestedByPhone || user.mobile || '',
            requestedByEmail: p.requestedByEmail || user.email || '',
            department: p.department || deptName(user),
        }));
    }, [user, isEdit]);

    useEffect(() => {
        getSuppliers({ limit: 5000, active: true })
            .then((d) => setSuppliers(Array.isArray(d) ? d : (d?.suppliers || [])))
            .catch(() => setSuppliers([]));
        getItems({ limit: 5000, active: true }).then((res) => {
            const list = res?.data || res?.results || res || [];
            setItems(Array.isArray(list) ? list : []);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (!isEdit) return;
        getPurchaseRfqById(id).then((d) => {
            const rfq = d.rfq || d;
            setForm({
                rfqDate: rfq.rfqDate ? new Date(rfq.rfqDate).toISOString().slice(0, 10) : '',
                requiredByDate: rfq.requiredByDate ? new Date(rfq.requiredByDate).toISOString().slice(0, 10) : '',
                department: rfq.department || '',
                requestedBy: rfq.requestedBy || '',
                requestedByPhone: rfq.requestedByPhone || '',
                requestedByEmail: rfq.requestedByEmail || '',
                priority: rfq.priority || 'Normal',
                status: rfq.status || 'Draft',
                remarks: rfq.remarks || '',
                items: rfq.items?.length ? rfq.items : [blankItem()],
                supplierIds: (rfq.suppliers || []).map((s) => String(s.supplierId?._id || s.supplierId)),
            });
        }).catch(() => toast.error('Failed to load RFQ'));
    }, [id, isEdit]);

    const setItem = (idx, key, val) => {
        setForm((p) => {
            const next = [...p.items];
            next[idx] = { ...next[idx], [key]: val };
            return { ...p, items: next };
        });
    };

    const pickItem = (idx, itemId) => {
        const it = items.find((i) => i._id === itemId);
        if (!it) return;
        setItem(idx, 'itemId', it._id);
        setItem(idx, 'itemCode', it.itemCode || '');
        setItem(idx, 'itemName', it.itemName || '');
        setItem(idx, 'hsnCode', it.hsnCode || '');
        setItem(idx, 'uom', it.uom || 'NOS');
    };

    const sidStr = (sid) => String(sid);

    const toggleSupplier = (sid) => {
        const id = sidStr(sid);
        setForm((p) => {
            const has = p.supplierIds.some((x) => sidStr(x) === id);
            return { ...p, supplierIds: has ? p.supplierIds.filter((x) => sidStr(x) !== id) : [...p.supplierIds, id] };
        });
    };

    const filteredSuppliers = useMemo(() => {
        const q = supplierSearch.trim().toLowerCase();
        if (!q) return suppliers;
        return suppliers.filter((s) => {
            const hay = [
                s.supplierName,
                s.supplierCode,
                s.city,
                s.phone,
                s.whatsApp,
                s.email,
                s.gstNumber,
                s.contactPerson,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [suppliers, supplierSearch]);

    const selectedSupplierRows = useMemo(
        () => suppliers.filter((s) => form.supplierIds.some((id) => sidStr(id) === sidStr(s._id))),
        [suppliers, form.supplierIds]
    );

    const save = async (andSend = false) => {
        if (!form.items.some((i) => i.itemName && i.requiredQty > 0)) {
            return toast.error('Add at least one item with quantity');
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                items: form.items.filter((i) => i.itemName).map((i) => ({
                    ...i,
                    expectedRate: i.expectedRate === '' || i.expectedRate == null ? 0 : Number(i.expectedRate) || 0,
                })),
            };
            const res = isEdit ? await updatePurchaseRfq(id, payload) : await createPurchaseRfq(payload);
            const rfq = res.data || res;
            const rfqId = rfq._id || id;
            if (andSend) await sendPurchaseRfq(rfqId);
            toast.success(andSend ? 'RFQ saved and sent' : 'RFQ saved');
            navigate(PATHS.PURCHASE.RFQ_DETAIL(rfqId));
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', marginBottom: 8 }}>← Purchase RFQ</button>
            <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800 }}>{isEdit ? 'Edit RFQ' : 'Create Purchase RFQ'}</h1>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    <label>RFQ Date<input type="date" value={form.rfqDate} onChange={(e) => setForm((p) => ({ ...p, rfqDate: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Required By<input type="date" value={form.requiredByDate} onChange={(e) => setForm((p) => ({ ...p, requiredByDate: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Department<input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Requested By<input value={form.requestedBy} onChange={(e) => setForm((p) => ({ ...p, requestedBy: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} placeholder="Auto-filled from your profile" /></label>
                    <label>Phone<input value={form.requestedByPhone} onChange={(e) => setForm((p) => ({ ...p, requestedByPhone: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} readOnly={!isEdit && Boolean(user?.mobile)} /></label>
                    <label>Email<input type="email" value={form.requestedByEmail} onChange={(e) => setForm((p) => ({ ...p, requestedByEmail: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} readOnly={!isEdit && Boolean(user?.email)} /></label>
                    <label>Priority
                        <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }}>
                            <option>Normal</option><option>Urgent</option>
                        </select>
                    </label>
                </div>
                <label style={{ display: 'block', marginTop: 12 }}>Remarks<textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} rows={2} style={{ width: '100%', marginTop: 4, padding: 8 }} /></label>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Items</h3>
                    <button type="button" onClick={() => setForm((p) => ({ ...p, items: [...p.items, blankItem()] }))} style={{ fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>+ Add Row</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#f9fafb' }}>
                        {['Item', 'Qty', 'UOM', 'Exp. Rate (opt.)', 'Make', 'Spec', 'Delivery', ''].map((h) => <th key={h} style={{ padding: 8, textAlign: 'left' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                        {form.items.map((row, idx) => (
                            <tr key={idx}>
                                <td style={{ padding: 6 }}>
                                    <select value={row.itemId} onChange={(e) => pickItem(idx, e.target.value)} style={{ width: '100%', padding: 6 }}>
                                        <option value="">— Select —</option>
                                        {items.map((it) => <option key={it._id} value={it._id}>{it.itemCode} — {it.itemName}</option>)}
                                    </select>
                                    {!row.itemId && <input placeholder="Item name" value={row.itemName} onChange={(e) => setItem(idx, 'itemName', e.target.value)} style={{ width: '100%', marginTop: 4, padding: 6 }} />}
                                </td>
                                <td style={{ padding: 6 }}><input type="number" min="0.01" value={row.requiredQty} onChange={(e) => setItem(idx, 'requiredQty', Number(e.target.value))} style={{ width: 70, padding: 6 }} /></td>
                                <td style={{ padding: 6 }}><input value={row.uom} onChange={(e) => setItem(idx, 'uom', e.target.value)} style={{ width: 60, padding: 6 }} /></td>
                                <td style={{ padding: 6 }}><input value={row.makeBrand} onChange={(e) => setItem(idx, 'makeBrand', e.target.value)} style={{ width: 90, padding: 6 }} /></td>
                                <td style={{ padding: 6 }}><input value={row.specification} onChange={(e) => setItem(idx, 'specification', e.target.value)} style={{ width: 120, padding: 6 }} /></td>
                                <td style={{ padding: 6 }}><input type="date" value={row.requiredDeliveryDate ? String(row.requiredDeliveryDate).slice(0, 10) : ''} onChange={(e) => setItem(idx, 'requiredDeliveryDate', e.target.value)} style={{ padding: 6 }} /></td>
                                <td style={{ padding: 6 }}><button type="button" onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}>×</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 15 }}>Suppliers <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>(optional)</span></h3>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                            Save without suppliers and export Excel/PDF from the RFQ detail page to send to many vendors.
                            {' '}{form.supplierIds.length} selected · {filteredSuppliers.length} shown
                            {supplierSearch.trim() ? ` (of ${suppliers.length})` : ''}
                        </p>
                    </div>
                </div>

                {selectedSupplierRows.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, padding: 10, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                        {selectedSupplierRows.map((s) => (
                            <span
                                key={s._id}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '4px 10px',
                                    background: '#fff',
                                    border: '1px solid #93c5fd',
                                    borderRadius: 16,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#1e40af',
                                }}
                            >
                                {s.supplierName}
                                <button
                                    type="button"
                                    onClick={() => toggleSupplier(s._id)}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: 14, lineHeight: 1, padding: 0 }}
                                    title="Remove"
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input
                        type="search"
                        placeholder="Search supplier by name, code, city, phone, GSTIN..."
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        style={{
                            flex: '1 1 280px',
                            padding: '9px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: 8,
                            fontSize: 13,
                            outline: 'none',
                        }}
                    />
                    {supplierSearch && (
                        <button
                            type="button"
                            onClick={() => setSupplierSearch('')}
                            style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: 'pointer', fontSize: 13 }}
                        >
                            Clear
                        </button>
                    )}
                </div>

                <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                                <th style={{ padding: '8px 10px', width: 36, textAlign: 'center' }} />
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Supplier</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Code</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>City</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Phone</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>GSTIN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSuppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                                        {suppliers.length === 0 ? 'No suppliers loaded' : 'No suppliers match your search'}
                                    </td>
                                </tr>
                            ) : (
                                filteredSuppliers.map((s) => {
                                    const selected = form.supplierIds.some((id) => sidStr(id) === sidStr(s._id));
                                    return (
                                        <tr
                                            key={s._id}
                                            onClick={() => toggleSupplier(s._id)}
                                            style={{
                                                cursor: 'pointer',
                                                background: selected ? '#eff6ff' : 'transparent',
                                            }}
                                        >
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleSupplier(s._id)}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.supplierName}</td>
                                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.supplierCode || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.city || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.phone || s.whatsApp || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.gstNumber || '—'}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" disabled={saving} onClick={() => save(false)} style={{ padding: '10px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Save (suppliers optional)</button>
                <button type="button" disabled={saving} onClick={() => save(true)} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }} title="Marks RFQ as Sent; you can still add suppliers later">Save &amp; Mark Sent</button>
            </div>
        </div>
    );
}
