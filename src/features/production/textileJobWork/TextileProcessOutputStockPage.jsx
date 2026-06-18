import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, FlaskConical } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import { env } from '@/config/env';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '@/utils/textileJobWorkProcessConfig';
import { getProcessOutputSummary, getTextileDemoStatus, listProcessOutputStock } from '@/services/textileProcessOutputApi';
import TextileProcessOutputDemoModal from './TextileProcessOutputDemoModal';

const DEMO_CHALLAN_NO = 'TDC-DEMO-00001';

const th = { padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 700 };
const td = { padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const f = { input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 } };

const STATUS_COLORS = {
    Available: '#059669',
    'Partially Consumed': '#d97706',
    'Fully Consumed': '#94a3b8',
    'Transferred To FG': '#2563eb',
};

export default function TextileProcessOutputStockPage() {
    const navigate = useNavigate();
    const { selectedCompany, loading: companyLoading } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [processType, setProcessType] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [pendingOnly, setPendingOnly] = useState(true);
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [demoStatus, setDemoStatus] = useState(null);
    const [demoOpen, setDemoOpen] = useState(false);
    const demoEnabled = env.TEXTILE_DEMO_ENABLED;

    const load = useCallback(async () => {
        if (companyLoading) return;
        if (!selectedCompany?._id || !isTextile) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const params = {
                companyId: selectedCompany._id,
                pendingOnly: pendingOnly ? 'true' : 'false',
            };
            if (processType) params.processType = processType;
            if (status) params.status = status;
            if (search.trim()) params.search = search.trim();
            const [stock, sum] = await Promise.all([
                listProcessOutputStock(params),
                getProcessOutputSummary(selectedCompany._id),
            ]);
            setRows(stock);
            setSummary(sum);
            if (demoEnabled) {
                try {
                    const demo = await getTextileDemoStatus(selectedCompany._id);
                    setDemoStatus(demo);
                } catch {
                    setDemoStatus(null);
                }
            }
        } catch {
            setRows([]);
            setSummary([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, isTextile, processType, status, search, pendingOnly, companyLoading, demoEnabled]);

    useEffect(() => { load(); }, [load]);

    if (companyLoading) return <div style={{ padding: 24, color: '#64748b' }}>Loading company…</div>;
    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    return (
        <div style={{ padding: '16px 20px' }}>
            <button
                type="button"
                onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_JOB_WORK.ROOT)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}
            >
                <ChevronLeft size={16} /> Back
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div>
                    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Process Output Stock</h1>
                    <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Returned material available for the next process</p>
                </div>
                <button type="button" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
                    <RefreshCw size={14} /> Refresh
                </button>
                {demoEnabled && (
                    <button
                        type="button"
                        onClick={() => setDemoOpen(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #f59e0b', borderRadius: 8, background: '#fffbeb', color: '#b45309', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                    >
                        <FlaskConical size={14} /> Demo Transfer To Finished Goods
                    </button>
                )}
            </div>

            {demoEnabled && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                    <strong>DEMO MODE</strong> — localhost testing only. Demo challan <strong>{DEMO_CHALLAN_NO}</strong> does not affect real production challans.
                    {demoStatus?.finishedGoods ? (
                        <span> Demo Finished Goods balance: <strong>{demoStatus.finishedGoods.qtyPcs} PCS</strong> / {demoStatus.finishedGoods.meter} m ({demoStatus.finishedGoods.itemName}).</span>
                    ) : null}
                </div>
            )}

            {summary.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                    {summary.map((s) => (
                        <div key={s.processType} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>{s.processType}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{s.lines} lines</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{s.qtyBalance} qty / {s.meterBalance} m</div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
                <label>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>PROCESS TYPE</div>
                    <select value={processType} onChange={(e) => setProcessType(e.target.value)} style={f.input}>
                        <option value="">All processes</option>
                        {TEXTILE_JOB_WORK_PROCESS_TYPES.map((pt) => (
                            <option key={pt} value={pt}>{pt}</option>
                        ))}
                    </select>
                </label>
                <label>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>STATUS</div>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} style={f.input}>
                        <option value="">All</option>
                        <option value="Available">Available</option>
                        <option value="Partially Consumed">Partially Consumed</option>
                        <option value="Fully Consumed">Fully Consumed</option>
                        <option value="Transferred To FG">Transferred To FG</option>
                    </select>
                </label>
                <label>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>SEARCH</div>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Challan, colour, vendor…" style={{ ...f.input, minWidth: 200 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
                    <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
                    <span style={{ fontSize: 13 }}>Pending balance only</span>
                </label>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Process', 'Return', 'Item', 'Colour', 'Lot / Than', 'Original', 'Balance', 'Vendor', 'Status', 'Return Date'].map((h) => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={10} style={{ ...td, color: '#94a3b8', padding: 24 }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={10} style={{ ...td, color: '#94a3b8', padding: 24 }}>No process output stock found. Record a return with &quot;Keep as Process Output Stock&quot; first.</td></tr>
                        ) : rows.map((r) => (
                            <tr key={r._id} style={r.sourceChallanNo === DEMO_CHALLAN_NO ? { background: '#fffbeb' } : undefined}>
                                <td style={td}>
                                    <strong>{r.processType}</strong>
                                    {r.sourceChallanNo === DEMO_CHALLAN_NO && (
                                        <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', color: '#b45309' }}>DEMO</span>
                                    )}
                                </td>
                                <td style={td}>{r.sourceChallanNo}<br /><span style={{ fontSize: 11, color: '#64748b' }}>{r.sourceReturnNo}</span></td>
                                <td style={td}>{r.itemName}</td>
                                <td style={td}>{r.colour || '—'}</td>
                                <td style={td}>{r.lotNo || '—'} / {r.thanNo || '—'}</td>
                                <td style={td}>{r.qtyOriginal} {r.qtyUom}<br /><span style={{ fontSize: 11, color: '#64748b' }}>{r.meterOriginal} m</span></td>
                                <td style={td}><strong>{r.qtyBalance}</strong> {r.qtyUom}<br /><strong>{r.meterBalance}</strong> m</td>
                                <td style={td}>{r.previousVendor || '—'}</td>
                                <td style={{ ...td, color: STATUS_COLORS[r.status] || '#64748b', fontWeight: 600 }}>{r.status}</td>
                                <td style={td}>{r.returnDate ? new Date(r.returnDate).toLocaleDateString() : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {demoEnabled && demoStatus?.audit?.length > 0 && (
                <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontSize: 14, fontWeight: 800 }}>Demo Audit Log</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Date', 'Item', 'Colour', 'Qty', 'Source Process', 'User'].map((h) => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {demoStatus.audit.map((a) => (
                                <tr key={a._id}>
                                    <td style={td}>{a.date ? new Date(a.date).toLocaleString() : '—'}</td>
                                    <td style={td}>{a.itemName}</td>
                                    <td style={td}>{a.colour}</td>
                                    <td style={td}>{a.qtyPcs} PCS</td>
                                    <td style={td}>{a.sourceProcess}</td>
                                    <td style={td}>{a.userName || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {demoEnabled && (
                <TextileProcessOutputDemoModal
                    open={demoOpen}
                    onClose={() => setDemoOpen(false)}
                    companyId={selectedCompany?._id}
                    demoStatus={demoStatus}
                    onComplete={load}
                />
            )}
        </div>
    );
}
