import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Trash2, Save } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import {
    listTextileProcessRoutes,
    createTextileProcessRoute,
    getTextileProcessRouteMeta,
} from '@/services/textileProductionWorkflowApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const emptyStage = () => ({ sequenceNo: 1, processName: 'Dyeing', customProcessName: '', allowSkip: true });

export default function TextileProcessRouteMasterPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ routeName: '', description: '', stages: [emptyStage()] });

    const load = () => {
        if (!selectedCompany?._id) return;
        listTextileProcessRoutes({ companyId: selectedCompany._id, isActive: 'true' })
            .then(setRows)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!isTextile) return setLoading(false);
        getTextileProcessRouteMeta().then(setMeta).catch(() => {});
        load();
    }, [isTextile, selectedCompany?._id]);

    const setStage = (idx, k, v) => setForm((f) => ({
        ...f,
        stages: f.stages.map((s, i) => (i === idx ? { ...s, [k]: v } : s)),
    }));

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.routeName.trim()) return toast.error('Route name required');
        setSaving(true);
        try {
            await createTextileProcessRoute({
                companyId: selectedCompany._id,
                routeName: form.routeName,
                description: form.description,
                stages: form.stages.map((s, i) => ({ ...s, sequenceNo: i + 1 })),
            });
            toast.success('Route created');
            setShowForm(false);
            setForm({ routeName: '', description: '', stages: [emptyStage()] });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;
    if (loading) return <BrandedLoader size={80} />;

    const opts = meta?.processOptions || ['Dyeing', 'Printing', 'Embroidery', 'Packing'];

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Process Route Master</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Define multi-stage routes for textile production orders</p>
                </div>
                <button type="button" onClick={() => setShowForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={16} /> New Route
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSave} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Route Name *</span>
                            <input value={form.routeName} onChange={(e) => setForm({ ...form, routeName: e.target.value })} required style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }} />
                        </label>
                        <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Description</span>
                            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }} />
                        </label>
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Stages</div>
                    {form.stages.map((st, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 80px 40px', gap: 8, marginBottom: 8 }}>
                            <span style={{ paddingTop: 8 }}>#{idx + 1}</span>
                            <select value={st.processName} onChange={(e) => setStage(idx, 'processName', e.target.value)} style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}>
                                {opts.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <input value={st.customProcessName} onChange={(e) => setStage(idx, 'customProcessName', e.target.value)} placeholder={st.processName === 'Other' ? 'Custom process name' : 'Optional label'} style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><input type="checkbox" checked={st.allowSkip} onChange={(e) => setStage(idx, 'allowSkip', e.target.checked)} /> Skip</label>
                            <button type="button" onClick={() => setForm((f) => ({ ...f, stages: f.stages.filter((_, i) => i !== idx) }))} disabled={form.stages.length <= 1} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>
                    ))}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, stages: [...f.stages, { ...emptyStage(), sequenceNo: f.stages.length + 1 }] }))} style={{ marginBottom: 12, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>+ Add Stage</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}><Save size={16} /> {saving ? 'Saving…' : 'Save Route'}</button>
                        <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                    </div>
                </form>
            )}

            {rows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No routes yet — create Suit Set Premium, Simple Dupatta, etc.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rows.map((r) => (
                        <div key={r._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                            <strong>{r.routeName}</strong> <span style={{ color: '#94a3b8', fontSize: 12 }}>({r.routeCode})</span>
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                                {(r.stages || []).map((s) => s.processName === 'Other' && s.customProcessName ? s.customProcessName : s.processName).join(' → ')}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW)} style={{ marginTop: 16, padding: '8px 12px', border: 'none', background: 'none', color: '#64748b', cursor: 'pointer' }}>← Back to Production Workflow</button>
        </div>
    );
}
