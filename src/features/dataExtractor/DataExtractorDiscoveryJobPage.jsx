import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const btn = (bg, color = '#fff') => ({
    padding: '8px 14px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
});

function mapDuplicateDisplayLabel(record) {
    if (!record) return 'NEW';
    if (record.duplicateDisplayLabel) return record.duplicateDisplayLabel;
    if (record._duplicateLabel) return record._duplicateLabel;
    const refs = Array.isArray(record.duplicateMatchRefs) ? record.duplicateMatchRefs : [];
    const types = new Set(refs.map((r) => String(r?.type || '').toLowerCase()));
    if (types.has('lead')) return 'EXISTING LEAD';
    if (types.has('customer')) return 'EXISTING CUSTOMER';
    if (types.has('supplier')) return 'EXISTING SUPPLIER';
    const status = String(record.duplicateStatus || record.duplicateDisplay || '').toLowerCase();
    if (status === 'confirmed_duplicate' || status === 'confirmed' || record._isDuplicate) return 'CONFIRMED DUPLICATE';
    if (status === 'possible_duplicate' || status === 'possible') return 'POSSIBLE DUPLICATE';
    if (status === 'merged_draft' || status === 'merged') return 'MERGED DRAFT';
    if (status === 'already_converted' || status === 'converted' || record.convertedRecordId) return 'ALREADY CONVERTED';
    return 'NEW';
}

function DuplicateLabel({ record }) {
    const label = mapDuplicateDisplayLabel(record);
    const color = label === 'NEW' ? '#15803d' : label.includes('POSSIBLE') ? '#ca8a04' : '#b91c1c';
    return <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>;
}

function Stat({ label, value }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{value ?? '—'}</div>
        </div>
    );
}

export default function DataExtractorDiscoveryJobPage() {
    const { id: jobId } = useParams();
    const { selectedFY } = useFinancialYear();
    const [job, setJob] = useState(null);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [detailIdx, setDetailIdx] = useState(null);
    const [showResults, setShowResults] = useState(false);
    const pollRef = useRef(null);

    const previewRecords = useMemo(() => {
        if (results.length) return results;
        return job?.metadata?.previewRecords || job?.previewRecords || [];
    }, [job, results]);

    const loadJob = useCallback(async () => {
        const data = await dataExtractorApi.getDiscoveryJob(jobId);
        const j = data?.job || data;
        setJob(j);
        const previews = j?.metadata?.previewRecords || j?.previewRecords || [];
        if (previews.length) setResults(previews);
        return j;
    }, [jobId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await loadJob();
            } catch (e) {
                if (!cancelled) toast.error(e?.response?.data?.message || 'Failed to load job');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [loadJob]);

    useEffect(() => {
        const status = String(job?.status || '').toUpperCase();
        if (status === 'RUNNING' || status === 'QUEUED') {
            pollRef.current = setInterval(() => { loadJob().catch(() => {}); }, 3000);
            return () => clearInterval(pollRef.current);
        }
        if (pollRef.current) clearInterval(pollRef.current);
        return undefined;
    }, [job?.status, loadJob]);

    const runAction = async (key, fn, okMsg) => {
        setBusy(key);
        try {
            await fn();
            await loadJob();
            if (okMsg) toast.success(okMsg);
        } catch (e) {
            toast.error(e?.response?.data?.message || `${key} failed`);
        } finally {
            setBusy('');
        }
    };

    const onViewResults = async () => {
        setShowResults(true);
        setBusy('results');
        try {
            const data = await dataExtractorApi.getDiscoveryResults(jobId);
            const list = data?.results || data?.previewRecords || [];
            setResults(Array.isArray(list) ? list : []);
            if (list?.length) setSelected(new Set(list.map((_, i) => i)));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load results');
        } finally {
            setBusy('');
        }
    };

    const onSaveDrafts = async () => {
        const indices = Array.from(selected);
        if (!indices.length) {
            toast.error('Select at least one company');
            return;
        }
        setBusy('save');
        try {
            const result = await dataExtractorApi.saveDiscoveryDrafts(jobId, {
                selectedIndices: indices,
                indices,
                financialYear: selectedFY,
            });
            toast.success(`Saved ${result?.saved || indices.length} draft(s)`);
            await loadJob();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save drafts failed');
        } finally {
            setBusy('');
        }
    };

    const onConvertLead = async (index) => {
        const rec = previewRecords[index];
        if (!rec) return;
        if (mapDuplicateDisplayLabel(rec) === 'ALREADY CONVERTED') {
            toast.error('Already converted');
            return;
        }
        if (!window.confirm(`Convert "${rec.companyName || 'this company'}" to a Lead?\n\nNo Customer, Supplier, WhatsApp or email will be created.`)) {
            return;
        }
        setBusy('convert');
        try {
            const result = await dataExtractorApi.convertDiscoveryPreviewToLead(jobId, {
                index,
                financialYear: selectedFY,
            });
            toast.success('Converted to Lead');
            await loadJob();
            setShowResults(true);
            return result;
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Conversion failed');
        } finally {
            setBusy('');
        }
    };

    if (loading) return <div>Loading discovery job…</div>;
    if (!job) {
        return (
            <div>
                <p>Job not found.</p>
                <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOBS}>← Discovery Jobs</Link>
            </div>
        );
    }

    const status = String(job.status || '').toUpperCase();
    const sourceProgress = job.sourceProgress || {};
    const sourceRows = Array.isArray(sourceProgress)
        ? sourceProgress
        : Object.entries(sourceProgress).map(([providerId, s]) => ({ providerId, ...(s || {}) }));
    const detail = detailIdx != null ? previewRecords[detailIdx] : null;

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOBS} style={{ fontSize: 13 }}>← Discovery Jobs</Link>
            </div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Discovery Job</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                Keyword: <strong>{job.keyword || '—'}</strong>
                {' · '}
                {[job.city, job.state, job.country].filter(Boolean).join(', ') || '—'}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <Stat label="Target Companies" value={job.targetCompanies} />
                <Stat label="Discovered Companies" value={job.totalUniqueResults ?? 0} />
                <Stat label="Available Public Results (raw)" value={job.totalRawResults ?? 0} />
                <Stat label="Duplicates" value={job.totalDuplicates ?? 0} />
                <Stat label="Converted" value={job.totalConverted ?? 0} />
                <Stat label="API Requests" value={job.totalApiRequests ?? 0} />
                <Stat label="Status" value={status || '—'} />
            </div>

            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0, marginBottom: 16 }}>
                Target Companies is a maximum. Available public results may be lower; nothing is fabricated.
            </p>

            {sourceRows.length > 0 && (
                <div style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: 10, background: '#f8fafc', fontWeight: 600, fontSize: 13 }}>Per-source progress</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ textAlign: 'left' }}>
                                <th style={{ padding: 8 }}>Source</th>
                                <th style={{ padding: 8 }}>Status</th>
                                <th style={{ padding: 8 }}>Pages</th>
                                <th style={{ padding: 8 }}>Raw</th>
                                <th style={{ padding: 8 }}>Unique</th>
                                <th style={{ padding: 8 }}>API</th>
                                <th style={{ padding: 8 }}>Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sourceRows.map((s) => (
                                <tr key={s.providerId} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8 }}>{s.providerId}</td>
                                    <td style={{ padding: 8 }}>{s.status || '—'}</td>
                                    <td style={{ padding: 8 }}>{s.pagesProcessed ?? '—'}</td>
                                    <td style={{ padding: 8 }}>{s.rawResults ?? '—'}</td>
                                    <td style={{ padding: 8 }}>{s.uniqueResults ?? '—'}</td>
                                    <td style={{ padding: 8 }}>{s.apiRequests ?? '—'}</td>
                                    <td style={{ padding: 8, color: '#64748b', maxWidth: 280 }}>{s.lastError || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {(status === 'RUNNING' || status === 'QUEUED') && (
                    <button type="button" disabled={!!busy} style={btn('#c2410c')} onClick={() => runAction('pause', () => dataExtractorApi.pauseDiscoveryJob(jobId), 'Paused')}>Pause</button>
                )}
                {status === 'PAUSED' && (
                    <button type="button" disabled={!!busy} style={btn('#2563eb')} onClick={() => runAction('resume', () => dataExtractorApi.resumeDiscoveryJob(jobId), 'Resumed')}>Resume</button>
                )}
                {['RUNNING', 'QUEUED', 'PAUSED', 'DRAFT'].includes(status) && (
                    <button type="button" disabled={!!busy} style={btn('#b91c1c')} onClick={() => runAction('stop', () => dataExtractorApi.stopDiscoveryJob(jobId), 'Stopped')}>Stop</button>
                )}
                {['FAILED', 'STOPPED'].includes(status) && (
                    <button type="button" disabled={!!busy} style={btn('#2563eb')} onClick={() => runAction('retry', () => dataExtractorApi.retryDiscoveryJob(jobId), 'Retry started')}>Retry</button>
                )}
                {['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'PAUSED', 'STOPPED'].includes(status) && (
                    <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={() => runAction('continue', () => dataExtractorApi.continueDiscoveryJob(jobId), 'Continuing discovery')}>Continue</button>
                )}
                {status === 'DRAFT' && (
                    <button type="button" disabled={!!busy} style={btn('#2563eb')} onClick={() => runAction('start', () => dataExtractorApi.startDiscoveryJob(jobId), 'Started')}>Start</button>
                )}
                <button type="button" disabled={!!busy} style={btn('#334155')} onClick={() => runAction('syncDup', () => dataExtractorApi.syncDiscoveryMergeReviews(jobId), 'Duplicate reviews synced')}>Sync duplicate reviews</button>
                <button type="button" disabled={!!busy} style={btn('#fff', '#334155')} onClick={onViewResults}>View Results</button>
                {showResults && previewRecords.length > 0 && (
                    <button type="button" disabled={!!busy} style={btn('#15803d')} onClick={onSaveDrafts}>Save selected drafts</button>
                )}
            </div>

            {showResults && (
                <div>
                    <h3 style={{ fontSize: 15, marginBottom: 8 }}>Results preview</h3>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                        Review Available Public Results. Convert to Lead only creates a Lead — no Customer/Supplier/WhatsApp/email.
                    </p>
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }} />
                                    <th style={{ padding: 8 }}>Company</th>
                                    <th style={{ padding: 8 }}>Website</th>
                                    <th style={{ padding: 8 }}>City</th>
                                    <th style={{ padding: 8 }}>Source</th>
                                    <th style={{ padding: 8 }}>Social</th>
                                    <th style={{ padding: 8 }}>Duplicate</th>
                                    <th style={{ padding: 8 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewRecords.length === 0 && (
                                    <tr><td colSpan={8} style={{ padding: 16, color: '#64748b' }}>No preview records yet</td></tr>
                                )}
                                {previewRecords.map((r, i) => (
                                    <tr key={r._id || r.website || i} style={{ borderTop: '1px solid #e2e8f0', background: detailIdx === i ? '#f0f9ff' : undefined }}>
                                        <td style={{ padding: 8 }}>
                                            <input type="checkbox" checked={selected.has(i)} onChange={() => {
                                                setSelected((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(i)) next.delete(i); else next.add(i);
                                                    return next;
                                                });
                                            }} />
                                        </td>
                                        <td style={{ padding: 8 }}>{r.companyName || '—'}</td>
                                        <td style={{ padding: 8 }}>
                                            {r.website ? <a href={r.website} target="_blank" rel="noreferrer">{r.normalizedDomain || r.website}</a> : '—'}
                                        </td>
                                        <td style={{ padding: 8 }}>{r.city || r.stateProvince || '—'}</td>
                                        <td style={{ padding: 8 }}>{r.rawExtractedData?.sourceProvider || r.sourcePlatform || '—'}</td>
                                        <td style={{ padding: 8, fontSize: 11 }}>
                                            {[r.socialLinks?.facebook, r.socialLinks?.instagram].filter(Boolean).length || '—'}
                                        </td>
                                        <td style={{ padding: 8 }}><DuplicateLabel record={r} /></td>
                                        <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                                            <button type="button" style={btn('#fff', '#334155')} onClick={() => setDetailIdx(i)}>View</button>
                                            {' '}
                                            <button
                                                type="button"
                                                disabled={!!busy || mapDuplicateDisplayLabel(r) === 'ALREADY CONVERTED'}
                                                style={btn('#1d4ed8')}
                                                onClick={() => onConvertLead(i)}
                                            >
                                                Convert to Lead
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {detail && (
                        <div style={{ marginTop: 16, border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 8, padding: 16, fontSize: 13 }}>
                            <h4 style={{ marginTop: 0 }}>Draft detail</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
                                <div>Company</div><div><strong>{detail.companyName || '—'}</strong></div>
                                <div>Website</div><div>{detail.website || '—'}</div>
                                <div>Email</div><div>{detail.email || '—'}</div>
                                <div>Phone</div><div>{detail.phone || detail.mobile || '—'}</div>
                                <div>Address</div><div>{detail.address || '—'}</div>
                                <div>Location</div><div>{[detail.city, detail.stateProvince || detail.state, detail.country].filter(Boolean).join(', ') || '—'}</div>
                                <div>Description</div><div>{detail.businessDescription || '—'}</div>
                                <div>Source providers</div><div>{(detail.rawExtractedData?.sourceProviders || [detail.rawExtractedData?.sourceProvider]).filter(Boolean).join(', ') || '—'}</div>
                                <div>Source URL</div><div>{detail.sourceUrl || '—'}</div>
                                <div>Facebook</div><div>{detail.socialLinks?.facebook || '—'}</div>
                                <div>Instagram</div><div>{detail.socialLinks?.instagram || '—'}</div>
                                <div>Duplicate</div><div><DuplicateLabel record={detail} /></div>
                                <div>Data quality</div><div>{detail.dataQualityScore != null ? `${detail.dataQualityScore}/100` : (detail.dataQuality?.score != null ? `${detail.dataQuality.score}/100` : '—')}{(detail.dataQualityFlags || detail.dataQuality?.flags || []).length ? ` · ${(detail.dataQualityFlags || detail.dataQuality?.flags || []).slice(0, 3).join(', ')}` : ''}</div>
                                <div>Converted Lead</div><div>{detail.convertedRecordId || '—'}</div>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <button type="button" disabled={!!busy || mapDuplicateDisplayLabel(detail) === 'ALREADY CONVERTED'} style={btn('#1d4ed8')} onClick={() => onConvertLead(detailIdx)}>
                                    Convert to Lead
                                </button>
                                {' '}
                                <button type="button" style={btn('#fff', '#334155')} onClick={() => setDetailIdx(null)}>Close</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
