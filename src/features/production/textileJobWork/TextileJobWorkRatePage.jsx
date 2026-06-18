import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import {
    listTextileJobWorkRates,
    createTextileJobWorkRate,
    updateTextileJobWorkRate,
    deleteTextileJobWorkRate,
    getTextileJobWorkMeta,
    getTextileJobWorkEligibility,
} from '@/services/textileJobWorkRateApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const emptyForm = () => ({
    processName: 'Dyeing',
    vendorWorker: '',
    partyType: 'vendor',
    rateType: 'PER_METER',
    defaultRate: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
    remarks: '',
    isActive: true,
});

const inp = { height: 32, fontSize: 13, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', boxSizing: 'border-box' };

export default function TextileJobWorkRatePage() {
    const { selectedCompany } = useCompany();
    const [meta, setMeta] = useState(null);
    const [rates, setRates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [eligible, setEligible] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');

    const isTextile = isTextileIndustryCompany(selectedCompany);

    const load = useCallback(async () => {
        if (!selectedCompany?._id || !isTextile) return;
        setLoading(true);
        try {
            const [elig, list] = await Promise.all([
                getTextileJobWorkEligibility(selectedCompany._id),
                listTextileJobWorkRates({ companyId: selectedCompany._id, search: search || undefined }),
            ]);
            setEligible(elig);
            setRates(list);
        } catch (e) {
            setEligible({ eligible: false, message: e.response?.data?.message || 'Not available' });
            setRates([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, isTextile, search]);

    useEffect(() => {
        getTextileJobWorkMeta().then(setMeta).catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!form.vendorWorker.trim()) { toast.error('Vendor / Worker name is required'); return; }
        if (!form.defaultRate && form.defaultRate !== 0) { toast.error('Default rate is required'); return; }
        setSaving(true);
        try {
            const payload = {
                ...form,
                companyId: selectedCompany._id,
                defaultRate: Number(form.defaultRate),
            };
            if (editId) await updateTextileJobWorkRate(editId, payload);
            else await createTextileJobWorkRate(payload);
            toast.success(editId ? 'Rate updated' : 'Rate created');
            setForm(emptyForm());
            setEditId(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (r) => {
        setEditId(r._id);
        setForm({
            processName: r.processName,
            vendorWorker: r.vendorWorker,
            partyType: r.partyType || 'vendor',
            rateType: r.rateType,
            defaultRate: String(r.defaultRate),
            effectiveDate: r.effectiveDate ? new Date(r.effectiveDate).toISOString().slice(0, 10) : '',
            remarks: r.remarks || '',
            isActive: r.isActive !== false,
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Deactivate this rate?')) return;
        try {
            await deleteTextileJobWorkRate(id, { companyId: selectedCompany._id });
            toast.success('Rate deactivated');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    if (!isTextile) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Job Work Rate Master</h1>
                <p style={{ color: '#64748b' }}>Available only for Textile / Handloom companies.</p>
            </div>
        );
    }

    if (loading && !rates.length) return <BrandedLoader message="Loading job work rates…" />;

    if (eligible && eligible.eligible === false) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Job Work Rate Master</h1>
                <p style={{ color: '#b91c1c' }}>{eligible.message || 'Textile template required'}</p>
            </div>
        );
    }

    const rateLabel = (v) => meta?.rateTypes?.find((t) => t.value === v)?.label || v;

    return (
        <div style={{ padding: '12px 16px', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Textile — Job Work Rate Master</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        {selectedCompany?.companyName} · Process labour rates for challan &amp; stage costing
                    </p>
                </div>
                <button type="button" onClick={() => { setEditId(null); setForm(emptyForm()); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    <RotateCcw size={14} /> Reset form
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 12, alignItems: 'start' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                    <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{editId ? 'Edit Rate' : 'Add Rate'}</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>PROCESS
                            <select style={{ ...inp, marginTop: 4 }} value={form.processName} onChange={(e) => setForm({ ...form, processName: e.target.value })}>
                                {(meta?.processes || ['Dyeing']).map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>VENDOR / WORKER
                            <input style={{ ...inp, marginTop: 4 }} value={form.vendorWorker} onChange={(e) => setForm({ ...form, vendorWorker: e.target.value })} placeholder="ABC Dyeing / Worker A" />
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>TYPE
                            <select style={{ ...inp, marginTop: 4 }} value={form.partyType} onChange={(e) => setForm({ ...form, partyType: e.target.value })}>
                                <option value="vendor">Vendor</option>
                                <option value="worker">Worker</option>
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>RATE TYPE
                            <select style={{ ...inp, marginTop: 4 }} value={form.rateType} onChange={(e) => setForm({ ...form, rateType: e.target.value })}>
                                {(meta?.rateTypes || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>DEFAULT RATE (₹)
                            <input type="number" min="0" step="any" style={{ ...inp, marginTop: 4 }} value={form.defaultRate} onChange={(e) => setForm({ ...form, defaultRate: e.target.value })} />
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>EFFECTIVE DATE
                            <input type="date" style={{ ...inp, marginTop: 4 }} value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>REMARKS
                            <input style={{ ...inp, marginTop: 4 }} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
                        </label>
                        <button type="button" disabled={saving} onClick={handleSave} style={{ marginTop: 4, padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <Plus size={14} /> {saving ? 'Saving…' : editId ? 'Update Rate' : 'Save Rate'}
                        </button>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <input style={{ ...inp, flex: 1 }} placeholder="Search vendor, process…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                {['Process', 'Vendor / Worker', 'Type', 'Rate', 'Effective', 'Active', ''].map((h) => (
                                    <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rates.map((r) => (
                                <tr key={r._id}>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{r.processName}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{r.vendorWorker}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{rateLabel(r.rateType)}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>₹{r.defaultRate}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{r.effectiveDate ? new Date(r.effectiveDate).toLocaleDateString() : '—'}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>{r.isActive ? 'Yes' : 'No'}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        <button type="button" onClick={() => handleEdit(r)} style={{ border: 'none', background: 'none', cursor: 'pointer', marginRight: 6 }}><Pencil size={14} /></button>
                                        <button type="button" onClick={() => handleDelete(r._id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c' }}><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                            {rates.length === 0 && (
                                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No rates yet — add ABC Dyeing ₹8/meter, Worker A ₹40/PCS, etc.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
