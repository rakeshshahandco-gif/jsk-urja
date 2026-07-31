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

export default function DataExtractorCompanyIntelligencePage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.company_intelligence.view'),
        canGenerate: can(hasPermission, 'data_extractor.company_intelligence.generate'),
        canBatch: can(hasPermission, 'data_extractor.company_intelligence.batch'),
        canEdit: can(hasPermission, 'data_extractor.company_intelligence.edit'),
        canApprove: can(hasPermission, 'data_extractor.company_intelligence.approve'),
        canLock: can(hasPermission, 'data_extractor.company_intelligence.lock'),
        canHistory: can(hasPermission, 'data_extractor.company_intelligence.history'),
        canExport: can(hasPermission, 'data_extractor.company_intelligence.export'),
    }), [hasPermission]);

    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [exportPreview, setExportPreview] = useState(null);
    const [busy, setBusy] = useState('');
    const [filters, setFilters] = useState({
        status: '', primaryIndustry: '', customerType: '', recommendedProduct: '',
        locked: '', approved: '', outdated: '', minConfidence: '', engineUsed: '',
    });
    const [sample, setSample] = useState({
        companyName: 'Sample OEM Co',
        website: 'https://example.test',
        businessDescription: 'Public OEM electronics manufacturer of industrial sensors',
        city: 'Pune',
        country: 'India',
        parentIndustry: 'Electronics',
        subIndustry: 'OEM Components',
        customerType: 'OEM',
        mode: 'rule_based',
    });
    const [sampleResult, setSampleResult] = useState(null);
    const [editText, setEditText] = useState('');

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
            const data = await dataExtractorApi.listCompanyProfiles(params);
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load profiles');
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
        if (!vis.canGenerate) return;
        setBusy('sample');
        try {
            const out = await dataExtractorApi.generateCompanyProfileSample({
                mode: sample.mode,
                record: {
                    companyName: sample.companyName,
                    website: sample.website,
                    businessDescription: sample.businessDescription,
                    city: sample.city,
                    country: sample.country,
                },
                classification: {
                    status: 'CLASSIFIED',
                    parentIndustry: sample.parentIndustry,
                    subIndustry: sample.subIndustry,
                    customerType: sample.customerType,
                    confidenceScore: 80,
                    evidenceSnippets: [sample.businessDescription],
                    productSignals: ['industrial sensors'],
                },
                relevance: { status: 'RELEVANT', relevanceScore: 75, whyRelevant: 'OEM electronics fit' },
                recommendation: {
                    status: 'RECOMMENDED',
                    confidence: 70,
                    recommendedSalesStrategy: 'OEM / Technical',
                    primaryRecommendation: { productName: 'Industrial Sensor Kit', brochureUrl: 'https://example.test/brochure.pdf' },
                },
                contact: {
                    status: 'CONTACT_FOUND',
                    confidence: 70,
                    primaryContact: {
                        contactKey: 'email:purchase@example.test',
                        contactName: 'Purchase Desk',
                        email: 'purchase@example.test',
                        contactRoleCategory: 'Purchase',
                        isDecisionMakerCandidate: true,
                        sourceUrl: 'https://example.test/contact',
                    },
                },
            });
            setSampleResult(out);
            toast.success('Sample generated');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Sample failed');
        } finally {
            setBusy('');
        }
    };

    if (!vis.canView) {
        return <p style={{ color: '#64748b' }}>You do not have permission to view company intelligence profiles.</p>;
    }

    const selected = items.find((x) => x._id === selectedId);
    const statusBg = (s) => (s === 'APPROVED' || s === 'LOCKED' ? '#dcfce7' : s === 'OUTDATED' || s === 'FAILED' ? '#fee2e2' : s === 'LOW_CONFIDENCE' || s === 'MANUAL_REVIEW_REQUIRED' ? '#fef3c7' : '#e0f2fe');

    return (
        <div style={{ maxWidth: 1100 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Company Intelligence Profiles</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Source-grounded business profiles assembled from Phase 6–9 outputs. No invented revenue, employees, certifications or contacts.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {Object.entries(filters).map(([k, v]) => (
                    <input key={k} style={field} placeholder={k} value={v} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))} />
                ))}
                <button type="button" style={btn} onClick={load} disabled={!!busy}>Refresh</button>
                {vis.canExport ? (
                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Export loaded', async () => {
                        setExportPreview((await dataExtractorApi.exportApprovedProfiles({ format: 'json' }))?.results || []);
                    })}>Export approved</button>
                ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16 }}>
                <div>
                    <h3 style={{ fontSize: 14 }}>Profile queue</h3>
                    {(items || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No profiles yet.</p> : null}
                    {(items || []).map((row) => (
                        <div
                            key={row._id}
                            style={{ ...card, cursor: 'pointer', borderColor: selectedId === row._id ? '#2563eb' : '#e2e8f0' }}
                            onClick={() => { setSelectedId(row._id); setEditText(row.standardSummary || ''); setHistory(null); }}
                            onKeyDown={() => {}}
                            role="button"
                            tabIndex={0}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <strong style={{ fontSize: 13 }}>{row.companyName || 'Untitled'}</strong>
                                <span style={badge(row.status, statusBg(row.status))}>{row.status}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{row.shortSummary}</div>
                            <div style={{ marginTop: 6 }}>
                                <span style={badge(row.engineUsed || 'rules')}>{row.engineUsed || 'rules'}</span>
                                {row.fallbackUsed ? <span style={badge('fallback', '#fef3c7')}>fallback</span> : null}
                                {row.locked ? <span style={badge('LOCKED', '#fee2e2')}>LOCKED</span> : null}
                                <span style={badge(`conf ${row.confidence ?? '—'}`)}>conf {row.confidence ?? '—'}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div>
                    <h3 style={{ fontSize: 14 }}>Detailed profile</h3>
                    {!selected ? <p style={{ color: '#94a3b8' }}>Select a profile.</p> : (
                        <>
                            <div style={card}>
                                <strong>{selected.companyName}</strong>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                    {selected.primaryIndustry || '—'} · {selected.customerType || '—'} · Next: {selected.recommendedNextAction || '—'}
                                </div>
                                <div style={{ marginTop: 6 }}>
                                    <span style={badge(selected.status, statusBg(selected.status))}>{selected.status}</span>
                                    <span style={badge(selected.engineUsed)}>{selected.engineUsed}</span>
                                    {selected.fallbackUsed ? <span style={badge('fallback', '#fef3c7')}>fallback</span> : null}
                                    {selected.status === 'OUTDATED' ? <span style={badge('OUTDATED', '#fee2e2')}>OUTDATED</span> : null}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                    {vis.canApprove ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Approved', () => dataExtractorApi.approveCompanyProfile(selected._id, { reason: 'UI approve' }))}>Approve</button> : null}
                                    {vis.canEdit ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Saved edit', () => dataExtractorApi.editCompanyProfile(selected._id, { action: 'edit', standardSummary: editText, reason: 'UI edit' }))}>Save edit</button> : null}
                                    {vis.canGenerate ? <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Re-generated', () => dataExtractorApi.generateCompanyProfile({ adhocKey: selected.recordKey?.replace(/^adhoc:/, '') || selected._id, force: true, refresh: true, mode: 'rule_based', record: { companyName: selected.companyName, website: selected.structuredSections?.companyOverview?.website, businessDescription: selected.structuredSections?.companyOverview?.description }, classification: { parentIndustry: selected.primaryIndustry, customerType: selected.customerType, status: 'CLASSIFIED', confidenceScore: selected.confidence }, relevance: selected.relevanceSnapshot, recommendation: { primaryRecommendation: { productName: selected.recommendationSnapshot?.productName }, recommendedSalesStrategy: selected.recommendationSnapshot?.salesStrategy, status: 'RECOMMENDED' }, contact: selected.contactSnapshot }))}>Re-generate</button> : null}
                                    {vis.canLock ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(selected.locked ? 'Unlocked' : 'Locked', () => dataExtractorApi.lockCompanyProfile(selected._id, { action: selected.locked ? 'unlock' : 'lock' }))}>{selected.locked ? 'Unlock' : 'Lock'}</button> : null}
                                    {vis.canHistory ? <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('History loaded', async () => { setHistory(await dataExtractorApi.getCompanyProfileHistory(selected._id)); })}>History</button> : null}
                                </div>
                            </div>

                            <div style={card}><strong>Company overview</strong><p style={{ fontSize: 13 }}>{selected.standardSummary}</p></div>
                            <div style={card}>
                                <strong>Relevance / products / contacts</strong>
                                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify({
                                    relevance: selected.relevanceSnapshot,
                                    recommendation: selected.recommendationSnapshot,
                                    contact: selected.contactSnapshot,
                                }, null, 2)}</pre>
                            </div>
                            <div style={card}>
                                <strong>Strengths</strong>
                                <ul style={{ fontSize: 12 }}>{(selected.strengths || []).map((s) => <li key={s}>{s}</li>)}</ul>
                                <strong>Risks</strong>
                                <ul style={{ fontSize: 12 }}>{(selected.risks || []).map((s) => <li key={s}>{s}</li>)}</ul>
                                <strong>Missing information</strong>
                                <ul style={{ fontSize: 12 }}>{(selected.missingInformation || []).map((s) => <li key={s}>{s}</li>)}</ul>
                            </div>
                            <div style={card}>
                                <strong>Evidence / sources</strong>
                                <ul style={{ fontSize: 12 }}>
                                    {(selected.sourceUrls || []).map((u) => <li key={u}>{u}</li>)}
                                </ul>
                                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(selected.evidenceReferences || [], null, 2)}</pre>
                            </div>
                            {vis.canEdit ? (
                                <div style={card}>
                                    <strong>Edit standard summary</strong>
                                    <textarea style={{ ...field, width: '100%', minHeight: 90 }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                                </div>
                            ) : null}
                            {history ? <div style={card}><strong>History</strong><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(history.history || [], null, 2)}</pre></div> : null}
                        </>
                    )}

                    <div style={card}>
                        <strong>Sample generate (permission: generate)</strong>
                        {!vis.canGenerate ? <p style={{ fontSize: 12, color: '#94a3b8' }}>Generate permission required.</p> : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                    {Object.entries(sample).map(([k, v]) => (
                                        <input key={k} style={field} placeholder={k} value={v} onChange={(e) => setSample((s) => ({ ...s, [k]: e.target.value }))} />
                                    ))}
                                </div>
                                <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy} onClick={runSample}>Generate sample</button>
                                {sampleResult ? <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{JSON.stringify(sampleResult, null, 2)}</pre> : null}
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
