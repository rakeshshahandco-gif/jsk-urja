import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, FileText } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { getTextileLotReport } from '@/services/textileProductionLotApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

export default function TextileLotReportPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getTextileLotReport(id)
            .then(setReport)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load report'))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return <BrandedLoader message="Loading report…" />;
    if (!report) return <div style={{ padding: 24 }}>Report not found</div>;

    return (
        <div style={{ padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOT_DETAIL(id))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
                <ChevronLeft size={16} /> Back to progress
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <FileText size={22} color="#7c3aed" />
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Textile Lot Report</h1>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>{report.lotNo} · Roll {report.rollNo}</p>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Fabric Details</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 13 }}>
                    <div><span style={{ color: '#64748b' }}>Fabric:</span> {report.fabricName}</div>
                    <div><span style={{ color: '#64748b' }}>Quality:</span> {report.fabricQuality || '—'}</div>
                    <div><span style={{ color: '#64748b' }}>Type:</span> {report.fabricType || '—'}</div>
                    <div><span style={{ color: '#64748b' }}>GSM:</span> {report.gsm ?? '—'}</div>
                    <div><span style={{ color: '#64748b' }}>Width:</span> {report.width ?? '—'}</div>
                    <div><span style={{ color: '#64748b' }}>Colour / Shade:</span> {report.colour} / {report.shade}</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                    ['Grey Fabric', report.greyFabricMeter],
                    ['Issued', report.meterIssuedTotal],
                    ['Returned', report.meterReturnedTotal],
                    ['Shortage / Wastage', report.shortageWastageTotal],
                    ['Finished Meter', report.finishedMeter],
                    ['Demo Finished Stock', report.demoFinishedStockMeter],
                    ['Available Grey', report.availableMeter],
                    ['Current Stage', report.currentStageName],
                ].map(([label, val]) => (
                    <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: label.includes('Shortage') && val > 0 ? '#dc2626' : '#0f172a' }}>{val ?? 0}{label === 'Current Stage' ? '' : ' m'}</div>
                    </div>
                ))}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Stage-wise WIP</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: '#f8fafc' }}>{['Stage', 'Status', 'Started', 'Completed', 'WIP Meter'].map((h) => <th key={h} style={{ padding: 8, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                    <tbody>
                        {(report.stages || []).map((s) => (
                            <tr key={s.index} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={{ padding: 8 }}>{s.stageName}</td>
                                <td style={{ padding: 8 }}>{s.status}</td>
                                <td style={{ padding: 8 }}>{s.qtyStarted}</td>
                                <td style={{ padding: 8 }}>{s.qtyCompleted}</td>
                                <td style={{ padding: 8 }}>{s.wipMeter}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>Dyeing Issues</h2>
                    {(report.dyeingIssues || []).length === 0 ? <p style={{ fontSize: 12, color: '#94a3b8' }}>None</p> : (
                        <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
                            {report.dyeingIssues.map((i) => <li key={i._id}>{i.issueNo}: {i.meterIssued} m — {i.dyerName || '—'} — Challan {i.dyeingChallanNo || '—'}</li>)}
                        </ul>
                    )}
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>Dyeing Returns</h2>
                    {(report.dyeingReturns || []).length === 0 ? <p style={{ fontSize: 12, color: '#94a3b8' }}>None</p> : (
                        <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
                            {report.dyeingReturns.map((r) => <li key={r._id}>{r.returnNo}: {r.meterReturned} m</li>)}
                        </ul>
                    )}
                </div>
            </div>

            <p style={{ marginTop: 16, fontSize: 11, color: '#94a3b8' }}>Demo-only finished stock is tracked on the lot document. No inventory ledger impact.</p>
        </div>
    );
}
