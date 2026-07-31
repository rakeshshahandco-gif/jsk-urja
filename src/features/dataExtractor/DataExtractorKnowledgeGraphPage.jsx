import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorKnowledgeGraphPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.knowledge_graph.view');
    const canSearch = can(hasPermission, 'data_extractor.knowledge_graph.search') || canView;
    const canRel = can(hasPermission, 'data_extractor.knowledge_graph.relationships') || canView;
    const canAnalytics = can(hasPermission, 'data_extractor.knowledge_graph.analytics') || canView;
    const canExport = can(hasPermission, 'data_extractor.knowledge_graph.export');
    const canManage = can(hasPermission, 'data_extractor.knowledge_graph.manage');
    const canLearningFeedback = can(hasPermission, 'data_extractor.ai_learning.submit_feedback');

    const [q, setQ] = useState('');
    const [relType, setRelType] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [centerId, setCenterId] = useState('');
    const [graph, setGraph] = useState(null);
    const [explain, setExplain] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [history, setHistory] = useState([]);
    const [busy, setBusy] = useState('');
    const [selectedEdge, setSelectedEdge] = useState(null);

    const loadAnalytics = useCallback(async () => {
        if (!canAnalytics) return;
        try {
            setAnalytics(await dataExtractorApi.getKnowledgeGraphAnalytics());
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Analytics failed');
        }
    }, [canAnalytics]);

    useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

    const doSearch = async () => {
        if (!canSearch) return;
        setBusy('search');
        try {
            const data = await dataExtractorApi.searchKnowledgeGraph({ q, relationshipType: relType || undefined });
            setSearchResult(data);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Search failed');
        } finally {
            setBusy('');
        }
    };

    const loadGraph = async (nodeId) => {
        if (!canView || !nodeId) return;
        setBusy('graph');
        setCenterId(nodeId);
        try {
            const data = await dataExtractorApi.getKnowledgeGraphView({ center: nodeId });
            setGraph(data);
            setExplain(null);
            setSelectedEdge(null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Graph load failed');
        } finally {
            setBusy('');
        }
    };

    const loadExplain = async (relationshipId) => {
        if (!canRel || !relationshipId) return;
        setBusy('explain');
        try {
            const data = await dataExtractorApi.explainKnowledgeGraphRelationship(relationshipId);
            setExplain(data);
            setSelectedEdge(relationshipId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Explain failed');
        } finally {
            setBusy('');
        }
    };

    const runDiscover = async () => {
        if (!canManage) return;
        setBusy('discover');
        try {
            const data = await dataExtractorApi.discoverKnowledgeGraph({ limitLeads: 200 });
            toast.success(`Discovered ${data?.relationships || 0} relationships (KG-only)`);
            await loadAnalytics();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Discover failed');
        } finally {
            setBusy('');
        }
    };

    const doExport = async () => {
        if (!canExport) return;
        try {
            const data = await dataExtractorApi.exportKnowledgeGraph();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'knowledge-graph-export.json';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Export failed');
        }
    };

    const loadHistory = async () => {
        try {
            const data = await dataExtractorApi.getKnowledgeGraphHistory();
            setHistory(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'History failed');
        }
    };

    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    const width = 640;
    const height = 420;
    const cx = width / 2;
    const cy = height / 2;

    const edgeLines = useMemo(() => edges.map((e) => {
        const from = nodes.find((n) => n.id === e.from);
        const to = nodes.find((n) => n.id === e.to);
        if (!from || !to) return null;
        return { ...e, x1: cx + (from.x || 0), y1: cy + (from.y || 0), x2: cx + (to.x || 0), y2: cy + (to.y || 0) };
    }).filter(Boolean), [edges, nodes, cx, cy]);

    if (!canView) {
        return <div style={card}>You do not have permission to view the Knowledge Graph.</div>;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Business Knowledge Graph</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                        Relationship intelligence from evidence. Every link is explainable. No CRM mutation, merge, assign, or send actions.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canManage && <button type="button" style={btnPrimary} disabled={busy === 'discover'} onClick={runDiscover}>Discover relationships</button>}
                    {canExport && <button type="button" style={btn} onClick={doExport}>Export</button>}
                    <button type="button" style={btn} onClick={loadHistory}>Timeline / history</button>
                </div>
            </div>

            {analytics && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
                    <div style={card}><div style={{ fontSize: 11, color: '#64748b' }}>Nodes</div><div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.nodeCount}</div></div>
                    <div style={card}><div style={{ fontSize: 11, color: '#64748b' }}>Relationships</div><div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.relationshipCount}</div></div>
                    <div style={card}><div style={{ fontSize: 11, color: '#64748b' }}>Outdated</div><div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.outdatedRelationships}</div></div>
                </div>
            )}

            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 8 }}>
                    <input style={field} value={q} placeholder="Search: sister companies, OEMs, DALI, shared website…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }} />
                    <select style={field} value={relType} onChange={(e) => setRelType(e.target.value)}>
                        <option value="">All relationship types</option>
                        {['SimilarCompany', 'PotentialDuplicate', 'SharedWebsite', 'SharedPhone', 'SharedEmail', 'SharedIndustry', 'ProductRecommended', 'PotentialCrossSell', 'Competitor', 'PotentialOEM', 'PotentialDealer', 'PotentialDistributor', 'CrmLinked', 'WorkflowLinked'].map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    <button type="button" style={btnPrimary} disabled={!canSearch || busy === 'search'} onClick={doSearch}>Search</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={card}>
                    <strong>Relationship table</strong>
                    <div style={{ maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>From</th>
                                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>Type</th>
                                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>To</th>
                                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>Conf.</th>
                                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {(searchResult?.items || []).map((item) => {
                                    const isRel = !!item.relationshipType;
                                    return (
                                        <tr key={item.id}>
                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>{isRel ? item.fromLabel : item.label}</td>
                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>{isRel ? item.relationshipType : item.nodeType}</td>
                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>{isRel ? item.toLabel : (item.freshness || 'CURRENT')}</td>
                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>{isRel ? item.confidence : '—'}</td>
                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>
                                                {isRel ? (
                                                    <>
                                                        <button type="button" style={btn} onClick={() => loadExplain(item.id)}>Why</button>
                                                        <button type="button" style={btn} onClick={() => loadGraph(item.fromNodeId)}>Graph</button>
                                                    </>
                                                ) : (
                                                    <button type="button" style={btn} onClick={() => loadGraph(item.id)}>Open graph</button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={card}>
                    <strong>Graph viewer {centerId ? `(center ${centerId.slice(-6)})` : ''}</strong>
                    <div style={{ overflow: 'auto', marginTop: 8, background: '#f8fafc', borderRadius: 8 }}>
                        <svg width={width} height={height}>
                            {edgeLines.map((e) => (
                                <g key={e.id}>
                                    <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={selectedEdge === e.id ? '#1d4ed8' : '#94a3b8'} strokeWidth={selectedEdge === e.id ? 2.5 : 1.2} />
                                    <text x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2} fontSize="9" fill="#64748b" textAnchor="middle">{e.label}</text>
                                    <circle cx={(e.x1 + e.x2) / 2} cy={(e.y1 + e.y2) / 2} r="6" fill="transparent" style={{ cursor: 'pointer' }} onClick={() => loadExplain(e.id)} />
                                </g>
                            ))}
                            {nodes.map((n) => (
                                <g key={n.id} transform={`translate(${cx + (n.x || 0)}, ${cy + (n.y || 0)})`} style={{ cursor: 'pointer' }} onClick={() => loadGraph(n.id)}>
                                    <circle r={n.isCenter ? 18 : 12} fill={n.isCenter ? '#1d4ed8' : '#e2e8f0'} stroke="#64748b" />
                                    <text y={28} fontSize="10" textAnchor="middle" fill="#0f172a">{(n.label || '').slice(0, 18)}</text>
                                    <title>{`${n.nodeType}: ${n.label} (${n.freshness})`}</title>
                                </g>
                            ))}
                        </svg>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                        Navigation only — no Merge / Create Lead / Assign / Delete / Approve buttons.
                        {' · '}
                        <Link to={PATHS.DATA_EXTRACTOR.CRM_ENRICHMENT}>CRM Enrichment</Link>
                        {' · '}
                        <Link to={PATHS.DATA_EXTRACTOR.SALES_WORKFLOW}>Sales Workflow</Link>
                        {' · '}
                        <Link to={PATHS.DATA_EXTRACTOR.SALES_ASSISTANT}>AI Assistant</Link>
                    </div>
                </div>
            </div>

            {explain && (
                <div style={card}>
                    <strong>Evidence / why this relationship</strong>
                    <div style={{ fontSize: 13, marginTop: 6 }}>{explain.explanation?.why}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
                        <span style={{ background: '#eff6ff', padding: '2px 8px', borderRadius: 999 }}>Confidence: {explain.explanation?.confidence}</span>
                        <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 999 }}>Source: {explain.explanation?.source}</span>
                        <span style={{ background: explain.explanation?.currentStatus === 'OUTDATED' ? '#fef3c7' : '#ecfdf5', padding: '2px 8px', borderRadius: 999 }}>
                            {explain.explanation?.currentStatus || 'CURRENT'}
                        </span>
                        <span style={{ background: '#f8fafc', padding: '2px 8px', borderRadius: 999 }}>Method: {explain.explanation?.discoveryMethod}</span>
                    </div>
                    <ul style={{ fontSize: 12, marginTop: 8 }}>
                        {(explain.evidence || []).map((e) => (
                            <li key={e.id}>
                                <strong>{e.field}</strong>: {e.displayValue} — {e.reason}
                                {' '}(+{e.confidenceContribution}) · {e.sourceModule} · {e.freshness}
                            </li>
                        ))}
                    </ul>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Limitations: {(explain.explanation?.limitations || []).join(' · ')}
                    </div>
                    {canLearningFeedback && explain.relationshipId && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                            <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>Feedback (does not approve/delete):</span>
                            {[
                                ['CONFIRM_RELATIONSHIP', 'Confirm'],
                                ['REJECT_RELATIONSHIP', 'Reject'],
                                ['WRONG_REASON', 'Wrong type'],
                                ['MISSING_DATA', 'Evidence insufficient'],
                                ['STALE_DATA', 'Outdated'],
                            ].map(([type, label]) => (
                                <button
                                    key={type}
                                    type="button"
                                    style={btn}
                                    onClick={async () => {
                                        try {
                                            await dataExtractorApi.submitLearningFeedback({
                                                sourceModule: 'knowledge_graph',
                                                sourceRecordId: explain.relationshipId || explain.id,
                                                feedbackType: type,
                                                comment: `KG relationship feedback: ${label}`,
                                                outputType: 'relationship',
                                            });
                                            toast.success('Feedback recorded (relationship unchanged)');
                                        } catch (err) {
                                            toast.error(err?.response?.data?.message || 'Feedback failed');
                                        }
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!!history.length && (
                <div style={card}>
                    <strong>Company timeline / discovery history</strong>
                    <ul style={{ fontSize: 12, maxHeight: 160, overflow: 'auto' }}>
                        {history.map((h) => (
                            <li key={h._id}>{h.action} · {h.entityType} · {h.reason} · {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
