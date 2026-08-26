import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';
import { HISTORY_CLEARED_EVENT } from './clearHistoryUi.util';

const DASH = '—';
const PAGE_SIZES = [20, 50, 100];

function val(v) {
    const s = v == null ? '' : String(v).trim();
    return s || DASH;
}

const btn = (bg, color = '#fff') => ({
    padding: '6px 12px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
});

function Field({ label, value, source }) {
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val(value)}</div>
            {source && String(value || '').trim() ? (
                <div style={{ fontSize: 11, color: '#0f766e' }}>Source: {source}</div>
            ) : null}
        </div>
    );
}

function downloadBlob(res, fallbackName) {
    const blob = res?.data instanceof Blob ? res.data : new Blob([res.data || res]);
    const cd = res?.headers?.['content-disposition'] || '';
    const named = /filename="?([^"]+)"?/i.exec(cd);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = named?.[1] || fallbackName;
    a.click();
    URL.revokeObjectURL(url);
}

export default function InstagramCaptureResults({ keyword, location, campaignId, reloadToken }) {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [appliedKeyword, setAppliedKeyword] = useState(keyword);
    const [appliedLocation, setAppliedLocation] = useState(location);
    const [appliedCampaign, setAppliedCampaign] = useState(campaignId || '');
    const [data, setData] = useState({ results: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState(null);
    const [exporting, setExporting] = useState('');
    const [enriching, setEnriching] = useState(false);

    useEffect(() => {
        setAppliedKeyword(keyword);
        setAppliedLocation(location);
        setAppliedCampaign(campaignId || '');
        setPage(1);
    }, [reloadToken]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await dataExtractorApi.listInstagramCaptures({
                keyword: appliedKeyword || undefined,
                location: appliedLocation || undefined,
                campaignId: appliedCampaign || undefined,
                page,
                limit,
            });
            setData(res);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load Instagram captures');
        } finally {
            setLoading(false);
        }
    }, [appliedKeyword, appliedLocation, appliedCampaign, page, limit]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const onCleared = () => { load(); };
        window.addEventListener(HISTORY_CLEARED_EVENT, onCleared);
        return () => window.removeEventListener(HISTORY_CLEARED_EVENT, onCleared);
    }, [load]);

    const applyFormFilters = () => {
        setAppliedKeyword(keyword);
        setAppliedLocation(location);
        setAppliedCampaign('');
        setPage(1);
    };

    const onEnrichWebsites = async () => {
        setEnriching(true);
        try {
            const res = await dataExtractorApi.enrichInstagramWebsites({
                keyword: appliedKeyword || undefined,
                location: appliedLocation || undefined,
                campaignId: appliedCampaign || undefined,
            });
            toast.success(`Website enrichment: ${res?.withWebsite || 0} site(s). ${res?.skippedWithoutWebsite || 0} without a site.`);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Website enrichment failed');
        } finally {
            setEnriching(false);
        }
    };

    const onExport = async (format) => {
        setExporting(format);
        try {
            const res = await dataExtractorApi.exportInstagramCaptures({
                keyword: appliedKeyword || undefined,
                location: appliedLocation || undefined,
                campaignId: appliedCampaign || undefined,
                format,
            });
            downloadBlob(res, `instagram-captures.${format === 'csv' ? 'csv' : 'xlsx'}`);
            toast.success(`${format.toUpperCase()} downloaded (${data.pagination?.total || 0} matching row(s), not only this page)`);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Export failed');
        } finally {
            setExporting('');
        }
    };

    const rows = data.results || [];
    const pg = data.pagination || {};

    return (
        <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 14 }}>Captured Instagram results</strong>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                    {loading ? 'Loading…' : `${pg.total || 0} stored RawCapture(s)`}
                    {appliedKeyword ? ` · keyword “${appliedKeyword}”` : ''}
                    {appliedLocation ? ` · location “${appliedLocation}”` : ''}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button type="button" style={btn('#fff', '#334155')} onClick={applyFormFilters}>
                        Show stored results
                    </button>
                    <button type="button" style={btn('#0f766e')} disabled={enriching} onClick={onEnrichWebsites}>
                        {enriching ? 'Enriching websites…' : 'Enrich websites'}
                    </button>
                    <button type="button" style={btn('#0f766e')} disabled={!!exporting} onClick={() => onExport('xlsx')}>
                        {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
                    </button>
                    <button type="button" style={btn('#fff', '#334155')} disabled={!!exporting} onClick={() => onExport('csv')}>
                        {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
                    </button>
                </span>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                This is a view of existing RawCapture / Processing / company identity data. Missing values show {DASH}.
                Website-enriched fields are shown only when the existing website crawler has already run — they are never labelled as Instagram.
            </p>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Profile', 'Username', 'Category', 'City', 'Phone', 'Email', 'Website (Instagram)', 'Followers', 'Enrichment', 'CRM', ''].map((h) => (
                                <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length ? rows.map((row) => {
                            const ig = row.instagram || {};
                            const wf = row.workflow || {};
                            return (
                                <tr key={row.rawCaptureId} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                        <div style={{ fontWeight: 600 }}>{val(ig.profileName)}</div>
                                        <div style={{ color: '#64748b' }}>{val(ig.searchKeyword)} · {val(ig.searchLocation)}</div>
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {ig.profileUrl ? <a href={ig.profileUrl} target="_blank" rel="noreferrer">{ig.username || ig.profileUrl}</a> : val(ig.username)}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>{val(ig.businessCategory)}</td>
                                    <td style={{ padding: '8px 10px' }}>{val(ig.city)}</td>
                                    <td style={{ padding: '8px 10px' }}>{val(ig.phone)}</td>
                                    <td style={{ padding: '8px 10px' }}>{val(ig.email)}</td>
                                    <td style={{ padding: '8px 10px', maxWidth: 180, wordBreak: 'break-all' }}>
                                        {ig.website ? <a href={ig.website} target="_blank" rel="noreferrer">{ig.website}</a> : DASH}
                                        {ig.website ? <div style={{ color: '#0f766e', fontSize: 11 }}>Source: Instagram</div> : null}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>{val(ig.followers)}</td>
                                    <td style={{ padding: '8px 10px' }}>{val(wf.enrichment)}</td>
                                    <td style={{ padding: '8px 10px' }}>{val(wf.crm)}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <button type="button" style={btn('#1d4ed8')} onClick={() => setDetail(row)}>View Full Data</button>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={11} style={{ padding: 16, color: '#64748b' }}>
                                    {loading ? 'Loading stored captures…' : 'No stored Instagram RawCaptures for this filter.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 12 }}>
                <span>Per page</span>
                <select
                    value={limit}
                    onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                    style={{ padding: 4, borderRadius: 6, border: '1px solid #cbd5e1' }}
                >
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ color: '#64748b' }}>Page size is not a total cap. {pg.total || 0} result(s) available.</span>
                <span style={{ marginLeft: 'auto' }}>
                    <button type="button" disabled={page <= 1} style={btn('#fff', '#334155')} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                    {' '}
                    {pg.page || page} / {pg.totalPages || 1}
                    {' '}
                    <button type="button" disabled={(pg.page || page) >= (pg.totalPages || 1)} style={btn('#fff', '#334155')} onClick={() => setPage((p) => p + 1)}>Next</button>
                </span>
            </div>

            {detail ? (
                <div
                    role="dialog"
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80,
                        display: 'flex', justifyContent: 'flex-end',
                    }}
                    onClick={() => setDetail(null)}
                >
                    <div
                        style={{
                            width: 'min(560px, 100%)', height: '100%', background: '#fff',
                            overflowY: 'auto', padding: 20, boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 16 }}>Full captured data</h3>
                            <button type="button" style={btn('#fff', '#334155')} onClick={() => setDetail(null)}>Close</button>
                        </div>
                        <p style={{ fontSize: 12, color: '#64748b' }}>RawCapture {detail.rawCaptureId}</p>

                        <h4 style={{ marginBottom: 8, fontSize: 13 }}>Identity</h4>
                        <Field label="Company/Profile Name" value={detail.instagram?.profileName} source="Instagram" />
                        <Field label="Username" value={detail.instagram?.username} source="Instagram" />
                        <Field label="Display Name" value={detail.instagram?.displayName} source="Instagram" />
                        <Field label="Business Type / Category" value={detail.instagram?.businessCategory} source="Instagram" />
                        <Field label="Business/professional account" value={detail.instagram?.businessAccount} source="Instagram" />

                        <h4 style={{ marginBottom: 8, fontSize: 13 }}>Instagram Data</h4>
                        <Field label="Email" value={detail.instagram?.email} source={detail.instagram?.email ? 'Instagram' : ''} />
                        <Field label="Phone" value={detail.instagram?.phone} source={detail.instagram?.phone ? 'Instagram' : ''} />
                        <Field label="Website / External website" value={detail.instagram?.website} source={detail.instagram?.website ? 'Instagram' : ''} />
                        <Field label="WhatsApp / contact link" value={detail.instagram?.whatsapp} source={detail.instagram?.whatsapp ? 'Instagram' : ''} />
                        <Field label="Address" value={detail.instagram?.address} source={detail.instagram?.address ? 'Instagram' : ''} />
                        <Field label="City / Location" value={detail.instagram?.city} source={detail.instagram?.city ? 'Instagram' : ''} />
                        <Field label="Followers" value={detail.instagram?.followers} source={detail.instagram?.followers ? 'Instagram' : ''} />
                        <Field label="Following" value={detail.instagram?.following} source={detail.instagram?.following ? 'Instagram' : ''} />
                        <Field label="Bio / Description" value={detail.instagram?.bio} source="Instagram" />

                        <h4 style={{ marginBottom: 8, fontSize: 13 }}>Website-Enriched Data</h4>
                        <p style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8 }}>
                            Crawler status: {val(detail.websiteEnriched?.status)}. These fields come from the company website crawler, not from Instagram.
                        </p>
                        <Field label="Company name" value={detail.websiteEnriched?.companyName} source={detail.websiteEnriched?.ran ? 'company website' : ''} />
                        <Field label="Website" value={detail.websiteEnriched?.website} source={detail.websiteEnriched?.website ? 'company website' : ''} />
                        <Field label="Email" value={detail.websiteEnriched?.email} source={detail.websiteEnriched?.email ? 'company website' : ''} />
                        <Field label="Phone" value={detail.websiteEnriched?.phone} source={detail.websiteEnriched?.phone ? 'company website' : ''} />
                        <Field label="Address" value={detail.websiteEnriched?.address} source={detail.websiteEnriched?.address ? 'company website' : ''} />
                        <Field label="City / State / Country" value={[detail.websiteEnriched?.city, detail.websiteEnriched?.state, detail.websiteEnriched?.country].filter(Boolean).join(', ')} source={(detail.websiteEnriched?.city || detail.websiteEnriched?.state || detail.websiteEnriched?.country) ? 'company website' : ''} />
                        <Field label="Product / business description" value={detail.websiteEnriched?.description} source={detail.websiteEnriched?.description ? 'company website' : ''} />

                        <h4 style={{ marginBottom: 8, fontSize: 13 }}>Social</h4>
                        <Field label="Instagram URL" value={detail.instagram?.profileUrl} source="Instagram" />
                        <Field label="Facebook" value={detail.facebook} />
                        <Field label="LinkedIn" value={detail.linkedin} />
                        <Field label="X" value={detail.x} />

                        <h4 style={{ marginBottom: 8, fontSize: 13 }}>Source Evidence</h4>
                        <Field label="Source URL" value={detail.instagram?.originalSourceUrl} source="Instagram" />
                        <Field label="Search keyword" value={detail.instagram?.searchKeyword} />
                        <Field label="Search location" value={detail.instagram?.searchLocation} />
                        <Field label="Search type" value={detail.instagram?.searchType} />
                        <Field label="Captured text / snippet" value={detail.instagram?.sourceEvidence} source="Instagram" />
                        <Field label="Capture timestamp" value={detail.instagram?.capturedAt} />
                        <Field label="RawCapture ID" value={detail.rawCaptureId} />

                        <h4 style={{ marginBottom: 8, fontSize: 13 }}>Workflow</h4>
                        <Field label="Processing" value={detail.workflow?.processing} />
                        <Field label="Enrichment" value={detail.workflow?.enrichment} />
                        <Field label="Qualification" value={detail.workflow?.qualificationLabel} />
                        <Field label="Verification" value={detail.workflow?.verification} />
                        <Field label="Consolidation" value={detail.workflow?.consolidation} />
                        <Field label="CRM status" value={detail.workflow?.crm} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                            {detail.workflow?.sessionId ? (
                                <Link to={PATHS.DATA_EXTRACTOR.RUN(detail.workflow.sessionId)}>Open Processing → Verified Data</Link>
                            ) : (
                                <Link to={PATHS.DATA_EXTRACTOR.SIMPLE_LEAD_SEARCH}>Open Processing</Link>
                            )}
                            <Link to={PATHS.DATA_EXTRACTOR.CONSOLIDATED_COMPANIES}>Open Consolidated Companies</Link>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
