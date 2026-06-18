import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Calculator } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import {
    listConversionMasters,
    listTransformations,
    createTransformation,
    previewTransformation,
    getTextileConversionMeta,
    getTextileConversionEligibility,
} from '@/services/textileConversionApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const emptyForm = () => ({
    date: new Date().toISOString().slice(0, 10),
    process: 'Dyeing',
    conversionMasterId: '',
    inputItemId: '',
    inputQty: '',
    inputUom: 'Meter',
    outputItemId: '',
    outputQty: '',
    outputUom: 'Meter',
    lossQty: '',
    lossPercent: '',
    remarks: '',
    lotNo: '',
    rollNo: '',
    barcode: '',
    vendor: '',
    worker: '',
});

const inp = { height: 32, fontSize: 13, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', boxSizing: 'border-box' };

export default function TextileTransformationEntryPage() {
    const { selectedCompany } = useCompany();
    const [meta, setMeta] = useState(null);
    const [masters, setMasters] = useState([]);
    const [items, setItems] = useState([]);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [eligible, setEligible] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState(null);

    const isTextile = isTextileIndustryCompany(selectedCompany);

    const load = useCallback(async () => {
        if (!selectedCompany?._id || !isTextile) return;
        setLoading(true);
        try {
            const [elig, mList, eList, itemRes] = await Promise.all([
                getTextileConversionEligibility(selectedCompany._id),
                listConversionMasters({ companyId: selectedCompany._id, isActive: 'true' }),
                listTransformations({ companyId: selectedCompany._id, status: 'ACTIVE' }),
                getItems({ limit: 500, isActive: 'true' }),
            ]);
            setEligible(elig);
            setMasters(mList);
            setEntries(eList.slice(0, 10));
            setItems(Array.isArray(itemRes.data) ? itemRes.data : (itemRes.data?.items || []));
        } catch (e) {
            setEligible({ eligible: false, message: e.response?.data?.message || 'Not available' });
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, isTextile]);

    useEffect(() => {
        getTextileConversionMeta().then(setMeta).catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    const applyMaster = (masterId) => {
        const m = masters.find((x) => x._id === masterId);
        if (!m) return;
        setForm((f) => ({
            ...f,
            conversionMasterId: masterId,
            inputItemId: m.inputItemId?._id || m.inputItemId,
            inputUom: m.inputUom,
            outputItemId: m.outputItemId?._id || m.outputItemId,
            outputUom: m.outputUom,
        }));
    };

    const runPreview = async () => {
        if (!form.inputQty) { toast.error('Enter input qty first'); return; }
        try {
            const data = await previewTransformation({
                companyId: selectedCompany._id,
                conversionMasterId: form.conversionMasterId || undefined,
                inputQty: Number(form.inputQty),
                outputQty: form.outputQty ? Number(form.outputQty) : undefined,
                inputUom: form.inputUom,
                outputUom: form.outputUom,
            });
            setPreview(data);
            if (data.outputQty != null && !form.outputQty) {
                setForm((f) => ({
                    ...f,
                    outputQty: String(data.outputQty),
                    lossQty: data.lossQty != null ? String(data.lossQty) : f.lossQty,
                    lossPercent: data.lossPercent != null ? String(data.lossPercent) : f.lossPercent,
                }));
            }
        } catch (e) {
            toast.error(e.response?.data?.message || 'Preview failed');
        }
    };

    const handleSave = async () => {
        if (!form.inputItemId || !form.outputItemId) { toast.error('Input and output items required'); return; }
        if (!(Number(form.inputQty) > 0)) { toast.error('Input quantity required'); return; }
        setSaving(true);
        try {
            await createTransformation({
                companyId: selectedCompany._id,
                date: form.date,
                process: form.process,
                conversionMasterId: form.conversionMasterId || null,
                inputItemId: form.inputItemId,
                inputQty: Number(form.inputQty),
                inputUom: form.inputUom,
                outputItemId: form.outputItemId,
                outputQty: form.outputQty !== '' ? Number(form.outputQty) : undefined,
                outputUom: form.outputUom,
                lossQty: form.lossQty !== '' ? Number(form.lossQty) : undefined,
                lossPercent: form.lossPercent !== '' ? Number(form.lossPercent) : undefined,
                remarks: form.remarks,
                traceability: {
                    lotNo: form.lotNo,
                    rollNo: form.rollNo,
                    barcode: form.barcode,
                    vendor: form.vendor,
                    worker: form.worker,
                },
            });
            toast.success('Transformation saved — stock updated');
            setForm(emptyForm());
            setPreview(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (!isTextile) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Transformation Entry</h1>
                <p style={{ color: '#64748b' }}>Available only for Textile / Handloom companies.</p>
            </div>
        );
    }

    if (loading) return <BrandedLoader message="Loading transformation entry…" />;

    if (eligible && eligible.eligible === false) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Transformation Entry</h1>
                <p style={{ color: '#b91c1c' }}>{eligible.message || 'Textile template required'}</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '12px 16px', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Textile — Transformation Entry</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        Grey → Dyed → Printed → Finished · auto stock movement
                    </p>
                </div>
                <Link to={PATHS.PRODUCTION.TEXTILE_TRANSFORMATION_HISTORY} style={{ fontSize: 13, color: '#2563eb' }}>
                    View full history →
                </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 12, alignItems: 'start' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                    <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>New Transformation</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>DATE
                            <input type="date" style={{ ...inp, marginTop: 4 }} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>PROCESS
                            <select style={{ ...inp, marginTop: 4 }} value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })}>
                                {(meta?.processes || []).map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>CONVERSION MASTER (optional)
                            <select style={{ ...inp, marginTop: 4 }} value={form.conversionMasterId} onChange={(e) => { setForm({ ...form, conversionMasterId: e.target.value }); applyMaster(e.target.value); }}>
                                <option value="">Manual / dyeing loss</option>
                                {masters.map((m) => <option key={m._id} value={m._id}>{m.conversionName} ({m.conversionFormula})</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>INPUT ITEM
                            <select style={{ ...inp, marginTop: 4 }} value={form.inputItemId} onChange={(e) => setForm({ ...form, inputItemId: e.target.value })}>
                                <option value="">Select…</option>
                                {items.map((it) => <option key={it._id} value={it._id}>{it.itemCode} — {it.itemName} (stk: {it.currentStock ?? 0})</option>)}
                            </select>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>INPUT QTY
                                <input type="number" min="0" step="any" style={{ ...inp, marginTop: 4 }} value={form.inputQty} onChange={(e) => setForm({ ...form, inputQty: e.target.value })} />
                            </label>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>UOM
                                <select style={{ ...inp, marginTop: 4 }} value={form.inputUom} onChange={(e) => setForm({ ...form, inputUom: e.target.value })}>
                                    {(meta?.uoms || []).map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </label>
                        </div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>OUTPUT ITEM
                            <select style={{ ...inp, marginTop: 4 }} value={form.outputItemId} onChange={(e) => setForm({ ...form, outputItemId: e.target.value })}>
                                <option value="">Select…</option>
                                {items.map((it) => <option key={it._id} value={it._id}>{it.itemCode} — {it.itemName}</option>)}
                            </select>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>OUTPUT QTY
                                <input type="number" min="0" step="any" style={{ ...inp, marginTop: 4 }} value={form.outputQty} onChange={(e) => setForm({ ...form, outputQty: e.target.value })} />
                            </label>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>UOM
                                <select style={{ ...inp, marginTop: 4 }} value={form.outputUom} onChange={(e) => setForm({ ...form, outputUom: e.target.value })}>
                                    {(meta?.uoms || []).map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>LOSS QTY
                                <input type="number" min="0" step="any" style={{ ...inp, marginTop: 4 }} value={form.lossQty} onChange={(e) => setForm({ ...form, lossQty: e.target.value })} />
                            </label>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>LOSS %
                                <input type="number" min="0" max="100" step="any" style={{ ...inp, marginTop: 4 }} value={form.lossPercent} onChange={(e) => setForm({ ...form, lossPercent: e.target.value })} />
                            </label>
                        </div>
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>TRACEABILITY</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <input style={inp} placeholder="Lot No" value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} />
                                <input style={inp} placeholder="Roll No" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} />
                                <input style={inp} placeholder="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                                <input style={inp} placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                                <input style={inp} placeholder="Worker" value={form.worker} onChange={(e) => setForm({ ...form, worker: e.target.value })} />
                            </div>
                        </div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>REMARKS
                            <input style={{ ...inp, marginTop: 4 }} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                        </label>
                        {preview && (
                            <div style={{ fontSize: 12, padding: 8, background: '#f0fdf4', borderRadius: 6, color: '#166534' }}>
                                Calculated output: <strong>{preview.outputQty}</strong>
                                {preview.conversionFormula && <> · {preview.conversionFormula}</>}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={runPreview} style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}>
                                <Calculator size={14} /> Calculate
                            </button>
                            <button type="button" disabled={saving} onClick={handleSave} style={{ flex: 1, padding: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <Plus size={14} /> {saving ? 'Saving…' : 'Post & Update Stock'}
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                    <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Recent Transformations</h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                {['Ref', 'Process', 'Input', 'Output', 'Loss', 'Lot'].map((h) => (
                                    <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e) => (
                                <tr key={e._id}>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{e.referenceNo}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{e.process}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        {e.inputQty} {e.inputUom}<br />
                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{e.inputItemId?.itemCode}</span>
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        {e.outputQty} {e.outputUom}<br />
                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{e.outputItemId?.itemCode}</span>
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        {e.lossQty > 0 ? `${e.lossQty} (${e.lossPercent}%)` : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{e.traceability?.lotNo || '—'}</td>
                                </tr>
                            ))}
                            {entries.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No transformations yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
