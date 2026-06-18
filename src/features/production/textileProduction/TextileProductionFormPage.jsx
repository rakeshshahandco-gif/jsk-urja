import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Save } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import { getItems } from '@/services/itemApi';
import { createTextileProductionLot, getTextileEligibility } from '@/services/textileProductionLotApi';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 },
};

export default function TextileProductionFormPage() {
    const navigate = useNavigate();
    const { selectedCompany, companies } = useCompany();
    const [companyId, setCompanyId] = useState(selectedCompany?._id || '');
    const [items, setItems] = useState([]);
    const [eligible, setEligible] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        itemId: '', meter: '', rollNo: '', batchNo: '', fabricName: '', fabricQuality: '', fabricType: '',
        gsm: '', width: '', barcode: '', colour: '', shade: '', remarks: '',
    });

    useEffect(() => { if (selectedCompany?._id && !companyId) setCompanyId(selectedCompany._id); }, [selectedCompany?._id]);
    useEffect(() => { getItems({ limit: 500 }).then((d) => setItems(d.items || d.data || [])).catch(() => {}); }, []);
    useEffect(() => {
        if (!companyId) return setEligible(null);
        getTextileEligibility(companyId).then(setEligible).catch(() => setEligible({ eligible: false }));
    }, [companyId]);

    const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!eligible?.eligible) return toast.error('Company is not eligible for textile production');
        if (!form.itemId || !form.meter) return toast.error('Item and meter are required');
        setSaving(true);
        try {
            const lot = await createTextileProductionLot({
                companyId,
                itemId: form.itemId,
                meter: Number(form.meter),
                rollNo: form.rollNo,
                batchNo: form.batchNo,
                fabricName: form.fabricName,
                fabricQuality: form.fabricQuality,
                fabricType: form.fabricType,
                gsm: form.gsm ? Number(form.gsm) : null,
                width: form.width ? Number(form.width) : null,
                barcode: form.barcode,
                colour: form.colour,
                shade: form.shade,
                remarks: form.remarks,
            });
            toast.success('Textile lot created');
            navigate(PATHS.PRODUCTION.TEXTILE_LOT_DETAIL(lot._id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOTS)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
                <ChevronLeft size={16} /> Back
            </button>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Create Textile Lot — Grey Fabric Inward</h1>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>Lot no auto-generated (TXL-…). Meter becomes grey fabric balance.</p>

            {eligible && !eligible.eligible && (
                <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 12 }}>{eligible.message}</div>
            )}

            <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                <div style={f.grid}>
                    <label><span style={f.label}>Company *</span>
                        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required style={f.input}>
                            <option value="">Select</option>
                            {(companies || []).map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
                        </select>
                    </label>
                    <label><span style={f.label}>Item *</span>
                        <select value={form.itemId} onChange={(e) => set('itemId', e.target.value)} required style={f.input}>
                            <option value="">Select item</option>
                            {items.map((it) => <option key={it._id} value={it._id}>{it.itemCode ? `${it.itemCode} — ` : ''}{it.itemName}</option>)}
                        </select>
                    </label>
                    <label><span style={f.label}>Meter (Grey Fabric) *</span>
                        <input type="number" min="0.0001" step="any" value={form.meter} onChange={(e) => set('meter', e.target.value)} required style={f.input} />
                    </label>
                    <label><span style={f.label}>Roll No</span><input value={form.rollNo} onChange={(e) => set('rollNo', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Batch No</span><input value={form.batchNo} onChange={(e) => set('batchNo', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Barcode</span><input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Fabric Name</span><input value={form.fabricName} onChange={(e) => set('fabricName', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Fabric Quality</span><input value={form.fabricQuality} onChange={(e) => set('fabricQuality', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Fabric Type</span><input value={form.fabricType} onChange={(e) => set('fabricType', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>GSM</span><input type="number" min="0" value={form.gsm} onChange={(e) => set('gsm', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Width</span><input type="number" min="0" value={form.width} onChange={(e) => set('width', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Colour</span><input value={form.colour} onChange={(e) => set('colour', e.target.value)} style={f.input} /></label>
                    <label><span style={f.label}>Shade</span><input value={form.shade} onChange={(e) => set('shade', e.target.value)} style={f.input} /></label>
                    <label style={{ gridColumn: 'span 3' }}><span style={f.label}>Remarks</span><textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} style={{ ...f.input, resize: 'vertical' }} /></label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button type="submit" disabled={saving || !eligible?.eligible} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                        <Save size={16} /> {saving ? 'Saving…' : 'Create Lot'}
                    </button>
                </div>
            </form>
        </div>
    );
}
