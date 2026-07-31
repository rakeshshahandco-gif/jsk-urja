import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';

const field = { display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', boxSizing: 'border-box' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 };
const btn = { padding: '8px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };

const DEFAULT_CUSTOMER_TYPES = [
    'Manufacturer', 'OEM', 'ODM', 'Dealer', 'Distributor', 'Retailer', 'Exporter', 'Importer',
    'System Integrator', 'Architect', 'Contractor', 'Consultant', 'Government', 'Educational', 'Service Provider', 'Others',
];

function listToText(list = []) {
    return (list || []).join(', ');
}

function textToList(text) {
    return String(text || '')
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
}

function blankIndustry() {
    return {
        parentIndustry: '',
        subIndustry: '',
        keywords: '',
        negativeKeywords: '',
        productKeywords: '',
        websiteKeywords: '',
        isActive: true,
        notes: '',
    };
}

function blankCustomerType(name = '') {
    return {
        name,
        keywords: name ? name.toLowerCase() : '',
        negativeKeywords: '',
        isActive: true,
        notes: '',
    };
}

function blankOpportunity() {
    return {
        parentIndustry: '',
        subIndustry: '',
        customerType: '',
        isActive: true,
        notes: '',
        opportunityItems: [{
            productName: '',
            priority: 'medium',
            salesStrategy: '',
            positiveSignals: '',
            negativeSignals: '',
            recommendedFollowUp: '',
            recommendedSalesperson: '',
        }],
    };
}

export default function DataExtractorAiLeadIntelligencePage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        enabled: false,
        classificationMode: 'rule_based',
        minimumConfidence: 45,
        autoApplyOnSearch: true,
        requireManualReviewBelowConfidence: 60,
        targetMarket: {
            relevantMinScore: 70,
            possiblyRelevantMinScore: 45,
            targetParentIndustries: '',
            targetSubIndustries: '',
            targetProducts: '',
            targetLocations: '',
            exclusionKeywords: '',
            negativeKeywords: '',
        },
    });
    const [industries, setIndustries] = useState([blankIndustry()]);
    const [customerTypes, setCustomerTypes] = useState(DEFAULT_CUSTOMER_TYPES.map((name) => blankCustomerType(name)));
    const [opportunityMaps, setOpportunityMaps] = useState([blankOpportunity()]);
    const [sample, setSample] = useState({
        companyName: '',
        website: '',
        businessDescription: '',
        keywords: '',
        productCategories: '',
        sourceUrl: '',
    });
    const [sampleResult, setSampleResult] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const data = await dataExtractorApi.getAiLeadIntelligenceOverview();
            if (data?.settings) {
                const tm = data.settings.targetMarket || {};
                setSettings({
                    ...settings,
                    ...data.settings,
                    targetMarket: {
                        relevantMinScore: tm.relevantMinScore ?? 70,
                        possiblyRelevantMinScore: tm.possiblyRelevantMinScore ?? 45,
                        targetParentIndustries: listToText(tm.targetParentIndustries),
                        targetSubIndustries: listToText(tm.targetSubIndustries),
                        targetProducts: listToText(tm.targetProducts),
                        targetLocations: listToText(tm.targetLocations),
                        exclusionKeywords: listToText(tm.exclusionKeywords),
                        negativeKeywords: listToText(tm.negativeKeywords),
                    },
                });
            }
            if (Array.isArray(data?.industries) && data.industries.length) {
                setIndustries(data.industries.map((row) => ({
                    ...row,
                    keywords: listToText(row.keywords),
                    negativeKeywords: listToText(row.negativeKeywords),
                    productKeywords: listToText(row.productKeywords),
                    websiteKeywords: listToText(row.websiteKeywords),
                })));
            }
            if (Array.isArray(data?.customerTypes) && data.customerTypes.length) {
                setCustomerTypes(data.customerTypes.map((row) => ({
                    ...row,
                    keywords: listToText(row.keywords),
                    negativeKeywords: listToText(row.negativeKeywords),
                })));
            } else {
                setCustomerTypes(DEFAULT_CUSTOMER_TYPES.map((name) => blankCustomerType(name)));
            }
            if (Array.isArray(data?.opportunityMaps) && data.opportunityMaps.length) {
                setOpportunityMaps(data.opportunityMaps.map((row) => ({
                    ...row,
                    opportunityItems: (row.opportunityItems || []).map((item) => ({
                        ...item,
                        positiveSignals: listToText(item.positiveSignals),
                        negativeSignals: listToText(item.negativeSignals),
                    })),
                })));
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load AI Lead Intelligence');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const onSave = async () => {
        setSaving(true);
        try {
            await dataExtractorApi.saveAiLeadIntelligenceOverview({
                settings: {
                    ...settings,
                    targetMarket: {
                        ...settings.targetMarket,
                        targetParentIndustries: textToList(settings.targetMarket?.targetParentIndustries),
                        targetSubIndustries: textToList(settings.targetMarket?.targetSubIndustries),
                        targetProducts: textToList(settings.targetMarket?.targetProducts),
                        targetLocations: textToList(settings.targetMarket?.targetLocations),
                        exclusionKeywords: textToList(settings.targetMarket?.exclusionKeywords),
                        negativeKeywords: textToList(settings.targetMarket?.negativeKeywords),
                    },
                },
                industries: industries.map((row) => ({
                    ...row,
                    keywords: textToList(row.keywords),
                    negativeKeywords: textToList(row.negativeKeywords),
                    productKeywords: textToList(row.productKeywords),
                    websiteKeywords: textToList(row.websiteKeywords),
                })),
                customerTypes: customerTypes.map((row) => ({
                    ...row,
                    keywords: textToList(row.keywords),
                    negativeKeywords: textToList(row.negativeKeywords),
                })),
                opportunityMaps: opportunityMaps.map((row) => ({
                    ...row,
                    opportunityItems: (row.opportunityItems || []).map((item) => ({
                        ...item,
                        positiveSignals: textToList(item.positiveSignals),
                        negativeSignals: textToList(item.negativeSignals),
                    })),
                })),
            });
            toast.success('AI Lead Intelligence saved');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const onClassifySample = async () => {
        try {
            const result = await dataExtractorApi.classifyAiLeadSample({
                settings,
                record: {
                    companyName: sample.companyName,
                    website: sample.website,
                    businessDescription: sample.businessDescription,
                    keywords: textToList(sample.keywords),
                    productCategories: textToList(sample.productCategories),
                    sourceUrl: sample.sourceUrl,
                },
            });
            setSampleResult(result);
            toast.success('Sample classified');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Classification failed');
        }
    };

    if (loading) return <div>Loading AI Lead Intelligence…</div>;

    return (
        <div style={{ maxWidth: 1100 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>AI Lead Intelligence</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Generic multi-industry foundation. Configure Industry Master, Customer Type Master, and Product Opportunity Mapping per company. No product catalog is hardcoded.
            </p>

            <div style={card}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>Classification Settings</h3>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>
                    <input type="checkbox" checked={!!settings.enabled} onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} />
                    {' '}Enable AI Lead Intelligence for this company
                </label>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>
                    Mode
                    <select value={settings.classificationMode} onChange={(e) => setSettings((s) => ({ ...s, classificationMode: e.target.value }))} style={field}>
                        <option value="rule_based">Rule-based</option>
                        <option value="ai">AI enabled</option>
                        <option value="hybrid">AI + Rule hybrid</option>
                        <option value="manual_review">Manual Review</option>
                    </select>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ fontSize: 13 }}>
                        Minimum confidence
                        <input type="number" min={0} max={100} value={settings.minimumConfidence} onChange={(e) => setSettings((s) => ({ ...s, minimumConfidence: Number(e.target.value) }))} style={field} />
                    </label>
                    <label style={{ fontSize: 13 }}>
                        Manual review below confidence
                        <input type="number" min={0} max={100} value={settings.requireManualReviewBelowConfidence} onChange={(e) => setSettings((s) => ({ ...s, requireManualReviewBelowConfidence: Number(e.target.value) }))} style={field} />
                    </label>
                </div>
                <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
                    <input type="checkbox" checked={!!settings.autoApplyOnSearch} onChange={(e) => setSettings((s) => ({ ...s, autoApplyOnSearch: e.target.checked }))} />
                    {' '}Auto-apply on search when AI is enabled
                </label>
            </div>

            <div style={card}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>Target Market Fit (Phase 7)</h3>
                <p style={{ fontSize: 12, color: '#64748b' }}>Company-configurable relevance targets. Used by Lead Relevance scoring. No hardcoded product catalog.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ fontSize: 13 }}>Relevant min score
                        <input style={field} type="number" value={settings.targetMarket?.relevantMinScore ?? 70} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, relevantMinScore: Number(e.target.value) } }))} />
                    </label>
                    <label style={{ fontSize: 13 }}>Possibly-relevant min score
                        <input style={field} type="number" value={settings.targetMarket?.possiblyRelevantMinScore ?? 45} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, possiblyRelevantMinScore: Number(e.target.value) } }))} />
                    </label>
                    <label style={{ fontSize: 13 }}>Target parent industries
                        <input style={field} value={settings.targetMarket?.targetParentIndustries || ''} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, targetParentIndustries: e.target.value } }))} />
                    </label>
                    <label style={{ fontSize: 13 }}>Target sub-industries
                        <input style={field} value={settings.targetMarket?.targetSubIndustries || ''} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, targetSubIndustries: e.target.value } }))} />
                    </label>
                    <label style={{ fontSize: 13 }}>Target products / capabilities
                        <input style={field} value={settings.targetMarket?.targetProducts || ''} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, targetProducts: e.target.value } }))} />
                    </label>
                    <label style={{ fontSize: 13 }}>Target locations
                        <input style={field} value={settings.targetMarket?.targetLocations || ''} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, targetLocations: e.target.value } }))} />
                    </label>
                    <label style={{ fontSize: 13 }}>Negative keywords
                        <input style={field} value={settings.targetMarket?.negativeKeywords || ''} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, negativeKeywords: e.target.value } }))} />
                    </label>
                    <label style={{ fontSize: 13 }}>Exclusion keywords
                        <input style={field} value={settings.targetMarket?.exclusionKeywords || ''} onChange={(e) => setSettings((s) => ({ ...s, targetMarket: { ...s.targetMarket, exclusionKeywords: e.target.value } }))} />
                    </label>
                </div>
            </div>

            <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Industry Master</h3>
                    <button type="button" style={btn} onClick={() => setIndustries((rows) => [...rows, blankIndustry()])}>Add industry</button>
                </div>
                {(industries || []).map((row, idx) => (
                    <div key={idx} style={{ borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <label style={{ fontSize: 13 }}>Parent Industry<input value={row.parentIndustry} onChange={(e) => setIndustries((rows) => rows.map((r, i) => i === idx ? { ...r, parentIndustry: e.target.value } : r))} style={field} /></label>
                            <label style={{ fontSize: 13 }}>Sub Industry<input value={row.subIndustry} onChange={(e) => setIndustries((rows) => rows.map((r, i) => i === idx ? { ...r, subIndustry: e.target.value } : r))} style={field} /></label>
                            <label style={{ fontSize: 13 }}>Keywords<textarea value={row.keywords} onChange={(e) => setIndustries((rows) => rows.map((r, i) => i === idx ? { ...r, keywords: e.target.value } : r))} style={{ ...field, minHeight: 60 }} /></label>
                            <label style={{ fontSize: 13 }}>Negative Keywords<textarea value={row.negativeKeywords} onChange={(e) => setIndustries((rows) => rows.map((r, i) => i === idx ? { ...r, negativeKeywords: e.target.value } : r))} style={{ ...field, minHeight: 60 }} /></label>
                            <label style={{ fontSize: 13 }}>Product Keywords<textarea value={row.productKeywords} onChange={(e) => setIndustries((rows) => rows.map((r, i) => i === idx ? { ...r, productKeywords: e.target.value } : r))} style={{ ...field, minHeight: 60 }} /></label>
                            <label style={{ fontSize: 13 }}>Website Keywords<textarea value={row.websiteKeywords} onChange={(e) => setIndustries((rows) => rows.map((r, i) => i === idx ? { ...r, websiteKeywords: e.target.value } : r))} style={{ ...field, minHeight: 60 }} /></label>
                        </div>
                        <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
                            <input type="checkbox" checked={row.isActive !== false} onChange={(e) => setIndustries((rows) => rows.map((r, i) => i === idx ? { ...r, isActive: e.target.checked } : r))} />
                            {' '}Active
                        </label>
                    </div>
                ))}
            </div>

            <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Customer Type Master</h3>
                    <button type="button" style={btn} onClick={() => setCustomerTypes((rows) => [...rows, blankCustomerType()])}>Add type</button>
                </div>
                {(customerTypes || []).map((row, idx) => (
                    <div key={idx} style={{ borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12 }}>
                        <label style={{ fontSize: 13 }}>Name<input value={row.name} onChange={(e) => setCustomerTypes((rows) => rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} style={field} /></label>
                        <label style={{ fontSize: 13 }}>Keywords<input value={row.keywords} onChange={(e) => setCustomerTypes((rows) => rows.map((r, i) => i === idx ? { ...r, keywords: e.target.value } : r))} style={field} /></label>
                        <label style={{ fontSize: 13 }}>Negative Keywords<input value={row.negativeKeywords} onChange={(e) => setCustomerTypes((rows) => rows.map((r, i) => i === idx ? { ...r, negativeKeywords: e.target.value } : r))} style={field} /></label>
                        <label style={{ fontSize: 13, alignSelf: 'end' }}>
                            <input type="checkbox" checked={row.isActive !== false} onChange={(e) => setCustomerTypes((rows) => rows.map((r, i) => i === idx ? { ...r, isActive: e.target.checked } : r))} /> Active
                        </label>
                    </div>
                ))}
            </div>

            <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Product Opportunity Mapping</h3>
                    <button type="button" style={btn} onClick={() => setOpportunityMaps((rows) => [...rows, blankOpportunity()])}>Add mapping</button>
                </div>
                {(opportunityMaps || []).map((row, idx) => (
                    <div key={idx} style={{ borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <label style={{ fontSize: 13 }}>Industry<input value={row.parentIndustry} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, parentIndustry: e.target.value } : r))} style={field} /></label>
                            <label style={{ fontSize: 13 }}>Sub Industry<input value={row.subIndustry} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, subIndustry: e.target.value } : r))} style={field} /></label>
                            <label style={{ fontSize: 13 }}>Customer Type<input value={row.customerType} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, customerType: e.target.value } : r))} style={field} /></label>
                        </div>
                        {(row.opportunityItems || []).map((item, itemIdx) => (
                            <div key={itemIdx} style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <label style={{ fontSize: 13 }}>Relevant Product<input value={item.productName} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: r.opportunityItems.map((it, j) => j === itemIdx ? { ...it, productName: e.target.value } : it) } : r))} style={field} /></label>
                                    <label style={{ fontSize: 13 }}>Priority
                                        <select value={item.priority || 'medium'} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: r.opportunityItems.map((it, j) => j === itemIdx ? { ...it, priority: e.target.value } : it) } : r))} style={field}>
                                            <option value="high">High</option>
                                            <option value="medium">Medium</option>
                                            <option value="low">Low</option>
                                        </select>
                                    </label>
                                    <label style={{ fontSize: 13 }}>Sales Strategy<textarea value={item.salesStrategy} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: r.opportunityItems.map((it, j) => j === itemIdx ? { ...it, salesStrategy: e.target.value } : it) } : r))} style={{ ...field, minHeight: 60 }} /></label>
                                    <label style={{ fontSize: 13 }}>Recommended Follow-up<textarea value={item.recommendedFollowUp} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: r.opportunityItems.map((it, j) => j === itemIdx ? { ...it, recommendedFollowUp: e.target.value } : it) } : r))} style={{ ...field, minHeight: 60 }} /></label>
                                    <label style={{ fontSize: 13 }}>Positive Signals<textarea value={item.positiveSignals} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: r.opportunityItems.map((it, j) => j === itemIdx ? { ...it, positiveSignals: e.target.value } : it) } : r))} style={{ ...field, minHeight: 60 }} /></label>
                                    <label style={{ fontSize: 13 }}>Negative Signals<textarea value={item.negativeSignals} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: r.opportunityItems.map((it, j) => j === itemIdx ? { ...it, negativeSignals: e.target.value } : it) } : r))} style={{ ...field, minHeight: 60 }} /></label>
                                    <label style={{ fontSize: 13 }}>Recommended Salesperson (optional)<input value={item.recommendedSalesperson} onChange={(e) => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: r.opportunityItems.map((it, j) => j === itemIdx ? { ...it, recommendedSalesperson: e.target.value } : it) } : r))} style={field} /></label>
                                </div>
                            </div>
                        ))}
                        <button type="button" style={{ ...btn, marginTop: 10 }} onClick={() => setOpportunityMaps((rows) => rows.map((r, i) => i === idx ? { ...r, opportunityItems: [...(r.opportunityItems || []), { productName: '', priority: 'medium', salesStrategy: '', positiveSignals: '', negativeSignals: '', recommendedFollowUp: '', recommendedSalesperson: '' }] } : r))}>Add product opportunity</button>
                    </div>
                ))}
            </div>

            <div style={card}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>Sample Classification</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ fontSize: 13 }}>Company Name<input value={sample.companyName} onChange={(e) => setSample((s) => ({ ...s, companyName: e.target.value }))} style={field} /></label>
                    <label style={{ fontSize: 13 }}>Website<input value={sample.website} onChange={(e) => setSample((s) => ({ ...s, website: e.target.value }))} style={field} /></label>
                    <label style={{ fontSize: 13 }}>Keywords<input value={sample.keywords} onChange={(e) => setSample((s) => ({ ...s, keywords: e.target.value }))} style={field} /></label>
                    <label style={{ fontSize: 13 }}>Product Categories<input value={sample.productCategories} onChange={(e) => setSample((s) => ({ ...s, productCategories: e.target.value }))} style={field} /></label>
                    <label style={{ fontSize: 13, gridColumn: '1 / -1' }}>Description<textarea value={sample.businessDescription} onChange={(e) => setSample((s) => ({ ...s, businessDescription: e.target.value }))} style={{ ...field, minHeight: 80 }} /></label>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button type="button" style={btn} onClick={onClassifySample}>Classify Sample</button>
                    <button type="button" style={btnPrimary} disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save Masters & Settings'}</button>
                </div>
                {sampleResult ? (
                    <pre style={{ marginTop: 12, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
{JSON.stringify(sampleResult, null, 2)}
                    </pre>
                ) : null}
            </div>
        </div>
    );
}
