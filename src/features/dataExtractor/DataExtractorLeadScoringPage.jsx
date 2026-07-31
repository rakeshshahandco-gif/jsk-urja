import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

function badge(text, bg = '#e2e8f0') {
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, fontSize: 11, marginRight: 6 };
}

function priorityBg(p) {
    if (p === 'CRITICAL' || p === 'HIGH') return '#dcfce7';
    if (p === 'MEDIUM') return '#e0f2fe';
    if (p === 'LOW' || p === 'NO_PRIORITY') return '#f1f5f9';
    return '#fef3c7';
}

export default function DataExtractorLeadScoringPage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.lead_scoring.view'),
        canRun: can(hasPermission, 'data_extractor.lead_scoring.run'),
        canOverride: can(hasPermission, 'data_extractor.lead_scoring.override'),
        canApprove: can(hasPermission, 'data_extractor.lead_scoring.approve'),
        canReject: can(hasPermission, 'data_extractor.lead_scoring.reject'),
        canLock: can(hasPermission, 'data_extractor.lead_scoring.lock'),
        canHistory: can(hasPermission, 'data_extractor.lead_scoring.history'),
        canExport: can(hasPermission, 'data_extractor.lead_scoring.export'),
        canManage: can(hasPermission, 'data_extractor.lead_scoring.manage'),
    }), [hasPermission]);

    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [exportPreview, setExportPreview] = useState(null);
    const [busy, setBusy] = useState('');
    const [filters, setFilters] = useState({
        status: '', priority: '', grade: '', minScore: '', maxScore: '', locked: '', approved: '', outdated: '',
    });
    const [overrideScore, setOverrideScore] = useState('');
    const [sampleResult, setSampleResult] = useState(null);

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
            const data = await dataExtractorApi.listLeadScores(params);
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load scores');
        }
    }, [filters, vis.canView]);

    useEffect(() => { load(); }, [load]);

    const runAction = async (label, fn) => {
        setBusy(label);
        try {
            await fn();
            toast.success(label);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || `${label} failed`);
        } finally {
            setBusy('');
        }
    };

    const runSample = async () => {
        if (!vis.canRun) return;
        setBusy('sample');
        try {
            const out = await dataExtractorApi.scoreLeadSample({
                mode: 'rule_based',
                record: {
                    companyName: 'Bright Sensor OEM',
                    website: 'https://sensor.test',
                    businessDescription: 'OEM industrial sensor manufacturer',
                    city: 'Pune',
                    country: 'India',
                },
                classification: {
                    status: 'CLASSIFIED', parentIndustry: 'Electronics', subIndustry: 'OEM Components',
                    customerType: 'OEM', confidenceScore: 88, evidenceSnippets: ['industrial sensor'],
                },
                relevance: { status: 'RELEVANT', relevanceScore: 82, evidenceSnippets: ['OEM'] },
                recommendation: {
                    status: 'RECOMMENDED', confidence: 80, opportunityScore: 78,
                    recommendedSalesStrategy: 'High Priority OEM',
                    primaryRecommendation: { productName: 'Industrial Sensor Kit', opportunityScore: 78, reason: 'OEM fit' },
                },
                contact: {
                    status: 'CONTACT_FOUND', confidence: 75, decisionMakerScore: 70,
                    primaryContact: {
                        contactKey: 'email:purchase@sensor.test', contactName: 'Purchase Head',
                        email: 'purchase@sensor.test', contactRoleCategory: 'Purchase',
                        isDecisionMakerCandidate: true, verificationStatus: 'MULTIPLE_SOURCE_CONFIRMED',
                    },
                },
                profile: { status: 'GENERATED', confidence: 78, missingInformation: ['Public phone not available'] },
            });
            setSampleResult(out);
            toast.success('Sample scored');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Sample failed');
        } finally {
            setBusy('');
        }
    };

    if (!vis.canView) {
        return <p style={{ color: '#64748b' }}>You do not have permission to view lead scores.</p>;
    }

    const selected = items.find((x) => x._id === selectedId);

    return (
        <div style={{ maxWidth: 1100 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Lead Scoring / Priority</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Final explainable score from Phase 6–10 outputs. Configurable weights. No auto Lead/Task/Email/WhatsApp actions.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {Object.entries(filters).map(([k, v]) => (
                    <input key={k} style={field} placeholder={k} value={v} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))} />
                ))}
                <button type="button" style={btn} onClick={load} disabled={!!busy}>Refresh</button>
                {vis.canExport ? (
                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Export loaded', async () => {
                        setExportPreview((await dataExtractorApi.exportApprovedLeadScores({ format: 'json' }))?.results || []);
                    })}>Export approved</button>
                ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16 }}>
                <div>
                    <h3 style={{ fontSize: 14 }}>Lead Score queue</h3>
                    {(items || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No scores yet.</p> : null}
                    {(items || []).map((row) => (
                        <div
                            key={row._id}
                            style={{ ...card, cursor: 'pointer', borderColor: selectedId === row._id ? '#2563eb' : '#e2e8f0' }}
                            onClick={() => { setSelectedId(row._id); setOverrideScore(String(row.finalScore ?? '')); setHistory(null); }}
                            onKeyDown={() => {}}
                            role="button"
                            tabIndex={0}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <strong style={{ fontSize: 13 }}>{row.companyName || 'Untitled'}</strong>
                                <span style={{ fontSize: 16, fontWeight: 700 }}>{row.finalScore ?? '—'}</span>
                            </div>
                            <div style={{ marginTop: 6 }}>
                                <span style={badge(row.priority, priorityBg(row.priority))}>{row.priority}</span>
                                <span style={badge(row.grade)}>{row.grade}</span>
                                <span style={badge(row.status)}>{row.status}</span>
                                {row.locked ? <span style={badge('LOCKED', '#fee2e2')}>LOCKED</span> : null}
                                {row.status === 'OUTDATED' ? <span style={badge('OUTDATED', '#fee2e2')}>OUTDATED</span> : null}
                            </div>
                        </div>
                    ))}
                </div>

                <div>
                    <h3 style={{ fontSize: 14 }}>Score card</h3>
                    {!selected ? <p style={{ color: '#94a3b8' }}>Select a score.</p> : (
                        <>
                            <div style={card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <strong>{selected.companyName}</strong>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>{selected.recommendation}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{selected.finalScore}</div>
                                        <div style={{ fontSize: 11, color: '#64748b' }}>/ 100</div>
                                    </div>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <span style={badge(selected.priority, priorityBg(selected.priority))}>{selected.priority}</span>
                                    <span style={badge(selected.grade)}>{selected.grade}</span>
                                    <span style={badge(`conf ${selected.confidence}`)}>conf {selected.confidence}</span>
                                    <span style={badge(selected.engineUsed)}>{selected.engineUsed}</span>
                                    {selected.fallbackUsed ? <span style={badge('fallback', '#fef3c7')}>fallback</span> : null}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                    {vis.canApprove ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Approved', () => dataExtractorApi.approveLeadScore(selected._id, { reason: 'UI approve' }))}>Approve</button> : null}
                                    {vis.canReject ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Rejected', () => dataExtractorApi.rejectLeadScore(selected._id, { reason: 'UI reject' }))}>Reject</button> : null}
                                    {vis.canOverride ? (
                                        <>
                                            <input style={{ ...field, width: 70 }} value={overrideScore} onChange={(e) => setOverrideScore(e.target.value)} placeholder="score" />
                                            <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Overridden', () => dataExtractorApi.overrideLeadScore(selected._id, { action: 'override', finalScore: Number(overrideScore), reason: 'UI override' }))}>Override</button>
                                        </>
                                    ) : null}
                                    {vis.canRun ? <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Re-scored', () => dataExtractorApi.scoreLead({ adhocKey: selected.recordKey?.replace(/^adhoc:/, '') || selected._id, force: true, refresh: true, mode: 'rule_based', record: { companyName: selected.companyName }, classification: selected.inputSnapshots?.classification, relevance: selected.inputSnapshots?.relevance, recommendation: { primaryRecommendation: { productName: selected.inputSnapshots?.recommendation?.productName }, opportunityScore: selected.inputSnapshots?.recommendation?.opportunityScore, status: selected.inputSnapshots?.recommendation?.status }, contact: selected.inputSnapshots?.contact, profile: selected.inputSnapshots?.profile }))}>Re-score</button> : null}
                                    {vis.canLock ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(selected.locked ? 'Unlocked' : 'Locked', () => dataExtractorApi.lockLeadScore(selected._id, { action: selected.locked ? 'unlock' : 'lock' }))}>{selected.locked ? 'Unlock' : 'Lock'}</button> : null}
                                    {vis.canHistory ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('History loaded', async () => { setHistory(await dataExtractorApi.getLeadScoreHistory(selected._id)); })}>History</button> : null}
                                </div>
                            </div>

                            <div style={card}>
                                <strong>Dimension breakdown</strong>
                                <table style={{ width: '100%', fontSize: 12, marginTop: 8, borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr><th align="left">Dimension</th><th align="right">Score</th></tr>
                                    </thead>
                                    <tbody>
                                        {(selected.dimensionScores || []).map((d) => (
                                            <tr key={d.id}>
                                                <td style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                                                    <div>{d.label}</div>
                                                    <div style={{ color: '#94a3b8' }}>{d.reason}</div>
                                                </td>
                                                <td align="right" style={{ borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{d.score} / {d.maxScore}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={card}>
                                <strong>Positive signals</strong>
                                <ul style={{ fontSize: 12 }}>{(selected.positiveSignals || []).map((s) => <li key={s}>{s}</li>)}</ul>
                                <strong>Negative signals / penalties</strong>
                                <ul style={{ fontSize: 12 }}>
                                    {(selected.negativeSignals || []).map((s) => <li key={s}>{s}</li>)}
                                    {(selected.penalties || []).map((p, i) => <li key={`p-${i}`}>-{p.points}: {p.reason}</li>)}
                                </ul>
                                <strong>Boosts</strong>
                                <ul style={{ fontSize: 12 }}>{(selected.boosts || []).map((b, i) => <li key={`b-${i}`}>+{b.points}: {b.reason}</li>)}</ul>
                            </div>

                            <div style={card}>
                                <strong>Evidence / sources</strong>
                                <ul style={{ fontSize: 12 }}>{(selected.sourceUrls || []).map((u) => <li key={u}>{u}</li>)}</ul>
                            </div>
                            {history ? <div style={card}><strong>History</strong><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(history.history || [], null, 2)}</pre></div> : null}
                        </>
                    )}

                    <div style={card}>
                        <strong>Sample score (permission: run)</strong>
                        {!vis.canRun ? <p style={{ fontSize: 12, color: '#94a3b8' }}>Run permission required.</p> : (
                            <>
                                <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy} onClick={runSample}>Score sample</button>
                                {sampleResult ? <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>{JSON.stringify(sampleResult, null, 2)}</pre> : null}
                            </>
                        )}
                    </div>

                    {exportPreview ? (
                        <div style={card}>
                            <strong>Export preview ({exportPreview.length})</strong>
                            <pre style={{ fontSize: 11, maxHeight: 180, overflow: 'auto' }}>{JSON.stringify(exportPreview.slice(0, 20), null, 2)}</pre>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
