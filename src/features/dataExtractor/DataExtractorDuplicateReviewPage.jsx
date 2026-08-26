import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };

function SideBySide({ a = {}, b = {} }) {
    const rows = ['companyName', 'website', 'email', 'phone', 'city', 'state', 'gstin', 'sourceUrl'];
    return (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
                <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: 4 }}>Field</th>
                    <th style={{ padding: 4 }}>Record A</th>
                    <th style={{ padding: 4 }}>Record B / Candidate</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((f) => (
                    <tr key={f} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: 4, fontWeight: 600 }}>{f}</td>
                        <td style={{ padding: 4 }}>{a[f] || '—'}</td>
                        <td style={{ padding: 4 }}>{b[f] || '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function DataExtractorDuplicateReviewPage() {
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState('open');
    const [busy, setBusy] = useState('');
    const [selected, setSelected] = useState(null);

    const load = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listDiscoveryMergeReviews({ status, limit: 50 });
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load reviews');
        }
    }, [status]);

    useEffect(() => { load(); }, [load]);

    const resolve = async (id, action, extra = {}) => {
        setBusy(action + id);
        try {
            await dataExtractorApi.resolveDiscoveryMergeReview(id, { action, ...extra });
            toast.success('Resolved: ' + action);
            setSelected(null);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Resolve failed');
        } finally {
            setBusy('');
        }
    };

    return (
        <div style={{ maxWidth: 980 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Duplicate Review</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Possible duplicates from smart company merge. Auto-merge only happens at 95%+ deterministic confidence.
                Manual Merge / Keep Separate / Ignore always override the suggestion.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {['open', 'resolved', 'ignored'].map((s) => (
                    <button key={s} type="button" style={{ ...btn, borderColor: status === s ? '#2563eb' : '#cbd5e1' }} onClick={() => setStatus(s)}>{s}</button>
                ))}
                <button type="button" style={btn} onClick={load}>Refresh</button>
            </div>

            {(items || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No {status} merge reviews.</p> : null}

            {(items || []).map((r) => (
                <div key={r._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                            <strong>{r.recordA?.companyName || 'Record A'}</strong>
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                                Merge Confidence: <strong>{r.matchScore ?? r.candidateRef?.mergeConfidence ?? 0}%</strong>
                                {r.discoveryJobId ? <> · <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(r.discoveryJobId)}>Job</Link></> : null}
                            </span>
                        </div>
                        <button type="button" style={btn} onClick={() => setSelected(selected?._id === r._id ? null : r)}>
                            {selected?._id === r._id ? 'Hide' : 'Compare'}
                        </button>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                        Reasons: {(r.reasons || []).slice(0, 5).map((x) => x.detail || x.field).join(' · ') || '—'}
                    </div>
                    {selected?._id === r._id ? (
                        <div style={{ marginTop: 8 }}>
                            <SideBySide a={r.recordA} b={r.recordB} />
                            {r.status === 'open' ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                    <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => resolve(r._id, 'merge')}>Merge</button>
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => resolve(r._id, 'keep_separate')}>Keep Separate</button>
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => resolve(r._id, 'ignore')}>Ignore</button>
                                </div>
                            ) : (
                                <p style={{ fontSize: 12, color: '#64748b' }}>Action: {r.resolutionAction} · {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : ''}</p>
                            )}
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    );
}
