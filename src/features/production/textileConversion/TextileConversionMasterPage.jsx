import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getItems } from '@/services/itemApi';
import {
    listConversionMasters,
    createConversionMaster,
    updateConversionMaster,
    deleteConversionMaster,
    getTextileConversionMeta,
    getTextileConversionEligibility,
} from '@/services/textileConversionApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const emptyForm = () => ({
    conversionName: '',
    inputItemId: '',
    inputUom: 'Meter',
    outputItemId: '',
    outputUom: 'PCS',
    formulaType: 'RATIO',
    inputQtyPerOutput: '',
    expectedOutputQty: '',
    expectedLossPercent: '',
    remarks: '',
    isActive: true,
});

const inp = { height: 32, fontSize: 13, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', boxSizing: 'border-box' };

export default function TextileConversionMasterPage() {
    const { selectedCompany } = useCompany();
    const [meta, setMeta] = useState(null);
    const [masters, setMasters] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [eligible, setEligible] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');

    const isTextile = isTextileIndustryCompany(selectedCompany);

    const loadItems = useCallback(async () => {
        if (!selectedCompany?._id) return;
        try {
            const res = await getItems({ limit: 500, isActive: 'true' });
            setItems(Array.isArray(res.data) ? res.data : (res.data?.items || []));
        } catch {
            setItems([]);
        }
    }, [selectedCompany?._id]);

    const load = useCallback(async () => {
        if (!selectedCompany?._id || !isTextile) return;
        setLoading(true);
        try {
            const [elig, list] = await Promise.all([
                getTextileConversionEligibility(selectedCompany._id),
                listConversionMasters({ companyId: selectedCompany._id, search: search || undefined }),
            ]);
            setEligible(elig);
            setMasters(list);
        } catch (e) {
            setEligible({ eligible: false, message: e.response?.data?.message || 'Not available' });
            setMasters([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, isTextile, search]);

    useEffect(() => {
        getTextileConversionMeta().then(setMeta).catch(() => {});
    }, []);

    useEffect(() => { loadItems(); }, [loadItems]);
    useEffect(() => { load(); }, [load]);

    const formulaPreview = () => {
        if (form.formulaType === 'VARIABLE') return `Variable ${form.outputUom} entry`;
        const n = Number(form.inputQtyPerOutput);
        if (!n) return '';
        return `${n} ${form.inputUom} = 1 ${form.outputUom}`;
    };

    const handleSave = async () => {
        if (!form.conversionName.trim()) { toast.error('Conversion name is required'); return; }
        if (!form.inputItemId || !form.outputItemId) { toast.error('Input and output items are required'); return; }
        if (form.formulaType === 'RATIO' && !(Number(form.inputQtyPerOutput) > 0)) {
            toast.error('Input qty per output is required for ratio formula');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                companyId: selectedCompany._id,
                inputQtyPerOutput: form.formulaType === 'RATIO' ? Number(form.inputQtyPerOutput) : 0,
                expectedOutputQty: Number(form.expectedOutputQty) || 0,
                expectedLossPercent: Number(form.expectedLossPercent) || 0,
            };
            if (editId) await updateConversionMaster(editId, payload);
            else await createConversionMaster(payload);
            toast.success(editId ? 'Conversion updated' : 'Conversion created');
            setForm(emptyForm());
            setEditId(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (m) => {
        setEditId(m._id);
        setForm({
            conversionName: m.conversionName,
            inputItemId: m.inputItemId?._id || m.inputItemId,
            inputUom: m.inputUom,
            outputItemId: m.outputItemId?._id || m.outputItemId,
            outputUom: m.outputUom,
            formulaType: m.formulaType || 'RATIO',
            inputQtyPerOutput: m.inputQtyPerOutput ? String(m.inputQtyPerOutput) : '',
            expectedOutputQty: m.expectedOutputQty ? String(m.expectedOutputQty) : '',
            expectedLossPercent: m.expectedLossPercent ? String(m.expectedLossPercent) : '',
            remarks: m.remarks || '',
            isActive: m.isActive !== false,
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Deactivate this conversion master?')) return;
        try {
            await deleteConversionMaster(id, selectedCompany._id);
            toast.success('Deactivated');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    if (!isTextile) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Conversion Master</h1>
                <p style={{ color: '#64748b' }}>Available only for Textile / Handloom companies.</p>
            </div>
        );
    }

    if (loading && !masters.length) return <BrandedLoader message="Loading conversion masters…" />;

    if (eligible && eligible.eligible === false) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Conversion Master</h1>
                <p style={{ color: '#b91c1c' }}>{eligible.message || 'Textile template required'}</p>
            </div>
        );
    }

    const itemLabel = (id) => {
        const it = items.find((i) => i._id === id);
        return it ? `${it.itemCode} — ${it.itemName}` : id;
    };

    return (
        <div style={{ padding: '12px 16px', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Textile — Conversion Master</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        Meter → PCS, Than → Meter, Grey → Dupatta / Suit Set conversion rules
                    </p>
                </div>
                <button type="button" onClick={() => { setEditId(null); setForm(emptyForm()); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    <RotateCcw size={14} /> Reset form
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12, alignItems: 'start' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                    <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{editId ? 'Edit Conversion' : 'Add Conversion'}</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>CONVERSION NAME
                            <input style={{ ...inp, marginTop: 4 }} value={form.conversionName} onChange={(e) => setForm({ ...form, conversionName: e.target.value })} placeholder="Grey to Dupatta 5m" />
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>INPUT ITEM
                            <select style={{ ...inp, marginTop: 4 }} value={form.inputItemId} onChange={(e) => setForm({ ...form, inputItemId: e.target.value })}>
                                <option value="">Select item…</option>
                                {items.map((it) => <option key={it._id} value={it._id}>{it.itemCode} — {it.itemName}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>INPUT UOM
                            <select style={{ ...inp, marginTop: 4 }} value={form.inputUom} onChange={(e) => setForm({ ...form, inputUom: e.target.value })}>
                                {(meta?.uoms || ['Meter', 'Than', 'PCS']).map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>OUTPUT ITEM
                            <select style={{ ...inp, marginTop: 4 }} value={form.outputItemId} onChange={(e) => setForm({ ...form, outputItemId: e.target.value })}>
                                <option value="">Select item…</option>
                                {items.map((it) => <option key={it._id} value={it._id}>{it.itemCode} — {it.itemName}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>OUTPUT UOM
                            <select style={{ ...inp, marginTop: 4 }} value={form.outputUom} onChange={(e) => setForm({ ...form, outputUom: e.target.value })}>
                                {(meta?.uoms || ['Meter', 'PCS']).map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>FORMULA TYPE
                            <select style={{ ...inp, marginTop: 4 }} value={form.formulaType} onChange={(e) => setForm({ ...form, formulaType: e.target.value })}>
                                <option value="RATIO">Fixed Ratio (auto calculate)</option>
                                <option value="VARIABLE">Variable Output (manual entry)</option>
                            </select>
                        </label>
                        {form.formulaType === 'RATIO' && (
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>INPUT QTY PER 1 OUTPUT
                                <input type="number" min="0" step="any" style={{ ...inp, marginTop: 4 }} value={form.inputQtyPerOutput} onChange={(e) => setForm({ ...form, inputQtyPerOutput: e.target.value })} placeholder="e.g. 5 for 5 Meter = 1 PCS" />
                            </label>
                        )}
                        {formulaPreview() && (
                            <div style={{ fontSize: 12, padding: '6px 8px', background: '#eff6ff', borderRadius: 6, color: '#1d4ed8' }}>
                                Formula: <strong>{formulaPreview()}</strong>
                            </div>
                        )}
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>EXPECTED LOSS %
                            <input type="number" min="0" max="100" step="any" style={{ ...inp, marginTop: 4 }} value={form.expectedLossPercent} onChange={(e) => setForm({ ...form, expectedLossPercent: e.target.value })} />
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>REMARKS
                            <input style={{ ...inp, marginTop: 4 }} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
                        </label>
                        <button type="button" disabled={saving} onClick={handleSave} style={{ marginTop: 4, padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <Plus size={14} /> {saving ? 'Saving…' : editId ? 'Update' : 'Save Conversion'}
                        </button>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                    <input style={{ ...inp, marginBottom: 10 }} placeholder="Search conversions…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                {['Name', 'Input', 'Output', 'Formula', 'Loss %', 'Active', ''].map((h) => (
                                    <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {masters.map((m) => (
                                <tr key={m._id}>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{m.conversionName}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        {m.inputItemId?.itemCode || itemLabel(m.inputItemId)}<br />
                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.inputUom}</span>
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        {m.outputItemId?.itemCode || itemLabel(m.outputItemId)}<br />
                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.outputUom}</span>
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{m.conversionFormula}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{m.expectedLossPercent || 0}%</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{m.isActive ? 'Yes' : 'No'}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        <button type="button" onClick={() => handleEdit(m)} style={{ border: 'none', background: 'none', cursor: 'pointer', marginRight: 6 }}><Pencil size={14} /></button>
                                        <button type="button" onClick={() => handleDelete(m._id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c' }}><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                            {masters.length === 0 && (
                                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No conversions — add 5 Meter = 1 Dupatta, 6 Meter = 1 Suit Set, etc.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
