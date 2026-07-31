import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorRelevancePage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.lead_intelligence.view'),
        canRun: can(hasPermission, 'data_extractor.lead_intelligence.relevance_run'),
        canExclude: can(hasPermission, 'data_extractor.lead_intelligence.relevance_exclude'),
        canRestore: can(hasPermission, 'data_extractor.lead_intelligence.relevance_restore'),
        canAudit: can(hasPermission, 'data_extractor.lead_intelligence.relevance_audit'),
        canManage: can(hasPermission, 'data_extractor.lead_intelligence.manage'),
    }), [hasPermission]);

    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [busy, setBusy] = useState('');
    const [filters, setFilters] = useState({ status: '', excluded: '', searchKeyword: '' });
    const [sample, setSample] = useState({
        searchKeyword: 'LED Driver Manufacturer',
        selectedIndustry: 'Lighting',
        selectedProduct: '',
        selectedLocation: '',
        companyName: '',
        businessDescription: '',
        targetProducts: 'LED driver, LED lighting',
        targetParentIndustries: 'Lighting, Electronics',
    });
    const [sampleResult, setSampleResult] = useState(null);

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            if (filters.status) params.status = filters.status;
            if (filters.excluded) params.excluded = filters.excluded;
            if (filters.searchKeyword) params.searchKeyword = filters.searchKeyword;
            const data = await dataExtractorApi.listLeadRelevance(params);
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load relevance queue');
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
            const out = await dataExtractorApi.evaluateLeadRelevanceSample({
                searchKeyword: sample.searchKeyword,
                selectedIndustry: sample.selectedIndustry,
                selectedProduct: sample.selectedProduct,
                selectedLocation: sample.selectedLocation,
                record: {
                    companyName: sample.companyName,
                    businessDescription: sample.businessDescription,
                },
                targetMarket: {
                    targetProducts: String(sample.targetProducts || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    targetParentIndustries: String(sample.targetParentIndustries || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                },
            });
            setSampleResult(out);
            toast.success('Sample scored');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Sample scoring failed');
        } finally {
            setBusy('');
        }
    };

    const openHistory = async (id) => {
        if (!vis.canAudit) return;
        try {
            setHistory(await dataExtractorApi.getLeadRelevanceHistory(id));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load history');
        }
    };

    if (!vis.canView) {
        return <p style={{ color: '#64748b' }}>You do not have permission to view lead relevance.</p>;
    }

    return (
        <div style={{ maxWidth: 1100 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Lead Relevance / Target-Market Fit</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Scores classified companies against search intent and company-configurable target market. Irrelevant records move to Excluded / Low Relevance — never deleted automatically.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <select style={field} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    <option value="">All statuses</option>
                    {['RELEVANT', 'POSSIBLY_RELEVANT', 'IRRELEVANT', 'MANUAL_REVIEW'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select style={field} value={filters.excluded} onChange={(e) => setFilters((f) => ({ ...f, excluded: e.target.value }))}>
                    <option value="">All queues</option>
                    <option value="false">Active</option>
                    <option value="true">Excluded / Low Relevance</option>
                </select>
                <input style={field} placeholder="Search keyword filter" value={filters.searchKeyword} onChange={(e) => setFilters((f) => ({ ...f, searchKeyword: e.target.value }))} />
                <button type="button" style={btn} onClick={load}>Refresh</button>
            </div>

            {vis.canRun ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16, background: '#f8fafc' }}>
                    <h3 style={{ marginTop: 0, fontSize: 14 }}>Score sample (search intent)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input style={field} placeholder="Search keyword" value={sample.searchKeyword} onChange={(e) => setSample((s) => ({ ...s, searchKeyword: e.target.value }))} />
                        <input style={field} placeholder="Selected industry" value={sample.selectedIndustry} onChange={(e) => setSample((s) => ({ ...s, selectedIndustry: e.target.value }))} />
                        <input style={field} placeholder="Selected product" value={sample.selectedProduct} onChange={(e) => setSample((s) => ({ ...s, selectedProduct: e.target.value }))} />
                        <input style={field} placeholder="Selected location" value={sample.selectedLocation} onChange={(e) => setSample((s) => ({ ...s, selectedLocation: e.target.value }))} />
                        <input style={field} placeholder="Company name" value={sample.companyName} onChange={(e) => setSample((s) => ({ ...s, companyName: e.target.value }))} />
                        <input style={field} placeholder="Target products (comma)" value={sample.targetProducts} onChange={(e) => setSample((s) => ({ ...s, targetProducts: e.target.value }))} />
                        <textarea style={{ ...field, gridColumn: '1 / -1', minHeight: 70 }} placeholder="Business description" value={sample.businessDescription} onChange={(e) => setSample((s) => ({ ...s, businessDescription: e.target.value }))} />
                    </div>
                    <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy} onClick={runSample}>Score relevance</button>
                    {sampleResult ? (
                        <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6, fontSize: 11 }}>
                            {JSON.stringify(sampleResult, null, 2)}
                        </pre>
                    ) : null}
                </div>
            ) : null}

            {(items || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No relevance records yet.</p> : null}
            {(items || []).map((row) => (
                <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: row.excluded ? '#fff7ed' : '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                            <strong>{row.companyName || 'Record'}</strong>
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                                {row.status} · score {row.relevanceScore}
                                {row.excluded ? ' · EXCLUDED' : ''}
                                {row.searchKeyword ? ` · search: ${row.searchKeyword}` : ''}
                            </span>
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{row.explanation}</div>
                            {row.exclusionReason ? <div style={{ fontSize: 12, color: '#b45309' }}>Exclusion: {row.exclusionReason}</div> : null}
                        </div>
                        <button type="button" style={btn} onClick={() => setSelectedId(selectedId === row._id ? null : row._id)}>
                            {selectedId === row._id ? 'Hide' : 'Open'}
                        </button>
                    </div>
                    {selectedId === row._id ? (
                        <div style={{ marginTop: 10, fontSize: 12 }}>
                            <div><strong>Matching products:</strong> {(row.matchingProducts || []).join(', ') || '—'}</div>
                            <div><strong>Conflicting keywords:</strong> {(row.conflictingKeywords || []).join(', ') || '—'}</div>
                            <div><strong>Industry:</strong> {row.primaryIndustry || `${row.parentIndustry || ''} ${row.subIndustry || ''}`.trim() || '—'}</div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                {vis.canExclude && !row.excluded ? (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Excluded', () => dataExtractorApi.excludeLeadRelevance(row._id, { reason: 'Manual exclude' }))}>Move to Excluded</button>
                                ) : null}
                                {vis.canRestore && row.excluded ? (
                                    <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Restored', () => dataExtractorApi.restoreLeadRelevance(row._id, { reason: 'Manual restore' }))}>Restore</button>
                                ) : null}
                                {vis.canAudit ? (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => openHistory(row._id)}>View audit</button>
                                ) : null}
                            </div>
                            {history?._id === row._id ? (
                                <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6 }}>{JSON.stringify(history.history || [], null, 2)}</pre>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    );
}
