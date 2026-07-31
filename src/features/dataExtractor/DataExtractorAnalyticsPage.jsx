import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };
const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

function Kpi({ label, value, hint }) {
    return (
        <div style={{ ...card, marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value ?? 0}</div>
            {hint && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
        </div>
    );
}

function metricValue(m) {
    if (m == null) return 0;
    if (typeof m === 'number') return m;
    return m.value ?? m.numerator ?? m.count ?? 0;
}

const TABS = [
    { id: 'executive', label: 'Executive', section: null, perm: 'data_extractor.analytics.view' },
    { id: 'funnel', label: 'Funnel', section: 'funnel', perm: 'data_extractor.analytics.view' },
    { id: 'discovery', label: 'Discovery', section: 'discovery', perm: 'data_extractor.analytics.discovery' },
    { id: 'data-quality', label: 'Data Quality', section: 'data-quality', perm: 'data_extractor.analytics.discovery' },
    { id: 'lead-scoring', label: 'Lead Scores', section: 'lead-scoring', perm: 'data_extractor.analytics.lead_intelligence' },
    { id: 'industry', label: 'Industry', section: 'industry', perm: 'data_extractor.analytics.lead_intelligence' },
    { id: 'product', label: 'Product', section: 'product', perm: 'data_extractor.analytics.product' },
    { id: 'contact', label: 'Contacts', section: 'contact', perm: 'data_extractor.analytics.contact' },
    { id: 'market', label: 'Market', section: 'market', perm: 'data_extractor.analytics.market' },
    { id: 'crm-enrichment', label: 'CRM Conversion', section: 'crm-enrichment', perm: 'data_extractor.analytics.crm_conversion' },
    { id: 'sales-workflow', label: 'Sales Workflow', section: 'sales-workflow', perm: 'data_extractor.analytics.sales_workflow' },
    { id: 'batches', label: 'Batches', section: 'batches', perm: 'data_extractor.analytics.batch_monitor' },
    { id: 'user-activity', label: 'User Activity', section: 'user-activity', perm: 'data_extractor.analytics.user_activity' },
];

export default function DataExtractorAnalyticsPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.analytics.view') || can(hasPermission, 'data_extractor.analytics.executive');
    const canRefresh = can(hasPermission, 'data_extractor.analytics.refresh');
    const canExport = can(hasPermission, 'data_extractor.analytics.export');

    const [tab, setTab] = useState('executive');
    const [dateRange, setDateRange] = useState('last_30_days');
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState('');
    const [savedName, setSavedName] = useState('');

    const params = useMemo(() => ({ dateRange }), [dateRange]);

    const load = useCallback(async () => {
        if (!canView) return;
        setBusy('load');
        try {
            let result;
            if (tab === 'executive') result = await dataExtractorApi.getAnalyticsExecutive(params);
            else if (tab === 'funnel') result = await dataExtractorApi.getAnalyticsFunnel(params);
            else result = await dataExtractorApi.getAnalyticsSection(tab, params);
            setData(result);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load analytics');
            setData(null);
        } finally {
            setBusy('');
        }
    }, [canView, tab, params]);

    useEffect(() => { load(); }, [load]);

    if (!canView) {
        return <div style={card}>You do not have permission to view Executive Analytics.</div>;
    }

    const metrics = data?.metrics || {};
    const stages = data?.stages || [];
    const dims = data?.dimensions || {};
    const jobs = data?.jobs || data?.recentJobs || [];

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Executive Analytics</h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                    Read-only pipeline monitoring for Phases 1–14. This dashboard never starts discovery, AI, CRM conversion, assignment, tasks, follow-ups, email or WhatsApp.
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <select style={field} value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last_7_days">Last 7 days</option>
                    <option value="last_30_days">Last 30 days</option>
                    <option value="current_month">Current month</option>
                    <option value="previous_month">Previous month</option>
                    <option value="current_fy">Current FY</option>
                </select>
                <button type="button" style={btn} disabled={!!busy} onClick={load}>Refresh view</button>
                {canRefresh && (
                    <button type="button" style={btnPrimary} disabled={!!busy} onClick={async () => {
                        setBusy('snap');
                        try {
                            await dataExtractorApi.refreshAnalytics({ dateRange });
                            toast.success('Snapshot refreshed');
                            await load();
                        } catch (e) {
                            toast.error(e?.response?.data?.message || 'Refresh failed');
                        } finally { setBusy(''); }
                    }}>Force snapshot refresh</button>
                )}
                {canExport && (
                    <button type="button" style={btn} disabled={!!busy} onClick={async () => {
                        try {
                            const out = await dataExtractorApi.exportAnalytics({ section: tab === 'executive' ? 'executive' : tab, dateRange, format: 'json' });
                            toast.success(`Export ready (${out?.generatedAt || 'ok'})`);
                        } catch (e) {
                            toast.error(e?.response?.data?.message || 'Export failed');
                        }
                    }}>Export</button>
                )}
                {can(hasPermission, 'data_extractor.analytics.saved_views') && (
                    <>
                        <input style={field} placeholder="Save view name" value={savedName} onChange={(e) => setSavedName(e.target.value)} />
                        <button type="button" style={btn} disabled={!savedName || !!busy} onClick={async () => {
                            try {
                                await dataExtractorApi.createAnalyticsSavedView({ name: savedName, scope: 'PERSONAL', filters: { dateRange } });
                                toast.success('View saved');
                                setSavedName('');
                            } catch (e) {
                                toast.error(e?.response?.data?.message || 'Save failed');
                            }
                        }}>Save view</button>
                    </>
                )}
            </div>

            <div style={{ ...card, fontSize: 12, color: '#475569' }}>
                Active filters: dateRange={dateRange}
                {data?.filters?.scopeLabel ? ` · ${data.filters.scopeLabel}` : ''}
                {' · '}Last refreshed: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}
                {data?.dataThrough ? ` · Data through: ${new Date(data.dataThrough).toLocaleString()}` : ''}
                {data?.fromCache ? ' · (cached snapshot)' : ''}
                {data?.aggregateOnly ? ' · Aggregate-only (no record details)' : ''}
                <button type="button" style={{ ...btn, marginLeft: 8 }} onClick={() => setDateRange('last_30_days')}>Clear filters</button>
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                {TABS.filter((t) => can(hasPermission, t.perm) || t.id === 'executive' || t.id === 'funnel').map((t) => (
                    <button key={t.id} type="button" style={tab === t.id ? btnPrimary : btn} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {busy && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Loading…</div>}

            {!data && !busy && <div style={card}>No analytics data for this filter. Empty datasets return zero safely.</div>}

            {tab === 'executive' && data?.metrics && (
                <div style={kpiGrid}>
                    {Object.entries(metrics).map(([k, v]) => (
                        <Kpi key={k} label={v?.label || k} value={metricValue(v)} hint={v?.sourceModel || v?.definition?.slice?.(0, 80)} />
                    ))}
                </div>
            )}

            {tab === 'funnel' && (
                <div style={card}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Pipeline funnel</div>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th align="left">Stage</th><th>Count</th><th>Conv prev %</th><th>Conv discovered %</th><th>Drop-off</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(stages.length ? stages : (data?.metrics?.stages || [])).map((s) => (
                                <tr key={s.id || s.label}>
                                    <td>{s.label}{s.optional ? ' (optional)' : ''}</td>
                                    <td align="center">{s.count}</td>
                                    <td align="center">{s.conversionFromPrevious ?? s.fromPrevious ?? '—'}</td>
                                    <td align="center">{s.conversionFromDiscovered ?? s.fromDiscovered ?? '—'}</td>
                                    <td align="center">{s.dropOffFromPrevious ?? s.dropOff ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!stages.length && !data?.metrics?.stages && <div style={{ color: '#94a3b8' }}>No funnel stages returned.</div>}
                </div>
            )}

            {tab !== 'executive' && tab !== 'funnel' && data && (
                <div>
                    <div style={kpiGrid}>
                        {Object.entries(metrics).map(([k, v]) => (
                            <Kpi key={k} label={v?.label || k} value={metricValue(v)} hint={typeof v === 'object' && v.pct != null ? `${v.numerator ?? ''} / ${v.denominator ?? ''} (${v.pct}%)` : undefined} />
                        ))}
                    </div>
                    {Object.entries(dims).map(([name, rows]) => (
                        <div key={name} style={card}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>{name}</div>
                            <div style={{ fontSize: 12 }}>
                                {(Array.isArray(rows) ? rows : []).slice(0, 20).map((r, i) => (
                                    <div key={i}>{r.key || r.label || r.action || JSON.stringify(r)} — {r.count ?? r.value ?? ''}</div>
                                ))}
                                {!rows?.length && <span style={{ color: '#94a3b8' }}>Empty</span>}
                            </div>
                        </div>
                    ))}
                    {!!jobs.length && (
                        <div style={card}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>Jobs</div>
                            {(jobs || []).slice(0, 30).map((j) => (
                                <div key={String(j.id)} style={{ fontSize: 12 }}>
                                    [{j.phase || ''}] {j.jobType || ''} — {j.status} — ok {j.succeeded ?? j.successCount ?? 0} / fail {j.failed ?? j.failedCount ?? 0}
                                </div>
                            ))}
                        </div>
                    )}
                    {(data.notes || []).map((n, i) => <div key={i} style={{ fontSize: 11, color: '#64748b' }}>• {n}</div>)}
                    {data.labels?.coverage && (
                        <div style={{ ...card, background: '#f8fafc' }}>
                            Coverage label: <strong>{data.labels.coverage}</strong> (not market share)
                        </div>
                    )}
                </div>
            )}

            <div style={{ ...card, marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Drill-down (existing screens)</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                    <Link to={PATHS.DATA_EXTRACTOR.LEAD_SCORING}>Lead Scoring</Link>
                    <Link to={PATHS.DATA_EXTRACTOR.CONTACT_INTELLIGENCE}>Contact Intelligence</Link>
                    <Link to={PATHS.DATA_EXTRACTOR.CRM_ENRICHMENT}>CRM Enrichment</Link>
                    <Link to={PATHS.DATA_EXTRACTOR.SALES_WORKFLOW}>Sales Workflow</Link>
                    <Link to={PATHS.DATA_EXTRACTOR.SIMILAR_COMPANY}>Similar Companies</Link>
                    <Link to={PATHS.DATA_EXTRACTOR.LEADS}>Extracted Leads</Link>
                </div>
            </div>
        </div>
    );
}