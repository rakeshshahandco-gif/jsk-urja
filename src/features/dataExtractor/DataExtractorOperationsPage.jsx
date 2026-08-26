import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', minWidth: 120 };
const field = { padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 };
const btn = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 };

function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function DataExtractorOperationsPage() {
    const [filters, setFilters] = useState({ keyword: '', location: '', source: '' });
    const [dash, setDash] = useState(null);
    const [health, setHealth] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cleanup, setCleanup] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.keyword.trim()) params.keyword = filters.keyword.trim();
            if (filters.location.trim()) params.location = filters.location.trim();
            if (filters.source) params.source = filters.source;
            const [d, h, c] = await Promise.all([
                dataExtractorApi.getOpsDashboard(params),
                dataExtractorApi.getOpsSourceHealth(),
                dataExtractorApi.getOpsCampaigns(),
            ]);
            setDash(d);
            setHealth(h);
            setCampaigns(c?.results || c || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load operations dashboard');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    const kpis = dash ? [
        ['Raw Evidence Records', dash.rawEvidenceRecords],
        ['Unique Companies', dash.uniqueCompanies],
        ['Highly Relevant', dash.highlyRelevant],
        ['Relevant', dash.relevant],
        ['Possibly Relevant', dash.possiblyRelevant],
        ['Not Relevant', dash.notRelevant],
        ['With Website', dash.withWebsite],
        ['With Email', dash.withEmail],
        ['With Phone', dash.withPhone],
        ['Verified Companies', dash.verifiedCompanies],
        ['Already Existing in CRM', dash.alreadyExistingInCrm],
        ['New Qualified Companies', dash.newQualifiedCompanies],
        ['Converted to CRM Leads', dash.convertedToCrmLeads],
    ] : [];

    const q = dash?.quality || {};

    return (
        <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Operations Dashboard</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 0 }}>
                Unique companies are counted from consolidated company identity. Test-only fixtures are excluded. CRM leads are never created automatically.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                <input placeholder="Keyword" value={filters.keyword} onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))} style={field} />
                <input placeholder="Location" value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))} style={field} />
                <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} style={field}>
                    <option value="">All sources</option>
                    {['web', 'facebook', 'instagram', 'linkedin', 'x', 'indiamart', 'tradeindia', 'justdial'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="button" style={btn} onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Apply filters'}</button>
                <button
                    type="button"
                    style={{ ...btn, background: '#0f766e' }}
                    onClick={async () => {
                        try {
                            const res = await dataExtractorApi.consolidateOpsCompanies();
                            toast.success(`Identities: ${res.uniqueCompanies ?? 0} unique · new ${res.incremental?.new ?? 0} · known ${res.incremental?.known ?? 0} · updated ${res.incremental?.updated ?? 0}`);
                            await load();
                        } catch (e) {
                            toast.error(e?.response?.data?.message || 'Consolidate failed');
                        }
                    }}
                >
                    Re-evaluate identities
                </button>
                <Link to={PATHS.DATA_EXTRACTOR.CONSOLIDATED_COMPANIES} style={{ fontSize: 13 }}>Consolidated companies</Link>
                <Link to={PATHS.DATA_EXTRACTOR.SAVED_SEARCHES} style={{ fontSize: 13 }}>Saved searches</Link>
            </div>

            {dash?.keyword || dash?.location ? (
                <h3 style={{ fontSize: 16, margin: '8px 0 12px' }}>{[dash.keyword, dash.location].filter(Boolean).join(' — ').toUpperCase()}</h3>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                {kpis.map(([label, val]) => (
                    <div key={label} style={card}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{val ?? 0}</div>
                    </div>
                ))}
            </div>

            <h3 style={{ fontSize: 15 }}>Data quality</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>Completeness percentages are separate from AI relevance score.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                {[
                    ['With Website', q.withWebsitePct],
                    ['With Email', q.withEmailPct],
                    ['With Phone', q.withPhonePct],
                    ['Email + Phone', q.withBothPct],
                    ['Verified', q.verifiedPct],
                    ['High Relevance', q.highRelevancePct],
                    ['Possible Duplicates', q.possibleDuplicatesPct],
                    ['Missing Location', q.missingLocationPct],
                ].map(([label, val]) => (
                    <div key={label} style={card}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                        <div style={{ fontWeight: 700 }}>{val ?? 0}%</div>
                    </div>
                ))}
            </div>

            <h3 style={{ fontSize: 15 }}>Source performance</h3>
            <div style={{ overflowX: 'auto', marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Source', 'Raw', 'Unique Companies', 'Qualified', 'Email', 'Phone', 'Useful %', 'Email yield'].map((h) => (
                                <th key={h} style={{ padding: 8 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(dash?.sourcePerformance || []).map((r) => (
                            <tr key={r.source} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>{r.source}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.raw}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.uniqueCompanies}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.qualified}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.email}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.phone}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.usefulRate}%</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.emailYield}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h3 style={{ fontSize: 15 }}>Source health</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                LinkedIn Direct / X Direct stay Login Required until the owner logs in. Cookies and tokens are never shown.
                {!health?.linkedinDirectValidated ? ' LinkedIn Direct = NOT VALIDATED.' : ''}
                {!health?.xDirectValidated ? ' X Direct = NOT VALIDATED.' : ''}
            </p>
            <div style={{ overflowX: 'auto', marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Source', 'Status', 'Last Success', 'Last Error', 'Reconnect'].map((h) => <th key={h} style={{ padding: 8 }}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {(health?.sources || []).map((r) => (
                            <tr key={r.source} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>{r.source}</td>
                                <td style={{ padding: 8 }}>{r.status}</td>
                                <td style={{ padding: 8 }}>{fmtDate(r.lastSuccess)}</td>
                                <td style={{ padding: 8, color: '#64748b' }}>{r.lastError || '—'}</td>
                                <td style={{ padding: 8 }}>
                                    {r.reconnect && r.source === 'Facebook' ? <Link to={PATHS.DATA_EXTRACTOR.FACEBOOK}>Connect</Link> : null}
                                    {r.reconnect && r.source === 'Instagram' ? <Link to={PATHS.DATA_EXTRACTOR.INSTAGRAM}>Connect</Link> : null}
                                    {r.reconnect && r.source === 'LinkedIn' ? <Link to={PATHS.DATA_EXTRACTOR.LINKEDIN}>Connect</Link> : null}
                                    {r.reconnect && r.source === 'X' ? <Link to={PATHS.DATA_EXTRACTOR.X}>Connect</Link> : null}
                                    {!r.reconnect ? '—' : null}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h3 style={{ fontSize: 15 }}>Campaign analytics</h3>
            <div style={{ overflowX: 'auto', marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Keyword', 'Status', 'Stop reason', 'Batch size', 'Total captured', 'Unique', 'Queries'].map((h) => <th key={h} style={{ padding: 8 }}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map((c) => (
                            <tr key={c.jobId} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}><Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(c.jobId)}>{c.keyword || c.jobId}</Link></td>
                                <td style={{ padding: 8 }}>{c.status}</td>
                                <td style={{ padding: 8 }}>{c.stopReason || '—'}</td>
                                <td style={{ padding: 8 }}>{c.batchSize}</td>
                                <td style={{ padding: 8 }}>{c.totalCaptured}</td>
                                <td style={{ padding: 8 }}>{c.uniqueCompanies}</td>
                                <td style={{ padding: 8 }}>{c.queriesGenerated}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h3 style={{ fontSize: 15 }}>Admin: test-data cleanup</h3>
            <p style={{ fontSize: 12, color: '#64748b' }}>Archives records marked testOnly = true only. Genuine extraction data is never deleted.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                    type="button"
                    style={{ ...btn, background: '#334155' }}
                    onClick={async () => {
                        try {
                            setCleanup(await dataExtractorApi.previewOpsTestCleanup());
                        } catch (e) {
                            toast.error(e?.response?.data?.message || 'Preview failed');
                        }
                    }}
                >
                    Preview test-only count
                </button>
                {cleanup ? (
                    <>
                        <span style={{ fontSize: 13 }}>Identities: {cleanup.testOnlyIdentities} · RawCaptures: {cleanup.testOnlyRawCaptures}</span>
                        <button
                            type="button"
                            style={{ ...btn, background: '#b91c1c' }}
                            onClick={async () => {
                                if (!window.confirm(`Archive ${cleanup.testOnlyIdentities} test-only identities? Genuine records will not be deleted.`)) return;
                                try {
                                    const res = await dataExtractorApi.cleanupOpsTestData({ confirm: true });
                                    toast.success(`Archived ${res.identitiesArchived || 0} test-only identities`);
                                    setCleanup(res);
                                    await load();
                                } catch (e) {
                                    toast.error(e?.response?.data?.message || 'Cleanup failed');
                                }
                            }}
                        >
                            Confirm cleanup
                        </button>
                    </>
                ) : null}
            </div>
        </div>
    );
}
