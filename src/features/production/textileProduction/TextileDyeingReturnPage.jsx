import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Save } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { getTextileProductionLot, recordDyeingReturn } from '@/services/textileProductionLotApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

export default function TextileDyeingReturnPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [lot, setLot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ meterReturned: '', dyeingChallanNo: '', dyerName: '', remarks: '' });

    useEffect(() => {
        getTextileProductionLot(id).then((d) => {
            setLot(d);
            const outstanding = Math.max(0, Number(d.textile?.meterIssuedTotal || 0) - Number(d.textile?.meterReturnedTotal || 0));
            setForm((p) => ({
                ...p,
                meterReturned: outstanding ? String(outstanding) : '',
                dyerName: d.textile?.dyerName || '',
                dyeingChallanNo: d.textile?.dyeingChallanNo || '',
            }));
        }).catch((e) => toast.error(e.response?.data?.message || 'Failed to load lot'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await recordDyeingReturn(id, {
                meterReturned: Number(form.meterReturned),
                dyeingChallanNo: form.dyeingChallanNo,
                dyerName: form.dyerName,
                remarks: form.remarks,
            });
            toast.success('Dyeing return recorded');
            navigate(PATHS.PRODUCTION.TEXTILE_LOT_DETAIL(id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <BrandedLoader message="Loading lot…" />;
    if (!lot) return <div style={{ padding: 24 }}>Lot not found</div>;

    const t = lot.textile || {};
    const outstanding = Math.max(0, Number(t.meterIssuedTotal || 0) - Number(t.meterReturnedTotal || 0));

    return (
        <div style={{ padding: '16px 20px', maxWidth: 640, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOT_DETAIL(id))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
                <ChevronLeft size={16} /> Back to stage progress
            </button>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Dyeing Return Entry</h1>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
                Issued: <strong>{t.meterIssuedTotal ?? 0} m</strong> · Returned: <strong>{t.meterReturnedTotal ?? 0} m</strong> · Outstanding: <strong>{outstanding} m</strong> · Shortage: <strong style={{ color: '#dc2626' }}>{t.shortageWastageTotal ?? 0} m</strong>
            </p>

            <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, display: 'grid', gap: 12 }}>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>METER RETURNED *</span>
                    <input type="number" min="0.0001" max={outstanding || undefined} step="any" value={form.meterReturned} onChange={(e) => setForm({ ...form, meterReturned: e.target.value })} required style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                </label>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>DYEING CHALLAN NO</span>
                    <input value={form.dyeingChallanNo} onChange={(e) => setForm({ ...form, dyeingChallanNo: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                </label>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>DYER NAME</span>
                    <input value={form.dyerName} onChange={(e) => setForm({ ...form, dyerName: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                </label>
                <label><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>REMARKS</span>
                    <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                </label>
                <button type="submit" disabled={saving || outstanding <= 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: outstanding > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, justifyContent: 'center' }}>
                    <Save size={16} /> {saving ? 'Saving…' : 'Save Return'}
                </button>
            </form>

            {(t.dyeingReturns || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700 }}>Previous Returns</h2>
                    <ul style={{ fontSize: 12, color: '#475569' }}>
                        {t.dyeingReturns.map((r) => <li key={r._id}>{r.returnNo}: {r.meterReturned} m</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}
