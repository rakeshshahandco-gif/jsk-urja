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

function relBg(t) {
    if (String(t || '').includes('COMPETITOR')) return '#fee2e2';
    if (String(t || '').includes('BRANCH') || String(t || '').includes('RELATED') || String(t || '').includes('GROUP')) return '#fef3c7';
    if (String(t || '').includes('CUSTOMER') || String(t || '').includes('DEALER') || String(t || '').includes('DISTRIBUTOR')) return '#dcfce7';
    return '#e0f2fe';
}

export default function DataExtractorSimilarCompanyPage({ defaultTab = 'similar' } = {}) {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.similar_company.view'),
        canRun: can(hasPermission, 'data_extractor.similar_company.run'),
        canOverride: can(hasPermission, 'data_extractor.similar_company.override'),
        canApprove: can(hasPermission, 'data_extractor.similar_company.approve'),
        canReject: can(hasPermission, 'data_extractor.similar_company.reject'),
        canLock: can(hasPermission, 'data_extractor.similar_company.lock'),
        canHistory: can(hasPermission, 'data_extractor.similar_company.history'),
        canExport: can(hasPermission, 'data_extractor.similar_company.export'),
        canManage: can(hasPermission, 'data_extractor.similar_company.manage'),
        canMarketView: can(hasPermission, 'data_extractor.market_intelligence.view'),
        canMarketRun: can(hasPermission, 'data_extractor.market_intelligence.run'),
    }), [hasPermission]);

    const [tab, setTab] = useState(defaultTab === 'market' ? 'market' : 'similar');
    const [items, setItems] = useState([]);
    const [marketItems, setMarketItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [exportPreview, setExportPreview] = useState(null);
    const [sampleResult, setSampleResult] = useState(null);
    const [busy, setBusy] = useState('');
    const [filters, setFilters] = useState({
        status: '', relationshipType: '', minScore: '', seedCompanyName: '', locked: '', approved: '', outdated: '',
    });
    const [seedLeadId, setSeedLeadId] = useState('');

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
            const data = await dataExtractorApi.listSimilarCompanies(params);
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load similar companies');
        }
    }, [filters, vis.canView]);

    const loadMarket = useCallback(async () => {
        if (!vis.canMarketView) return;
        try {
            const data = await dataExtractorApi.listMarketIntelligence({});
            setMarketItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load market intelligence');
        }
    }, [vis.canMarketView]);

    useEffect(() => { if (tab === 'similar') load(); else loadMarket(); }, [tab, load, loadMarket]);

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
            const data = await dataExtractorApi.findSimilarSample({
                seed: {
                    companyName: 'Sample Lighting OEM',
                    record: { companyName: 'Sample Lighting OEM', city: 'Pune', businessDescription: 'LED lighting OEM manufacturer' },
                    classification: { parentIndustry: 'Lighting', subIndustry: 'LED OEM', customerType: 'OEM', confidenceScore: 80 },
                    relevance: { status: 'RELEVANT', relevanceScore: 80 },
                    recommendation: { primaryRecommendation: { productName: 'LED Drivers' } },
                    score: { finalScore: 78, confidence: 70 },
                },
                candidate: {
                    companyName: 'Peer Lighting Works',
                    record: { companyName: 'Peer Lighting Works', city: 'Pune', businessDescription: 'LED lighting manufacturer' },
                    classification: { parentIndustry: 'Lighting', subIndustry: 'LED OEM', customerType: 'OEM', confidenceScore: 75 },
                    relevance: { status: 'RELEVANT', relevanceScore: 76 },
                    recommendation: { primaryRecommendation: { productName: 'LED Drivers' } },
                    score: { finalScore: 74, confidence: 68 },
                },
            });
            setSampleResult(data);
            toast.success('Sample similarity scored');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Sample failed');
        } finally {
            setBusy('');
        }
    };

    const selected = items.find((x) => String(x._id) === String(selectedId));

    return (
        <div style={{ padding: 16, maxWidth: 1200 }}>
            <h2 style={{ marginTop: 0 }}>Similar Companies & Market Intelligence</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Produces similar-company candidates and market gaps only. Does not auto-create CRM Leads, Customers, Suppliers, Tasks, email or WhatsApp.
                Relationship labels use POSSIBLE_ where inferred. Paid providers are never auto-run.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button type="button" style={tab === 'similar' ? btnPrimary : btn} onClick={() => setTab('similar')}>Similar Companies</button>
                <button type="button" style={tab === 'market' ? btnPrimary : btn} onClick={() => setTab('market')}>Market Intelligence</button>
            </div>

            {tab === 'similar' && (
                <>
                    {!vis.canView && <div style={card}>View permission required.</div>}
                    {vis.canView && (
                        <>
                            <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                <input style={field} placeholder="Seed company name filter" value={filters.seedCompanyName} onChange={(e) => setFilters({ ...filters, seedCompanyName: e.target.value })} />
                                <input style={field} placeholder="Min score" value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: e.target.value })} />
                                <select style={field} value={filters.relationshipType} onChange={(e) => setFilters({ ...filters, relationshipType: e.target.value })}>
                                    <option value="">All relationships</option>
                                    <option value="SIMILAR_COMPANY">SIMILAR_COMPANY</option>
                                    <option value="INDUSTRY_PEER">INDUSTRY_PEER</option>
                                    <option value="POSSIBLE_COMPETITOR">POSSIBLE_COMPETITOR</option>
                                    <option value="POSSIBLE_CUSTOMER">POSSIBLE_CUSTOMER</option>
                                    <option value="POSSIBLE_BRANCH">POSSIBLE_BRANCH</option>
                                    <option value="RELATED_COMPANY">RELATED_COMPANY</option>
                                </select>
                                <select style={field} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                                    <option value="">All statuses</option>
                                    <option value="HIGH_POTENTIAL">HIGH_POTENTIAL</option>
                                    <option value="SIMILAR">SIMILAR</option>
                                    <option value="APPROVED_FOR_ENRICHMENT">APPROVED_FOR_ENRICHMENT</option>
                                    <option value="RELATED_COMPANY_REVIEW">RELATED_COMPANY_REVIEW</option>
                                    <option value="POSSIBLE_BRANCH_REVIEW">POSSIBLE_BRANCH_REVIEW</option>
                                    <option value="REJECTED">REJECTED</option>
                                    <option value="OUTDATED">OUTDATED</option>
                                </select>
                                <button type="button" style={btn} onClick={load} disabled={!!busy}>Refresh</button>
                                {vis.canRun && <button type="button" style={btnPrimary} onClick={runSample} disabled={!!busy}>Run sample pair</button>}
                                {vis.canExport && (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Export', async () => {
                                        const data = await dataExtractorApi.exportApprovedSimilarCompanies({ format: 'json' });
                                        setExportPreview(data);
                                    })}>Export approved</button>
                                )}
                            </div>

                            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <input style={{ ...field, minWidth: 280 }} placeholder="Seed extractedLeadId (optional find)" value={seedLeadId} onChange={(e) => setSeedLeadId(e.target.value)} />
                                {vis.canRun && (
                                    <button type="button" style={btnPrimary} disabled={!seedLeadId || !!busy} onClick={() => runAction('Find similar', async () => {
                                        await dataExtractorApi.findSimilarCompanies({ seedExtractedLeadId: seedLeadId });
                                    })}>Find similar for seed</button>
                                )}
                            </div>

                            {sampleResult && (
                                <div style={card}>
                                    <strong>Sample:</strong> {sampleResult.seedCompanyName} → {sampleResult.candidateCompanyName}
                                    <div style={{ marginTop: 6 }}>
                                        <span style={badge(`Score ${sampleResult.similarityScore}`, '#dcfce7')} />
                                        <span style={badge(sampleResult.relationshipType, relBg(sampleResult.relationshipType))} />
                                        <span style={badge(sampleResult.status)} />
                                    </div>
                                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
                                        {(sampleResult.primaryReasons || []).map((r) => <li key={r}>{r}</li>)}
                                    </ul>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                                <div>
                                    {items.map((row) => (
                                        <div key={row._id} style={{ ...card, cursor: 'pointer', outline: String(selectedId) === String(row._id) ? '2px solid #1d4ed8' : 'none' }} onClick={() => setSelectedId(row._id)}>
                                            <div style={{ fontWeight: 600 }}>{row.candidateCompanyName || '—'}</div>
                                            <div style={{ fontSize: 12, color: '#64748b' }}>Seed: {row.seedCompanyName}</div>
                                            <div style={{ marginTop: 6 }}>
                                                <span style={badge(`Sim ${row.similarityScore}`, '#dcfce7')} />
                                                <span style={badge(row.relationshipType, relBg(row.relationshipType))} />
                                                <span style={badge(row.status)} />
                                                {row.locked ? <span style={badge('LOCKED', '#fecaca')} /> : null}
                                                {row.candidateLeadScore != null ? <span style={badge(`Lead ${row.candidateLeadScore}`)} /> : null}
                                            </div>
                                            {(row.riskSignals || []).length > 0 && (
                                                <div style={{ marginTop: 6, fontSize: 11, color: '#b45309' }}>{(row.riskSignals || []).slice(0, 2).join(' · ')}</div>
                                            )}
                                        </div>
                                    ))}
                                    {!items.length && <div style={card}>No similar-company results yet.</div>}
                                </div>

                                <div>
                                    {selected ? (
                                        <div style={card}>
                                            <h3 style={{ marginTop: 0 }}>{selected.candidateCompanyName}</h3>
                                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                                                CRM: {selected.existingCrmStatus || 'UNKNOWN'} · Dup: {selected.duplicateEntityStatus || '—'} · Geo: {selected.geographicProximity?.matchType || '—'}
                                                {selected.geographicProximity?.distanceKm != null ? ` (${selected.geographicProximity.distanceKm} km)` : ''}
                                            </div>
                                            <div style={{ fontSize: 12, marginBottom: 8 }}><strong>Next:</strong> {selected.recommendedNextAction || '—'}</div>
                                            <div style={{ fontSize: 12, marginBottom: 8 }}>
                                                <strong>Reasons</strong>
                                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                                    {(selected.primaryReasons || []).map((r) => <li key={r}>{r}</li>)}
                                                </ul>
                                            </div>
                                            <div style={{ fontSize: 12, marginBottom: 8 }}>
                                                <strong>Evidence</strong>
                                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                                    {(selected.evidence || []).slice(0, 10).map((e, i) => (
                                                        <li key={i}>{e.reason || e.type || JSON.stringify(e)}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {vis.canApprove && <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Approve enrichment', () => dataExtractorApi.approveSimilarCompany(selected._id))}>Approve for enrichment</button>}
                                                {vis.canReject && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Reject', () => dataExtractorApi.rejectSimilarCompany(selected._id, { reason: 'Rejected in UI' }))}>Reject</button>}
                                                {vis.canOverride && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Mark competitor', () => dataExtractorApi.overrideSimilarCompany(selected._id, { action: 'mark_competitor' }))}>Mark possible competitor</button>}
                                                {vis.canOverride && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Mark peer', () => dataExtractorApi.overrideSimilarCompany(selected._id, { action: 'mark_peer' }))}>Mark peer</button>}
                                                {vis.canOverride && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Mark related', () => dataExtractorApi.overrideSimilarCompany(selected._id, { action: 'mark_related' }))}>Mark related</button>}
                                                {vis.canOverride && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Mark branch', () => dataExtractorApi.overrideSimilarCompany(selected._id, { action: 'mark_branch' }))}>Mark branch review</button>}
                                                {vis.canLock && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(selected.locked ? 'Unlock' : 'Lock', () => dataExtractorApi.lockSimilarCompany(selected._id, { action: selected.locked ? 'unlock' : 'lock' }))}>{selected.locked ? 'Unlock' : 'Lock'}</button>}
                                                {vis.canHistory && <button type="button" style={btn} disabled={!!busy} onClick={async () => { setBusy('history'); try { setHistory(await dataExtractorApi.getSimilarCompanyHistory(selected._id)); } finally { setBusy(''); } }}>History</button>}
                                            </div>
                                            {history && String(history._id) === String(selected._id) && (
                                                <div style={{ marginTop: 10, fontSize: 11, maxHeight: 180, overflow: 'auto' }}>
                                                    {(history.history || []).slice().reverse().map((h, i) => (
                                                        <div key={i} style={{ borderTop: '1px solid #f1f5f9', padding: '4px 0' }}>
                                                            {h.action} · {h.reason || ''} · {h.at ? new Date(h.at).toLocaleString() : ''}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={card}>Select a candidate to review evidence and actions.</div>
                                    )}
                                    {exportPreview && (
                                        <div style={card}>
                                            <strong>Export preview</strong> ({(exportPreview.results || []).length} rows)
                                            <pre style={{ fontSize: 11, maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(exportPreview.results?.slice(0, 3) || [], null, 2)}</pre>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{exportPreview.note}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {tab === 'market' && (
                <>
                    {!vis.canMarketView && <div style={card}>Market intelligence view permission required.</div>}
                    {vis.canMarketView && (
                        <>
                            <div style={{ ...card, display: 'flex', gap: 8 }}>
                                <button type="button" style={btn} onClick={loadMarket} disabled={!!busy}>Refresh</button>
                                {vis.canMarketRun && (
                                    <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Run market intel', async () => {
                                        await dataExtractorApi.runMarketIntelligence({});
                                        await loadMarket();
                                    })}>Run cluster / coverage / white-space</button>
                                )}
                            </div>
                            {marketItems.map((m) => (
                                <div key={m._id} style={card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <strong>{m.title || m.intelType}</strong>
                                        <span>
                                            <span style={badge(m.intelType)} />
                                            {m.coverageStatus ? <span style={badge(m.coverageStatus, '#fef3c7')} /> : null}
                                            <span style={badge(m.status)} />
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{m.summary}</div>
                                    {m.metrics?.note && <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>{m.metrics.note}</div>}
                                    {(m.recommendations || []).length > 0 && (
                                        <ul style={{ fontSize: 12, marginTop: 8 }}>
                                            {m.recommendations.slice(0, 3).map((r, i) => (
                                                <li key={i}>{r.searchKeyword || r.keyword || r.action} {r.manualApprovalRequired ? '(manual approval; no auto paid search)' : ''}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                            {!marketItems.length && <div style={card}>No market intelligence yet.</div>}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
