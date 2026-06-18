import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '@/utils/textileJobWorkProcessConfig';
import {
    getFinishedGoodsTransferReport,
    getPendingNextProcessReport,
    listProcessHistory,
} from '@/services/textileProcessOutputApi';

const tabs = [
    { id: 'pending', label: 'Pending Next Process' },
    { id: 'history', label: 'Process History' },
    { id: 'fg', label: 'FG Transfers' },
];

const th = { padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 700 };
const td = { padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const f = { input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 } };

function fmtHistoryDate(r) {
    const d = r.returnDate || r.issueDate || r.createdAt;
    return d ? new Date(d).toLocaleDateString() : '—';
}

export default function TextileProcessOutputReportsPage() {
    const navigate = useNavigate();
    const { selectedCompany, loading: companyLoading } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [tab, setTab] = useState('pending');
    const [processType, setProcessType] = useState('');
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (companyLoading) return;
        if (!selectedCompany?._id || !isTextile) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const params = { companyId: selectedCompany._id, limit: 200 };
            if (processType) params.processType = processType;
            if (search.trim()) params.search = search.trim();
            let data = [];
            if (tab === 'pending') data = await getPendingNextProcessReport(params);
            else if (tab === 'fg') data = await getFinishedGoodsTransferReport(params);
            else data = await listProcessHistory(params);
            setRows(data);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, isTextile, tab, processType, search, companyLoading]);

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
                    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Process Output Reports</h1>
                    <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Pending stock, trace history and finished goods transfers</p>
                </div>
                <button type="button" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: tab === t.id ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                            background: tab === t.id ? '#f5f3ff' : '#fff',
                            color: tab === t.id ? '#7c3aed' : '#64748b',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: 13,
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <label>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>PROCESS TYPE</div>
                    <select value={processType} onChange={(e) => setProcessType(e.target.value)} style={f.input}>
                        <option value="">All</option>
                        {TEXTILE_JOB_WORK_PROCESS_TYPES.map((pt) => (
                            <option key={pt} value={pt}>{pt}</option>
                        ))}
                    </select>
                </label>
                <label>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>SEARCH</div>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Challan, colour, vendor…" style={{ ...f.input, minWidth: 220 }} />
                </label>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
                {tab === 'pending' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Process', 'Challan', 'Return', 'Item', 'Colour', 'Balance', 'Vendor', 'Return Date', 'Status'].map((h) => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} style={{ ...td, padding: 24, color: '#94a3b8' }}>Loading…</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={9} style={{ ...td, padding: 24, color: '#94a3b8' }}>No pending process output.</td></tr>
                            ) : rows.map((r) => (
                                <tr key={r._id}>
                                    <td style={td}>{r.processType}</td>
                                    <td style={td}>{r.sourceChallanNo}</td>
                                    <td style={td}>{r.sourceReturnNo}</td>
                                    <td style={td}>{r.itemName}</td>
                                    <td style={td}>{r.colour || '—'}</td>
                                    <td style={td}><strong>{r.qtyBalance}</strong> {r.qtyUom} / <strong>{r.meterBalance}</strong> m</td>
                                    <td style={td}>{r.previousVendor || '—'}</td>
                                    <td style={td}>{r.returnDate ? new Date(r.returnDate).toLocaleDateString() : '—'}</td>
                                    <td style={td}>{r.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {tab === 'history' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Date / Dyer / Challan', 'Process', 'Event', 'Return', 'Item', 'Colour', 'Qty'].map((h) => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} style={{ ...td, padding: 24, color: '#94a3b8' }}>Loading…</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={7} style={{ ...td, padding: 24, color: '#94a3b8' }}>No process history yet.</td></tr>
                            ) : rows.map((r) => (
                                <tr key={r._id}>
                                    <td style={td}>
                                        <div style={{ fontWeight: 600 }}>{fmtHistoryDate(r)}</div>
                                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{r.vendorName || '—'}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginTop: 2 }}>{r.challanNo || '—'}</div>
                                    </td>
                                    <td style={td}>{r.processType}</td>
                                    <td style={td}>{r.eventType}</td>
                                    <td style={td}>{r.returnNo || '—'}</td>
                                    <td style={td}>{r.itemName || '—'}</td>
                                    <td style={td}>{r.colour || '—'}</td>
                                    <td style={td}>{r.qtyReturned} {r.qtyUom}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {tab === 'fg' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Date', 'Process', 'Challan', 'Return', 'Item', 'Colour', 'Qty', 'Vendor'].map((h) => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} style={{ ...td, padding: 24, color: '#94a3b8' }}>Loading…</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={8} style={{ ...td, padding: 24, color: '#94a3b8' }}>No finished goods transfers recorded.</td></tr>
                            ) : rows.map((r) => (
                                <tr key={r._id}>
                                    <td style={td}>{r.returnDate ? new Date(r.returnDate).toLocaleDateString() : (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—')}</td>
                                    <td style={td}>{r.processType}</td>
                                    <td style={td}>{r.challanNo || '—'}</td>
                                    <td style={td}>{r.returnNo || '—'}</td>
                                    <td style={td}>{r.itemName || '—'}</td>
                                    <td style={td}>{r.colour || '—'}</td>
                                    <td style={td}>{r.qtyReturned} {r.qtyUom}</td>
                                    <td style={td}>{r.vendorName || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
