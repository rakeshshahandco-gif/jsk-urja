import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const fieldStyle = { display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' };
const labelStyle = { display: 'block', marginBottom: 12, fontSize: 13, fontWeight: 500 };

export default function DataExtractorKeywordSearchPage() {
    const { selectedFY } = useFinancialYear();
    const navigate = useNavigate();
    const [sources, setSources] = useState([]);
    const [providerStatus, setProviderStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [form, setForm] = useState({
        keyword: '',
        city: '',
        state: '',
        country: 'India',
        sourceId: 'web_search',
        maxResults: 10,
    });

    useEffect(() => {
        Promise.all([
            dataExtractorApi.listSources(),
            dataExtractorApi.getSettings().catch(() => null),
        ]).then(([srcList, settings]) => {
            setSources(srcList || []);
            setProviderStatus(settings?.providerStatus || null);
        }).catch(() => {});
    }, []);

    const onChange = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const activeSources = sources.filter((s) => !s.comingSoon && !s.disabled);
    const comingSoon = sources.filter((s) => s.comingSoon || s.disabled);
    const selected = sources.find((s) => s.id === form.sourceId);
    const googleHints = providerStatus?.googleApiKeys || {};
    const selectedConfigured = selected?.configured
        ?? (form.sourceId === 'google_business'
            ? providerStatus?.googleBusiness?.configured
            : providerStatus?.configured);

    const onTestAdapter = async () => {
        setTesting(true);
        try {
            const result = form.sourceId === 'web_search'
                ? await dataExtractorApi.testWebSearch()
                : await dataExtractorApi.testAdapter(form.sourceId);
            if (result?.ok) toast.success(result.message || 'Connection OK');
            else toast.error(result?.message || 'Test failed', { duration: 8000 });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Test failed');
        } finally {
            setTesting(false);
        }
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!form.keyword.trim()) {
            toast.error('Enter keyword / product');
            return;
        }
        if (providerStatus && !providerStatus.configured && ['web_search', 'google_business', 'social_public'].includes(form.sourceId)) {
            toast.error('Configure Google API keys in Settings first (CSE key + cx).', { duration: 8000 });
            return;
        }
        setLoading(true);
        try {
            const result = await dataExtractorApi.runKeywordSearch({
                ...form,
                maxResults: Number(form.maxResults) || 10,
                financialYear: selectedFY,
            });
            const count = result?.previewRecords?.length || result?.job?.recordCount || 0;
            const errors = result?.errors || [];
            if (count === 0 && errors.length) {
                toast.error(errors[0], { duration: 8000 });
            } else {
                toast.success(`Found ${count} result(s) — review preview before saving`);
            }
            if (result?.job?._id) {
                navigate(PATHS.DATA_EXTRACTOR.PREVIEW(result.job._id));
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 720 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Keyword Search</h2>

            {providerStatus && !providerStatus.configured && (
                <div style={{ background: '#fef2f2', border: '2px solid #f87171', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                    <strong style={{ color: '#b91c1c' }}>Google is not configured — search will return 0 results</strong>
                    <p style={{ margin: '8px 0', color: '#7f1d1d', lineHeight: 1.6 }}>
                        No API keys are saved for this company
                        {' '}(CSE key: {googleHints.cseApiKeySet ? 'yes' : 'no'}, cx: {googleHints.cseCxSet ? 'yes' : 'no'}).
                        Login or restart does not fix this — paste keys in Settings.
                    </p>
                    <Link to={PATHS.DATA_EXTRACTOR.SETTINGS} style={{ color: '#1d4ed8', fontWeight: 600 }}>
                        Open Data Extractor Settings → paste Google API keys
                    </Link>
                </div>
            )}

            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
                Web Search and Google Business find companies by keyword + location. Portal sources sync your seller inbox or public trade listings.
            </p>
            <form onSubmit={onSubmit}>
                <label style={labelStyle}>
                    Keyword / Product *
                    <input type="text" value={form.keyword} onChange={onChange('keyword')} placeholder="Smart Home Automation Manufacturer" style={fieldStyle} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={labelStyle}>
                        City
                        <input type="text" value={form.city} onChange={onChange('city')} placeholder="Mumbai" style={fieldStyle} />
                    </label>
                    <label style={labelStyle}>
                        State
                        <input type="text" value={form.state} onChange={onChange('state')} placeholder="Maharashtra" style={fieldStyle} />
                    </label>
                </div>
                <label style={labelStyle}>
                    Country
                    <input type="text" value={form.country} onChange={onChange('country')} style={fieldStyle} />
                </label>
                <label style={labelStyle}>
                    Source
                    <select value={form.sourceId} onChange={onChange('sourceId')} style={fieldStyle}>
                        {activeSources.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label}
                                {!s.configured ? ' (not configured)' : ''}
                            </option>
                        ))}
                    </select>
                </label>
                {selected && (
                    <div style={{
                        background: selectedConfigured ? '#f0fdf4' : '#fffbeb',
                        border: `1px solid ${selectedConfigured ? '#bbf7d0' : '#fde68a'}`,
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 16,
                        fontSize: 13,
                        color: selectedConfigured ? '#166534' : '#92400e',
                    }}
                    >
                        {selected.description && <div style={{ marginBottom: 6 }}>{selected.description}</div>}
                        {selected.webhookUrl && (
                            <div style={{ marginBottom: 6, fontSize: 12 }}>
                                Webhook URL: <code style={{ wordBreak: 'break-all' }}>{selected.webhookUrl}</code>
                            </div>
                        )}
                        {selected.message}
                        {!selectedConfigured && (
                            <div style={{ marginTop: 8 }}>
                                <Link to={PATHS.DATA_EXTRACTOR.SETTINGS} style={{ color: '#1d4ed8' }}>Configure Google API keys in Settings</Link>
                            </div>
                        )}
                        {(selected.id === 'web_search' || selected.id === 'social_public' || selectedConfigured) && (
                            <div style={{ marginTop: 8 }}>
                                <button type="button" onClick={onTestAdapter} disabled={testing} style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>
                                    {testing ? 'Testing…' : selected.id === 'web_search' ? 'Test Google / Web Search' : selected.id === 'social_public' ? 'Test social discovery' : 'Test connection'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {comingSoon.length > 0 && (
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                        Coming soon:
                        {' '}
                        {comingSoon.map((s) => s.label).join(', ')}
                    </p>
                )}
                <label style={labelStyle}>
                    Max results
                    <input type="number" min={1} max={50} value={form.maxResults} onChange={onChange('maxResults')} style={fieldStyle} />
                </label>
                <button type="submit" disabled={loading} style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer' }}>
                    {loading ? 'Searching…' : 'Search'}
                </button>
            </form>
        </div>
    );
}
