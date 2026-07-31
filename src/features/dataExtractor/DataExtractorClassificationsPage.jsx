import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { getClassificationActionVisibility } from './classificationPermissions';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 };

export default function DataExtractorClassificationsPage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => getClassificationActionVisibility(hasPermission), [hasPermission]);

    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [evidence, setEvidence] = useState(null);
    const [history, setHistory] = useState(null);
    const [busy, setBusy] = useState('');
    const [filters, setFilters] = useState({ status: '', engineUsed: '', minConfidence: '', maxConfidence: '', parentIndustry: '' });
    const [sample, setSample] = useState({
        companyName: '',
        businessDescription: '',
        keywords: '',
        website: '',
        mode: 'rule_based',
    });

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            if (filters.status) params.status = filters.status;
            if (filters.engineUsed) params.engineUsed = filters.engineUsed;
            if (filters.parentIndustry) params.parentIndustry = filters.parentIndustry;
            if (filters.minConfidence !== '') params.minConfidence = Number(filters.minConfidence);
            if (filters.maxConfidence !== '') params.maxConfidence = Number(filters.maxConfidence);
            const data = await dataExtractorApi.listIndustryClassifications(params);
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load classifications');
        }
    }, [filters, vis.canView]);

    useEffect(() => { load(); }, [load]);

    const openDetail = async (row) => {
        if (selectedId === row._id) {
            setSelectedId(null);
            setEvidence(null);
            setHistory(null);
            return;
        }
        setSelectedId(row._id);
        setEvidence(null);
        setHistory(null);
        if (vis.canViewEvidence) {
            try {
                setEvidence(await dataExtractorApi.getIndustryClassificationEvidence(row._id));
            } catch (e) {
                toast.error(e?.response?.data?.message || 'Failed to load evidence');
            }
        }
        if (vis.canViewHistory) {
            try {
                setHistory(await dataExtractorApi.getIndustryClassificationHistory(row._id));
            } catch (e) {
                toast.error(e?.response?.data?.message || 'Failed to load history');
            }
        }
    };

    const runAction = async (label, fn) => {
        setBusy(label);
        try {
            await fn();
            toast.success(label);
            await load();
            if (selectedId && vis.canViewEvidence) {
                setEvidence(await dataExtractorApi.getIndustryClassificationEvidence(selectedId));
            }
            if (selectedId && vis.canViewHistory) {
                setHistory(await dataExtractorApi.getIndustryClassificationHistory(selectedId));
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || label + ' failed');
        } finally {
            setBusy('');
        }
    };

    const classifySample = async () => {
        if (!vis.canClassify) return;
        await runAction('Classified sample', async () => {
            const out = await dataExtractorApi.classifyIndustryRecord({
                mode: sample.mode,
                record: {
                    companyName: sample.companyName,
                    website: sample.website,
                    businessDescription: sample.businessDescription,
                    keywords: String(sample.keywords || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                },
            });
            const row = out.classification || out;
            if (row?._id) setSelectedId(row._id);
        });
    };

    if (!vis.canView) {
        return <p style={{ color: '#64748b' }}>You do not have permission to view industry classifications.</p>;
    }

    const selected = items.find((x) => x._id === selectedId) || null;

    return (
        <div style={{ maxWidth: 1100 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Industry Classification Queue</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Explainable industry classification for Discovery drafts and extracted records. Locked classifications are never overwritten automatically.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <select style={field} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    <option value="">All statuses</option>
                    {['CLASSIFIED', 'LOW_CONFIDENCE', 'MULTIPLE_POSSIBILITIES', 'IRRELEVANT', 'MANUAL_REVIEW_REQUIRED', 'FAILED'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                <input style={field} placeholder="Engine used" value={filters.engineUsed} onChange={(e) => setFilters((f) => ({ ...f, engineUsed: e.target.value }))} />
                <input style={field} placeholder="Parent industry" value={filters.parentIndustry} onChange={(e) => setFilters((f) => ({ ...f, parentIndustry: e.target.value }))} />
                <input style={field} type="number" placeholder="Min confidence" value={filters.minConfidence} onChange={(e) => setFilters((f) => ({ ...f, minConfidence: e.target.value }))} />
                <input style={field} type="number" placeholder="Max confidence" value={filters.maxConfidence} onChange={(e) => setFilters((f) => ({ ...f, maxConfidence: e.target.value }))} />
                <button type="button" style={btn} onClick={load}>Refresh</button>
            </div>

            {vis.canClassify ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16, background: '#f8fafc' }}>
                    <h3 style={{ marginTop: 0, fontSize: 14 }}>Classify sample / ad-hoc record</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input style={field} placeholder="Company name" value={sample.companyName} onChange={(e) => setSample((s) => ({ ...s, companyName: e.target.value }))} />
                        <input style={field} placeholder="Website" value={sample.website} onChange={(e) => setSample((s) => ({ ...s, website: e.target.value }))} />
                        <input style={field} placeholder="Keywords" value={sample.keywords} onChange={(e) => setSample((s) => ({ ...s, keywords: e.target.value }))} />
                        <select style={field} value={sample.mode} onChange={(e) => setSample((s) => ({ ...s, mode: e.target.value }))}>
                            <option value="rule_based">rule_based</option>
                            <option value="ai">ai</option>
                            <option value="hybrid">hybrid</option>
                            <option value="manual_review">manual_review</option>
                        </select>
                        <textarea style={{ ...field, gridColumn: '1 / -1', minHeight: 70 }} placeholder="Business description" value={sample.businessDescription} onChange={(e) => setSample((s) => ({ ...s, businessDescription: e.target.value }))} />
                    </div>
                    <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy} onClick={classifySample}>Classify</button>
                </div>
            ) : null}

            {(items || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No classifications yet.</p> : null}
            {(items || []).map((row) => (
                <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                            <strong>{row.companyName || 'Record'}</strong>
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                                {row.status} · {row.primaryIndustry || '—'} · conf {row.confidenceScore} · {row.engineUsed}
                                {row.locked ? ' · LOCKED' : ''}
                                {row.manuallyApproved ? ' · APPROVED' : ''}
                                {row.fallbackUsed ? ' · fallback' : ''}
                            </span>
                        </div>
                        <button type="button" style={btn} onClick={() => openDetail(row)}>
                            {selectedId === row._id ? 'Hide' : 'Open detail'}
                        </button>
                    </div>
                    {selectedId === row._id ? (
                        <div style={{ marginTop: 10, fontSize: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <h4 style={{ margin: '0 0 6px' }}>Evidence</h4>
                                    {vis.canViewEvidence ? (
                                        <>
                                            <ul>{(evidence?.evidenceSnippets || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                                            <h4 style={{ margin: '8px 0 6px' }}>Source URLs</h4>
                                            <ul>{(evidence?.evidenceSourceUrls || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                                            <div><strong>Positive:</strong> {(evidence?.positiveKeywordsFound || []).join(', ') || '—'}</div>
                                            <div><strong>Negative:</strong> {(evidence?.negativeKeywordsFound || []).join(', ') || '—'}</div>
                                        </>
                                    ) : (
                                        <p style={{ color: '#94a3b8' }}>Evidence requires view_evidence permission.</p>
                                    )}
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 6px' }}>Rules matched</h4>
                                    {vis.canViewEvidence ? (
                                        <ul>{(evidence?.rulesMatched || []).slice(0, 12).map((x, i) => <li key={i}>{x.rule}: {x.detail}</li>)}</ul>
                                    ) : (
                                        <p style={{ color: '#94a3b8' }}>—</p>
                                    )}
                                    <div><strong>Review reason:</strong> {selected?.manualReviewReason || '—'}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                {vis.canOverride ? (
                                    <>
                                        <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Accepted', () => dataExtractorApi.overrideIndustryClassification(row._id, { action: 'accept' }))}>Accept</button>
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => {
                                            const parentIndustry = window.prompt('Parent industry', row.parentIndustry || '');
                                            const subIndustry = window.prompt('Sub industry', row.subIndustry || '');
                                            const reason = window.prompt('Override reason', 'Manual override') || 'Manual override';
                                            if (!parentIndustry && !subIndustry) return;
                                            return runAction('Overridden', () => dataExtractorApi.overrideIndustryClassification(row._id, { action: 'override', parentIndustry, subIndustry, reason }));
                                        }}>Override</button>
                                    </>
                                ) : null}
                                {vis.canMarkIrrelevant ? (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Marked irrelevant', () => dataExtractorApi.markIndustryClassificationIrrelevant(row._id, { reason: 'Marked irrelevant' }))}>Mark irrelevant</button>
                                ) : null}
                                {vis.canClassify ? (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Re-analyzed', () => dataExtractorApi.reanalyzeIndustryClassification(row._id, {}))}>Re-run analysis</button>
                                ) : null}
                                {vis.canLock ? (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(row.locked ? 'Unlocked' : 'Locked', () => dataExtractorApi.lockIndustryClassification(row._id, { action: row.locked ? 'unlock' : 'lock', reason: row.locked ? 'Unlock' : 'Lock' }))}>{row.locked ? 'Unlock' : 'Lock'}</button>
                                ) : null}
                            </div>
                            {vis.canViewHistory ? (
                                <details style={{ marginTop: 10 }}>
                                    <summary>History</summary>
                                    <pre style={{ whiteSpace: 'pre-wrap', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6 }}>{JSON.stringify(history?.history || [], null, 2)}</pre>
                                </details>
                            ) : (
                                <p style={{ marginTop: 10, color: '#94a3b8' }}>History requires view_history permission.</p>
                            )}
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    );
}
