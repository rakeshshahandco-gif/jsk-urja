import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const btn = (bg, color = '#fff') => ({
    padding: '7px 12px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
});

const CATEGORIES = ['Highly Relevant', 'Relevant', 'Possibly Relevant', 'Not Relevant', 'Insufficient Information'];

function scoreColor(score) {
    if (score == null) return '#64748b';
    if (score >= 90) return '#15803d';
    if (score >= 70) return '#2563eb';
    if (score >= 40) return '#ca8a04';
    return '#b91c1c';
}

export default function DataExtractorQualifiedCompaniesPage() {
    const [params, setParams] = useSearchParams();
    const [jobs, setJobs] = useState([]);
    const [jobId, setJobId] = useState(params.get('jobId') || '');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [detail, setDetail] = useState(null);
    const [viewAll, setViewAll] = useState(false);
    const [filters, setFilters] = useState({
        categories: 'Highly Relevant,Relevant',
        minScore: '',
        maxScore: '',
        companyType: '',
        city: '',
        hasEmail: '',
        hasPhone: '',
        hasWebsite: '',
        source: '',
        duplicateStatus: '',
    });
    const [overrideCat, setOverrideCat] = useState('Highly Relevant');

    useEffect(() => {
        dataExtractorApi.listDiscoveryJobs({ limit: 30 }).then((d) => {
            const list = d?.results || [];
            setJobs(list);
            if (!jobId && list[0]?._id) setJobId(String(list[0]._id));
        }).catch(() => {});
    }, []);

    const load = useCallback(async () => {
        if (!jobId) return;
        setLoading(true);
        try {
            const q = { ...filters, page: 1, limit: 50 };
            if (viewAll) q.view = 'all';
            const res = await dataExtractorApi.getQualifiedCompanies(jobId, q);
            setData(res);
            setParams({ jobId });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load qualified companies');
        } finally {
            setLoading(false);
        }
    }, [jobId, filters, viewAll, setParams]);

    useEffect(() => { load(); }, [load]);

    const qualify = async (mode, indices) => {
        if (!jobId) return;
        setBusy(mode);
        try {
            const res = await dataExtractorApi.qualifyDiscoveryJob(jobId, { mode, indices, force: false });
            toast.success(res?.aiAvailable ? `Qualified ${res.processed || 0}` : (res?.processed ? 'Heuristic qualification complete' : 'Qualification pending — AI unavailable'));
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Qualify failed');
        } finally {
            setBusy('');
        }
    };

    const onOverride = async (index, category) => {
        setBusy('override');
        try {
            await dataExtractorApi.overrideDiscoveryQualification(jobId, { index, category });
            toast.success('Manual override saved');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Override failed');
        } finally {
            setBusy('');
        }
    };

    const onFeedback = async (index, verdict) => {
        setBusy('feedback');
        try {
            const payload = { index, verdict };
            if (verdict === 'wrong') payload.correctedCategory = overrideCat;
            await dataExtractorApi.feedbackDiscoveryQualification(jobId, payload);
            toast.success('Feedback saved');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Feedback failed');
        } finally {
            setBusy('');
        }
    };

    const a = data?.analytics || {};
    const rows = data?.results || [];

    return (
        <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Qualified Companies</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 0 }}>
                Default view: Highly Relevant + Relevant. Candidates are not CRM leads until you convert them.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 280 }}>
                    <option value="">Select extraction run</option>
                    {jobs.map((j) => (
                        <option key={j._id} value={j._id}>{j.keyword} · {j.city || j.country || ''} · {j.status}</option>
                    ))}
                </select>
                <button type="button" style={btn('#2563eb')} disabled={!!busy || !jobId} onClick={() => qualify('all_unprocessed')}>Qualify All Unprocessed</button>
                <button type="button" style={btn('#1d4ed8')} disabled={!!busy || !selected.size} onClick={() => qualify('selected', [...selected])}>Qualify Selected</button>
                <Link to={jobId ? PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(jobId) : PATHS.DATA_EXTRACTOR.DISCOVERY_JOBS} style={{ fontSize: 13 }}>Open results</Link>
            </div>

            {a.keyword ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {[
                        ['Raw', a.rawCandidates],
                        ['Unique', a.uniqueCompanies],
                        ['AI processed', a.aiProcessed],
                        ['Highly Relevant', a.highlyRelevant],
                        ['Relevant', a.relevant],
                        ['Possible', a.possible],
                        ['Not Relevant', a.notRelevant],
                        ['Insufficient', a.insufficientInformation],
                        ['Email', a.companiesWithEmail],
                        ['Phone', a.companiesWithPhone],
                        ['Duplicates', a.potentialDuplicates],
                        ['Converted', a.convertedToCrmLeads],
                    ].map(([label, val]) => (
                        <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', minWidth: 90 }}>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                            <div style={{ fontWeight: 700 }}>{val ?? 0}</div>
                        </div>
                    ))}
                </div>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {CATEGORIES.map((c) => {
                    const active = !viewAll && String(filters.categories).includes(c);
                    return (
                        <button
                            key={c}
                            type="button"
                            onClick={() => {
                                setViewAll(false);
                                setFilters((f) => {
                                    const set = new Set(String(f.categories || '').split(',').filter(Boolean));
                                    if (set.has(c)) set.delete(c); else set.add(c);
                                    return { ...f, categories: [...set].join(',') };
                                });
                            }}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 999,
                                border: active ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                background: active ? '#eff6ff' : '#fff',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {c}
                        </button>
                    );
                })}
                <button type="button" onClick={() => setViewAll(true)} style={{ padding: '4px 10px', borderRadius: 999, border: viewAll ? '2px solid #2563eb' : '1px solid #e2e8f0', background: viewAll ? '#eff6ff' : '#fff', fontSize: 12, fontWeight: 600 }}>All records</button>
                <input placeholder="City" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                <select value={filters.hasEmail} onChange={(e) => setFilters({ ...filters, hasEmail: e.target.value })} style={{ fontSize: 12, padding: 4 }}>
                    <option value="">Email: any</option>
                    <option value="true">Has email</option>
                    <option value="false">No email</option>
                </select>
                <select value={filters.hasPhone} onChange={(e) => setFilters({ ...filters, hasPhone: e.target.value })} style={{ fontSize: 12, padding: 4 }}>
                    <option value="">Phone: any</option>
                    <option value="true">Has phone</option>
                    <option value="false">No phone</option>
                </select>
                <select value={filters.hasWebsite} onChange={(e) => setFilters({ ...filters, hasWebsite: e.target.value })} style={{ fontSize: 12, padding: 4 }}>
                    <option value="">Website: any</option>
                    <option value="true">Has website</option>
                    <option value="false">No website</option>
                </select>
                <input placeholder="Source" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, width: 110 }} />
                <input placeholder="Min score" value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: e.target.value })} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, width: 80 }} />
            </div>

            {loading ? <p>Loading…</p> : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: 8 }} />
                                <th style={{ padding: 8 }}>Company</th>
                                <th style={{ padding: 8 }}>AI Score</th>
                                <th style={{ padding: 8 }}>Qualification</th>
                                <th style={{ padding: 8 }}>Company Type</th>
                                <th style={{ padding: 8 }}>Industry Tags</th>
                                <th style={{ padding: 8 }}>City</th>
                                <th style={{ padding: 8 }}>Phone</th>
                                <th style={{ padding: 8 }}>Email</th>
                                <th style={{ padding: 8 }}>Website</th>
                                <th style={{ padding: 8 }}>Sources</th>
                                <th style={{ padding: 8 }}>Last Found</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!rows.length && <tr><td colSpan={12} style={{ padding: 16, color: '#64748b' }}>No qualified companies in this view. Run Qualify All Unprocessed or switch to All records.</td></tr>}
                            {rows.map((r) => (
                                <tr key={r.previewIndex} style={{ borderTop: '1px solid #e2e8f0', background: detail?.previewIndex === r.previewIndex ? '#f0f9ff' : undefined }}>
                                    <td style={{ padding: 8 }}>
                                        <input type="checkbox" checked={selected.has(r.previewIndex)} onChange={() => {
                                            setSelected((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(r.previewIndex)) next.delete(r.previewIndex); else next.add(r.previewIndex);
                                                return next;
                                            });
                                        }} />
                                    </td>
                                    <td style={{ padding: 8 }}>
                                        <button type="button" onClick={() => setDetail(r)} style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600 }}>{r.companyName || '—'}</button>
                                    </td>
                                    <td style={{ padding: 8, fontWeight: 700, color: scoreColor(r.score) }}>{r.score != null ? `${r.score}%` : '—'}</td>
                                    <td style={{ padding: 8 }}>{r.qualification}{r.qualificationStatus === 'Pending' ? ' (Pending)' : ''}{r.manualOverride ? ' · override' : ''}</td>
                                    <td style={{ padding: 8 }}>{(r.companyTypes || []).join(' + ') || '—'}</td>
                                    <td style={{ padding: 8 }}>{(r.industryTags || []).join(', ') || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.city || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.phone || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.email || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.website ? <a href={r.website} target="_blank" rel="noreferrer">{r.website}</a> : '—'}</td>
                                    <td style={{ padding: 8 }}>{r.sourcesFound ?? '—'}</td>
                                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{r.lastFound ? new Date(r.lastFound).toLocaleDateString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {detail && (
                <div style={{ marginTop: 16, border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 8, padding: 16, fontSize: 13 }}>
                    <h3 style={{ marginTop: 0 }}>{detail.score != null ? `${detail.score}%` : '—'} – {detail.qualification}</h3>
                    <p style={{ marginTop: 0, color: '#334155' }}><strong>Evidence</strong></p>
                    <ul>
                        {(detail.evidence || []).map((e, i) => <li key={i}>{e}</li>)}
                        {!(detail.evidence || []).length && <li>Qualification pending or insufficient evidence.</li>}
                    </ul>
                    <p>Type: {(detail.companyTypes || []).join(' + ') || 'Not Available'}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <button type="button" style={btn('#0f766e')} disabled={!!busy} onClick={() => qualify('one', [detail.previewIndex])}>Qualify This Company</button>
                        <select value={overrideCat} onChange={(e) => setOverrideCat(e.target.value)}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button type="button" style={btn('#fff', '#334155')} disabled={!!busy} onClick={() => onOverride(detail.previewIndex, overrideCat)}>Override qualification</button>
                        <button type="button" style={btn('#fff', '#15803d')} disabled={!!busy} onClick={() => onFeedback(detail.previewIndex, 'correct')}>Correct</button>
                        <button type="button" style={btn('#fff', '#b91c1c')} disabled={!!busy} onClick={() => onFeedback(detail.previewIndex, 'wrong')}>Wrong</button>
                        <button type="button" style={btn('#fff', '#334155')} onClick={() => setDetail(null)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
