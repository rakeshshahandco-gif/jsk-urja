import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Save } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { getTextileProductionLot, recordDyeingIssue } from '@/services/textileProductionLotApi';
import { listTextileJobWorkRates, lookupTextileJobWorkRate } from '@/services/textileJobWorkRateApi';
import { useCompany } from '@/contexts/CompanyContext';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

function calcCost(qty, rate, rateType) {
    const q = Number(qty) || 0;
    const r = Number(rate) || 0;
    if (rateType === 'FIXED_AMOUNT') return r;
    return Math.round(q * r * 100) / 100;
}

export default function TextileDyeingIssuePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const [lot, setLot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [vendors, setVendors] = useState([]);
    const [form, setForm] = useState({
        meterIssued: '',
        dyeingChallanNo: '',
        dyerName: '',
        vendorWorker: '',
        rateType: '',
        rateApplied: '',
        rateMasterId: '',
        remarks: '',
    });

    useEffect(() => {
        Promise.all([
            getTextileProductionLot(id),
            selectedCompany?._id
                ? listTextileJobWorkRates({ companyId: selectedCompany._id, processName: 'Dyeing', isActive: 'true' })
                : Promise.resolve([]),
        ]).then(([d, rates]) => {
            setLot(d);
            setVendors(rates.filter((r) => r.partyType === 'vendor'));
            setForm((p) => ({
                ...p,
                meterIssued: String(d.textile?.availableMeter || ''),
                dyerName: d.textile?.dyerName || '',
                vendorWorker: d.textile?.dyerName || '',
            }));
        }).catch((e) => toast.error(e.response?.data?.message || 'Failed to load lot'))
            .finally(() => setLoading(false));
    }, [id, selectedCompany?._id]);

    const labourCost = useMemo(
        () => calcCost(form.meterIssued, form.rateApplied, form.rateType),
        [form.meterIssued, form.rateApplied, form.rateType],
    );

    const applyVendor = async (name) => {
        setForm((p) => ({ ...p, vendorWorker: name, dyerName: name }));
        if (!name || !selectedCompany?._id) return;
        try {
            const rate = await lookupTextileJobWorkRate({
                companyId: selectedCompany._id,
                processName: 'Dyeing',
                vendorWorker: name,
            });
            if (rate) {
                setForm((p) => ({
                    ...p,
                    rateType: rate.rateType,
                    rateApplied: String(rate.appliedRate ?? rate.defaultRate),
                    rateMasterId: rate._id,
                }));
            }
        } catch {
            /* manual rate entry allowed */
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await recordDyeingIssue(id, {
                meterIssued: Number(form.meterIssued),
                dyeingChallanNo: form.dyeingChallanNo,
                dyerName: form.vendorWorker || form.dyerName,
                vendorWorker: form.vendorWorker || form.dyerName,
                processName: 'Dyeing',
                rateType: form.rateType || undefined,
                rateApplied: form.rateApplied ? Number(form.rateApplied) : undefined,
                rateMasterId: form.rateMasterId || undefined,
                remarks: form.remarks,
            });
            toast.success(`Dyeing issue recorded · Labour cost ₹${labourCost}`);
            navigate(PATHS.PRODUCTION.TEXTILE_LOT_DETAIL(id));
        } catch (err) {
            toast.error(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <BrandedLoader message="Loading lot…" />;
    if (!lot) return <div style={{ padding: 24 }}>Lot not found</div>;

    const t = lot.textile || {};

    return (
        <div style={{ padding: '16px 20px', maxWidth: 640, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOT_DETAIL(id))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
                <ChevronLeft size={16} /> Back to stage progress
            </button>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Dyeing Challan — Issue</h1>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
                Lot {lot.lotNo} · Available grey fabric: <strong>{t.availableMeter ?? 0} m</strong>
            </p>

            <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, display: 'grid', gap: 12 }}>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>METER ISSUED *</span>
                    <input type="number" min="0.0001" max={t.availableMeter} step="any" value={form.meterIssued} onChange={(e) => setForm({ ...form, meterIssued: e.target.value })} required style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                </label>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>DYEING CHALLAN NO</span>
                    <input value={form.dyeingChallanNo} onChange={(e) => setForm({ ...form, dyeingChallanNo: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                </label>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>VENDOR / DYER *</span>
                    {vendors.length > 0 ? (
                        <select value={form.vendorWorker} onChange={(e) => applyVendor(e.target.value)} required style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }}>
                            <option value="">Select vendor…</option>
                            {vendors.map((v) => <option key={v._id} value={v.vendorWorker}>{v.vendorWorker} — ₹{v.defaultRate}</option>)}
                        </select>
                    ) : (
                        <input value={form.vendorWorker} onChange={(e) => applyVendor(e.target.value)} onBlur={(e) => applyVendor(e.target.value)} required style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} placeholder="ABC Dyeing" />
                    )}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>RATE TYPE</span>
                        <input value={form.rateType} onChange={(e) => setForm({ ...form, rateType: e.target.value })} placeholder="PER_METER" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                    </label>
                    <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>RATE (₹) — editable</span>
                        <input type="number" min="0" step="any" value={form.rateApplied} onChange={(e) => setForm({ ...form, rateApplied: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                    </label>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 10, fontSize: 13 }}>
                    <strong>Auto labour cost:</strong> {form.meterIssued || 0} × ₹{form.rateApplied || 0} = <strong>₹{labourCost}</strong>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Cost is based on issued quantity; returns do not reduce labour cost.</div>
                </div>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>REMARKS</span>
                    <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                </label>
                <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, justifyContent: 'center' }}>
                    <Save size={16} /> {saving ? 'Saving…' : 'Save Issue'}
                </button>
            </form>

            {(t.dyeingIssues || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700 }}>Previous Issues</h2>
                    <ul style={{ fontSize: 12, color: '#475569' }}>
                        {t.dyeingIssues.map((i) => (
                            <li key={i._id}>
                                {i.issueNo}: {i.meterIssued} m — {i.vendorWorker || i.dyerName}
                                {i.labourCost ? ` · ₹${i.labourCost}` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
