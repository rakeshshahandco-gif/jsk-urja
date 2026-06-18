import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Shirt } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import { getTextileEligibility, listTextileProductionLots } from '@/services/textileProductionLotApi';
import { TableSkeleton } from '@/components/ui/BrandedLoading';

const STATUS_COLORS = {
    draft: { bg: '#f1f5f9', text: '#64748b' },
    in_progress: { bg: '#eff6ff', text: '#2563eb' },
    completed: { bg: '#f0fdf4', text: '#059669' },
};

export default function TextileProductionListPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const [lots, setLots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [eligible, setEligible] = useState(null);

    useEffect(() => {
        if (!selectedCompany?._id) {
            setEligible(null);
            setLots([]);
            setLoading(false);
            return;
        }
        getTextileEligibility(selectedCompany._id)
            .then(setEligible)
            .catch(() => setEligible({ eligible: false, message: 'Unable to check eligibility' }));
    }, [selectedCompany?._id]);

    useEffect(() => {
        if (!selectedCompany?._id || eligible?.eligible === false) {
            setLots([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        listTextileProductionLots({ companyId: selectedCompany._id, search: search || undefined })
            .then(setLots)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load lots'))
            .finally(() => setLoading(false));
    }, [selectedCompany?._id, search, eligible?.eligible]);

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Shirt size={22} color="#7c3aed" />
                    <div>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Textile Production Lots</h1>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Grey fabric inward through finished fabric — Textile / Handloom only</p>
                    </div>
                </div>
                <button
                    type="button"
                    disabled={!eligible?.eligible}
                    onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOTS_NEW)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: eligible?.eligible ? '#7c3aed' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: 6, cursor: eligible?.eligible ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 13 }}
                >
                    <Plus size={16} /> Create Textile Lot
                </button>
            </div>

            {eligible && !eligible.eligible && (
                <div style={{ padding: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 13, marginBottom: 12 }}>
                    {eligible.message || 'Select a company with Textile / Handloom industry template.'}
                </div>
            )}

            <div style={{ position: 'relative', marginBottom: 12, maxWidth: 360 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lot, roll, fabric..." style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {loading ? <TableSkeleton rows={5} cols={9} /> : lots.length === 0 ? (
                    <div style={{ padding: 36, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No textile lots found.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Lot No', 'Roll No', 'Fabric', 'Meter', 'Issued', 'Returned', 'Shortage', 'Stage', 'Status', ''].map((h) => (
                                    <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lots.map((lot) => {
                                const t = lot.textile || {};
                                const stage = lot.stages?.[lot.currentStageIndex];
                                const sc = STATUS_COLORS[lot.lotStatus] || STATUS_COLORS.draft;
                                return (
                                    <tr key={lot._id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px', fontWeight: 600 }}>{lot.lotNo}</td>
                                        <td style={{ padding: '10px' }}>{t.rollNo || '—'}</td>
                                        <td style={{ padding: '10px' }}>{t.fabricName || lot.itemName}</td>
                                        <td style={{ padding: '10px' }}>{t.meter ?? lot.qtyStarted}</td>
                                        <td style={{ padding: '10px' }}>{t.meterIssuedTotal ?? 0}</td>
                                        <td style={{ padding: '10px' }}>{t.meterReturnedTotal ?? 0}</td>
                                        <td style={{ padding: '10px', color: (t.shortageWastageTotal || 0) > 0 ? '#dc2626' : '#64748b' }}>{t.shortageWastageTotal ?? 0}</td>
                                        <td style={{ padding: '10px' }}>{stage ? `${stage.stageName} (${stage.status})` : '—'}</td>
                                        <td style={{ padding: '10px' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: 999, background: sc.bg, color: sc.text, fontWeight: 600, textTransform: 'capitalize' }}>{String(lot.lotStatus || '').replace('_', ' ')}</span>
                                        </td>
                                        <td style={{ padding: '10px' }}>
                                            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOT_DETAIL(lot._id))} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 5, cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Progress</button>
                                            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOT_REPORT(lot._id))} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>Report</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
