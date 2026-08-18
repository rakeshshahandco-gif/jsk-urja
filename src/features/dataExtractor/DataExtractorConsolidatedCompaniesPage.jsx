import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';

const field = { padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 };
const btn = (bg = '#2563eb') => ({ padding: '8px 12px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 });

export default function DataExtractorConsolidatedCompaniesPage() {
    const [filters, setFilters] = useState({
        q: '', keyword: '', location: '', source: '', qualificationCategory: '', crmStatus: '',
        hasEmail: '', hasPhone: '', hasWebsite: '', converted: '', discoveryClass: '', page: 1,
    });
    const [data, setData] = useState({ results: [], total: 0, page: 1, limit: 20 });
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [detail, setDetail] = useState(null);
    const [preview, setPreview] = useState(null);
    const [assignTo, setAssignTo] = useState('');
    const [createFollowUp, setCreateFollowUp] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page: filters.page, limit: 20 };
            Object.entries(filters).forEach(([k, v]) => {
                if (k !== 'page' && v) params[k] = v;
            });
            const res = await dataExtractorApi.listOpsCompanies(params);
            setData(res);
            setSelected(new Set());
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load companies');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, page: 1 }));

    const onExport = async () => {
        try {
            const res = await dataExtractorApi.exportOpsCompanies({ keyword: filters.keyword, source: filters.source, crmStatus: filters.crmStatus });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'consolidated-companies.xlsx';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Export failed');
        }
    };

    const onBulkPreview = async () => {
        if (!selected.size) return;
        try {
            const res = await dataExtractorApi.previewOpsBulkConvert([...selected]);
            setPreview(res);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Preview failed');
        }
    };

    const onBulkConfirm = async () => {
        if (!preview) return;
        if (!window.confirm(`Create ${preview.ready} leads? Duplicates and incomplete rows will be skipped.`)) return;
        try {
            const res = await dataExtractorApi.confirmOpsBulkConvert({
                ids: [...selected],
                confirm: true,
                assignedTo: assignTo || undefined,
                createFollowUp,
            });
            toast.success(`Created ${res.created?.length || 0}. Skipped ${res.skipped?.length || 0}. Failed ${res.failed?.length || 0}.`);
            setPreview(null);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Bulk convert failed');
        }
    };

    const pages = Math.max(1, Math.ceil((data.total || 0) / (data.limit || 20)));

    return (
        <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Consolidated Companies</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 0 }}>
                Cross-source company identity. Convert to CRM Lead stays manual. Completeness is not AI relevance.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                <input placeholder="Company" value={filters.q} onChange={setF('q')} style={field} />
                <input placeholder="Keyword" value={filters.keyword} onChange={setF('keyword')} style={field} />
                <input placeholder="Location" value={filters.location} onChange={setF('location')} style={field} />
                <select value={filters.source} onChange={setF('source')} style={field}>
                    <option value="">Source</option>
                    {['web', 'facebook', 'instagram', 'linkedin', 'x', 'indiamart'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filters.qualificationCategory} onChange={setF('qualificationCategory')} style={field}>
                    <option value="">AI relevance</option>
                    {['Highly Relevant', 'Relevant', 'Possibly Relevant', 'Not Relevant', 'Insufficient Information'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filters.crmStatus} onChange={setF('crmStatus')} style={field}>
                    <option value="">CRM status</option>
                    {['New', 'Existing Lead', 'Existing Customer', 'Existing Supplier', 'Possible CRM Duplicate', 'Converted to Lead'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filters.hasEmail} onChange={setF('hasEmail')} style={field}>
                    <option value="">Email</option>
                    <option value="true">Has email</option>
                </select>
                <select value={filters.hasPhone} onChange={setF('hasPhone')} style={field}>
                    <option value="">Phone</option>
                    <option value="true">Has phone</option>
                </select>
                <select value={filters.hasWebsite} onChange={setF('hasWebsite')} style={field}>
                    <option value="">Website</option>
                    <option value="true">Has website</option>
                </select>
                <select value={filters.converted} onChange={setF('converted')} style={field}>
                    <option value="">Converted</option>
                    <option value="true">Converted</option>
                    <option value="false">Not converted</option>
                </select>
                <select value={filters.discoveryClass} onChange={setF('discoveryClass')} style={field}>
                    <option value="">New / known / updated</option>
                    <option value="new">New</option>
                    <option value="known">Known</option>
                    <option value="updated">Updated</option>
                </select>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <button type="button" style={btn()} onClick={onExport}>Export Excel</button>
                <button type="button" style={btn('#0f766e')} disabled={!selected.size} onClick={onBulkPreview}>Convert selected to leads</button>
                <span style={{ fontSize: 13, color: '#64748b' }}>{loading ? 'Loading…' : `${data.total} companies · page ${data.page} of ${pages}`}</span>
            </div>

            {preview ? (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Bulk convert preview</div>
                    <div style={{ fontSize: 13 }}>Selected: {preview.selected} · Ready: {preview.ready} · Potential CRM duplicates: {preview.potentialCrmDuplicates} · Missing minimum data: {preview.missingMinimum}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input placeholder="Assign to user id (optional)" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={field} />
                        <label style={{ fontSize: 13 }}><input type="checkbox" checked={createFollowUp} onChange={(e) => setCreateFollowUp(e.target.checked)} /> Create follow-up task</label>
                        <button type="button" style={btn('#15803d')} onClick={onBulkConfirm}>Confirm create leads</button>
                        <button type="button" style={btn('#64748b')} onClick={() => setPreview(null)}>Cancel</button>
                    </div>
                </div>
            ) : null}

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            <th style={{ padding: 8 }} />
                            {['Company', 'Type', 'AI', 'Email', 'Phone', 'Website', 'Sources', 'CRM', 'Complete'].map((h) => <th key={h} style={{ padding: 8 }}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {(data.results || []).map((r) => (
                            <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={selected.has(String(r._id))}
                                        onChange={(e) => {
                                            const next = new Set(selected);
                                            if (e.target.checked) next.add(String(r._id));
                                            else next.delete(String(r._id));
                                            setSelected(next);
                                        }}
                                    />
                                </td>
                                <td style={{ padding: 8 }}>
                                    <button type="button" onClick={async () => {
                                        try { setDetail(await dataExtractorApi.getOpsCompany(r._id)); } catch (e) { toast.error(e?.response?.data?.message || 'Load failed'); }
                                    }} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>
                                        {r.canonicalName}
                                    </button>
                                    <div style={{ color: '#64748b', fontSize: 11 }}>{[r.city, r.state].filter(Boolean).join(', ')}</div>
                                </td>
                                <td style={{ padding: 8 }}>{r.companyType || '—'}</td>
                                <td style={{ padding: 8 }}>{r.qualificationScore ?? '—'} {r.qualificationCategory ? `· ${r.qualificationCategory}` : ''}</td>
                                <td style={{ padding: 8 }}>{r.primaryEmail || '—'}</td>
                                <td style={{ padding: 8 }}>{r.primaryPhone || '—'}</td>
                                <td style={{ padding: 8, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.website || '—'}</td>
                                <td style={{ padding: 8 }}>{(r.platforms || []).join(', ')}</td>
                                <td style={{ padding: 8 }}>{r.crmStatus || 'New'}</td>
                                <td style={{ padding: 8 }}>{r.completeness ?? 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" style={btn('#334155')} disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</button>
                <button type="button" style={btn('#334155')} disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
            </div>

            {detail ? (
                <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <h3 style={{ margin: 0 }}>{detail.canonicalName}</h3>
                        <button type="button" style={btn('#64748b')} onClick={() => setDetail(null)}>Close</button>
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                        CRM: {detail.crmStatus} · Completeness {detail.completeness}% (not AI score) · AI {detail.qualificationScore ?? '—'} {detail.qualificationCategory || ''}
                    </p>
                    <div style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>Website: {detail.website || '—'}</div>
                        <div>Email: {detail.primaryEmail || '—'}</div>
                        <div>Phone: {detail.primaryPhone || '—'}</div>
                        <div>Address: {detail.address || '—'}</div>
                        <div>Facebook: {detail.social?.facebookUrl || '—'}</div>
                        <div>LinkedIn: {detail.social?.linkedinCompanyUrl || '—'}</div>
                        <div>Instagram: {detail.social?.instagramUrl || '—'}</div>
                        <div>X: {detail.social?.xUrl || '—'}</div>
                    </div>
                    <h4 style={{ fontSize: 13 }}>Source contribution</h4>
                    <ul style={{ fontSize: 13 }}>
                        {(detail.provenance || []).map((p, i) => <li key={i}>{typeof p === 'string' ? p : JSON.stringify(p)}</li>)}
                        {(detail.sourceRefs || []).slice(0, 12).map((s, i) => (
                            <li key={i}>{s.source}: {s.title || s.sourceUrl} {s.verificationStatus ? `(${s.verificationStatus})` : ''}</li>
                        ))}
                    </ul>
                    {(detail.changeLog || []).length ? (
                        <>
                            <h4 style={{ fontSize: 13 }}>Meaningful updates</h4>
                            <ul style={{ fontSize: 13 }}>
                                {detail.changeLog.slice(-10).map((c, i) => <li key={i}>{c.label || c.field}</li>)}
                            </ul>
                        </>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
