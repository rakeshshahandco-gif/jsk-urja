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

function badge(priority) {
    const p = String(priority || '');
    const bg = p.includes('High') ? '#dcfce7' : p.includes('Low') || p.includes('Long') ? '#f1f5f9' : '#e0f2fe';
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, fontSize: 11 };
}

export default function DataExtractorRecommendationsPage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.product_recommendation.view'),
        canRun: can(hasPermission, 'data_extractor.product_recommendation.run'),
        canOverride: can(hasPermission, 'data_extractor.product_recommendation.override'),
        canLock: can(hasPermission, 'data_extractor.product_recommendation.lock'),
        canHistory: can(hasPermission, 'data_extractor.product_recommendation.history'),
        canManage: can(hasPermission, 'data_extractor.product_recommendation.manage'),
    }), [hasPermission]);

    const [items, setItems] = useState([]);
    const [products, setProducts] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [busy, setBusy] = useState('');
    const [filters, setFilters] = useState({ status: '', parentIndustry: '', customerType: '', product: '', priority: '', minScore: '' });
    const [productForm, setProductForm] = useState({
        productName: '', productCategory: '', parentIndustry: '', subIndustry: '',
        keywords: '', negativeKeywords: '', positiveSignals: '', applications: '',
        applicableCustomerTypes: '', brochureUrl: '', catalogUrl: '', datasheetUrl: '',
        priority: 'medium', salesNotes: '', crossSellWith: '', upsellOf: '', bundleWith: '',
    });
    const [sample, setSample] = useState({
        companyName: '', businessDescription: '', customerType: 'Manufacturer',
        parentIndustry: 'Lighting', subIndustry: 'LED Lighting', searchKeyword: 'LED Driver Manufacturer',
        mode: 'rule_based',
    });
    const [sampleResult, setSampleResult] = useState(null);

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
            const data = await dataExtractorApi.listProductRecommendations(params);
            setItems(data?.results || []);
            if (vis.canManage || vis.canRun) {
                const prods = await dataExtractorApi.listProductMasters({});
                setProducts(prods?.results || []);
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load recommendations');
        }
    }, [filters, vis.canView, vis.canManage, vis.canRun]);

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

    const saveProduct = async () => {
        if (!vis.canManage) return;
        await runAction('Product saved', async () => {
            await dataExtractorApi.saveProductMasters({
                products: [{
                    ...productForm,
                    keywords: String(productForm.keywords || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    negativeKeywords: String(productForm.negativeKeywords || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    positiveSignals: String(productForm.positiveSignals || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    applications: String(productForm.applications || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    applicableCustomerTypes: String(productForm.applicableCustomerTypes || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    crossSellWith: String(productForm.crossSellWith || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    upsellOf: String(productForm.upsellOf || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    bundleWith: String(productForm.bundleWith || '').split(/[,]+/).map((x) => x.trim()).filter(Boolean),
                    isActive: true,
                }],
            });
        });
    };

    const runSample = async () => {
        if (!vis.canRun) return;
        setBusy('sample');
        try {
            const out = await dataExtractorApi.recommendProductSample({
                mode: sample.mode,
                searchKeyword: sample.searchKeyword,
                customerType: sample.customerType,
                record: {
                    companyName: sample.companyName,
                    businessDescription: sample.businessDescription,
                    keywords: sample.businessDescription.split(/\s+/).slice(0, 8),
                },
                classification: {
                    status: 'CLASSIFIED',
                    parentIndustry: sample.parentIndustry,
                    subIndustry: sample.subIndustry,
                    primaryIndustry: `${sample.parentIndustry} / ${sample.subIndustry}`,
                    customerType: sample.customerType,
                    confidenceScore: 85,
                    productSignals: [],
                    evidenceSnippets: [sample.businessDescription],
                },
                relevance: { relevanceScore: 80, matchingProducts: [], evidenceSnippets: [] },
                products,
            });
            setSampleResult(out);
            toast.success('Sample recommended');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Sample failed');
        } finally {
            setBusy('');
        }
    };

    if (!vis.canView) {
        return <p style={{ color: '#64748b' }}>You do not have permission to view product recommendations.</p>;
    }

    const selected = items.find((x) => x._id === selectedId);

    return (
        <div style={{ maxWidth: 1100 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Product Opportunity Recommendations</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Recommend configurable company products to classified, relevant prospects. No hardcoded catalog.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <select style={field} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    <option value="">All statuses</option>
                    {['RECOMMENDED', 'ACCEPTED', 'REJECTED', 'MANUAL_REVIEW', 'LOW_CONFIDENCE', 'FAILED'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input style={field} placeholder="Industry" value={filters.parentIndustry} onChange={(e) => setFilters((f) => ({ ...f, parentIndustry: e.target.value }))} />
                <input style={field} placeholder="Customer type" value={filters.customerType} onChange={(e) => setFilters((f) => ({ ...f, customerType: e.target.value }))} />
                <input style={field} placeholder="Product" value={filters.product} onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))} />
                <input style={field} placeholder="Priority" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} />
                <input style={field} type="number" placeholder="Min score" value={filters.minScore} onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))} />
                <button type="button" style={btn} onClick={load}>Refresh</button>
            </div>

            {vis.canManage ? (
                <div style={{ ...card, background: '#f8fafc' }}>
                    <h3 style={{ marginTop: 0, fontSize: 14 }}>Product Master</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {['productName', 'productCategory', 'parentIndustry', 'subIndustry', 'keywords', 'negativeKeywords', 'positiveSignals', 'applications', 'applicableCustomerTypes', 'brochureUrl', 'catalogUrl', 'datasheetUrl', 'crossSellWith', 'upsellOf', 'bundleWith', 'salesNotes'].map((k) => (
                            <input key={k} style={field} placeholder={k} value={productForm[k] || ''} onChange={(e) => setProductForm((s) => ({ ...s, [k]: e.target.value }))} />
                        ))}
                    </div>
                    <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy} onClick={saveProduct}>Save product</button>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>{products.length} active/configured products</div>
                </div>
            ) : null}

            {vis.canRun ? (
                <div style={{ ...card, background: '#f8fafc' }}>
                    <h3 style={{ marginTop: 0, fontSize: 14 }}>Sample recommendation</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input style={field} placeholder="Company name" value={sample.companyName} onChange={(e) => setSample((s) => ({ ...s, companyName: e.target.value }))} />
                        <input style={field} placeholder="Search keyword" value={sample.searchKeyword} onChange={(e) => setSample((s) => ({ ...s, searchKeyword: e.target.value }))} />
                        <input style={field} placeholder="Parent industry" value={sample.parentIndustry} onChange={(e) => setSample((s) => ({ ...s, parentIndustry: e.target.value }))} />
                        <input style={field} placeholder="Customer type" value={sample.customerType} onChange={(e) => setSample((s) => ({ ...s, customerType: e.target.value }))} />
                        <select style={field} value={sample.mode} onChange={(e) => setSample((s) => ({ ...s, mode: e.target.value }))}>
                            <option value="rule_based">rule_based</option>
                            <option value="ai">ai</option>
                            <option value="hybrid">hybrid</option>
                            <option value="manual_review">manual_review</option>
                        </select>
                        <textarea style={{ ...field, gridColumn: '1 / -1', minHeight: 60 }} placeholder="Business description" value={sample.businessDescription} onChange={(e) => setSample((s) => ({ ...s, businessDescription: e.target.value }))} />
                    </div>
                    <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy || !products.length} onClick={runSample}>Recommend</button>
                    {sampleResult ? <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6, fontSize: 11 }}>{JSON.stringify(sampleResult, null, 2)}</pre> : null}
                </div>
            ) : null}

            {(items || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No recommendations yet.</p> : null}
            {(items || []).map((row) => (
                <div key={row._id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                            <strong>{row.companyName || 'Prospect'}</strong>
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                                {row.status} · score {row.opportunityScore} · conf {row.confidence} · {row.engineUsed}
                                {row.locked ? ' · LOCKED' : ''}
                                {row.fallbackUsed ? ' · fallback' : ''}
                            </span>
                            <div style={{ marginTop: 6 }}>
                                <span style={badge(row.primaryRecommendation?.priority)}>{row.primaryRecommendation?.priority || '—'}</span>
                                <span style={{ marginLeft: 8, fontSize: 13 }}>{row.primaryRecommendation?.productName || 'No primary product'}</span>
                            </div>
                        </div>
                        <button type="button" style={btn} onClick={() => setSelectedId(selectedId === row._id ? null : row._id)}>
                            {selectedId === row._id ? 'Hide' : 'Open detail'}
                        </button>
                    </div>
                    {selectedId === row._id ? (
                        <div style={{ marginTop: 10, fontSize: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <h4 style={{ margin: '0 0 6px' }}>Primary product</h4>
                                    <div><strong>Reason:</strong> {row.primaryRecommendation?.reason || '—'}</div>
                                    <div><strong>Strategy:</strong> {row.recommendedSalesStrategy || row.primaryRecommendation?.salesStrategy || '—'}</div>
                                    <div><strong>Follow-up:</strong> {row.recommendedFollowUpAction || '—'}</div>
                                    <div style={{ marginTop: 6 }}>
                                        {row.primaryRecommendation?.brochureUrl ? <a href={row.primaryRecommendation.brochureUrl} target="_blank" rel="noreferrer">Brochure</a> : null}
                                        {' '}
                                        {row.primaryRecommendation?.catalogUrl ? <a href={row.primaryRecommendation.catalogUrl} target="_blank" rel="noreferrer">Catalog</a> : null}
                                        {' '}
                                        {row.primaryRecommendation?.datasheetUrl ? <a href={row.primaryRecommendation.datasheetUrl} target="_blank" rel="noreferrer">Datasheet</a> : null}
                                    </div>
                                    <div><strong>Matched keywords:</strong> {(row.primaryRecommendation?.matchingKeywords || []).join(', ') || '—'}</div>
                                    <div><strong>Evidence:</strong> {(row.primaryRecommendation?.evidence || []).join(' | ') || '—'}</div>
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 6px' }}>Alternatives / cross-sell / upsell</h4>
                                    <div><strong>Secondary:</strong> {(row.secondaryRecommendations || []).map((x) => x.productName).join(', ') || '—'}</div>
                                    <div><strong>Alternatives:</strong> {(row.alternativeProducts || []).map((x) => x.productName).join(', ') || '—'}</div>
                                    <div><strong>Cross-sell:</strong> {(row.crossSellOpportunities || []).map((x) => x.productName).join(', ') || '—'}</div>
                                    <div><strong>Upsell:</strong> {(row.upsellOpportunities || []).map((x) => x.productName).join(', ') || '—'}</div>
                                    <div><strong>Industry:</strong> {row.parentIndustry} / {row.subIndustry}</div>
                                    <div><strong>Customer type:</strong> {row.customerType || '—'}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                {vis.canOverride ? (
                                    <>
                                        <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Accepted', () => dataExtractorApi.overrideProductRecommendation(row._id, { action: 'accept' }))}>Accept</button>
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Rejected', () => dataExtractorApi.overrideProductRecommendation(row._id, { action: 'reject', reason: 'Not a fit' }))}>Reject</button>
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => {
                                            const productName = window.prompt('Product name', row.primaryRecommendation?.productName || '');
                                            const reason = window.prompt('Reason', 'Manual override') || 'Manual override';
                                            if (!productName) return;
                                            return runAction('Overridden', () => dataExtractorApi.overrideProductRecommendation(row._id, { action: 'override', productName, reason }));
                                        }}>Override product</button>
                                    </>
                                ) : null}
                                {vis.canLock ? (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(row.locked ? 'Unlocked' : 'Locked', () => dataExtractorApi.lockProductRecommendation(row._id, { action: row.locked ? 'unlock' : 'lock' }))}>{row.locked ? 'Unlock' : 'Lock'}</button>
                                ) : null}
                                {vis.canHistory ? (
                                    <button type="button" style={btn} disabled={!!busy} onClick={async () => {
                                        try { setHistory(await dataExtractorApi.getProductRecommendationHistory(row._id)); }
                                        catch (e) { toast.error(e?.response?.data?.message || 'History failed'); }
                                    }}>History</button>
                                ) : null}
                            </div>
                            {history?._id === row._id ? (
                                <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6 }}>{JSON.stringify(history.history || [], null, 2)}</pre>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ))}
            {!selected ? null : null}
        </div>
    );
}
