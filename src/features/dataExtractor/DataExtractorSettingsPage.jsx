import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import DataExtractorUserGuide from './DataExtractorUserGuide';

function isSettingsEditor(user, hasRole, hasPermission) {
    const role = String(user?.roleName || user?.role?.name || '').trim().toLowerCase();
    if (['superadmin', 'admin', 'system admin', 'systemadmin'].includes(role)) return true;
    if (hasRole?.('superadmin') || hasRole?.('admin')) return true;
    return hasPermission?.('data_extractor.extractor.settings') === true;
}

export default function DataExtractorSettingsPage() {
    const { user, hasRole, hasPermission } = useAuth();
    const canEditSettings = isSettingsEditor(user, hasRole, hasPermission);
    const isSuperadmin = String(user?.roleName || '').toLowerCase() === 'superadmin' || hasRole?.('superadmin');
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingGoogle, setTestingGoogle] = useState(false);
    const [testingPortal, setTestingPortal] = useState('');
    const [googleKeys, setGoogleKeys] = useState({ cseApiKey: '', cseCx: '', placesApiKey: '' });

    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Copied');
        } catch {
            toast.error('Copy failed');
        }
    };

    const onTestPortal = async (portalId) => {
        setTestingPortal(portalId);
        try {
            const result = await dataExtractorApi.testAdapter(portalId);
            if (result?.ok) toast.success(result.message || 'Connection OK', { duration: 10000 });
            else toast.error(result?.message || 'Test failed', { duration: 10000 });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Test failed');
        } finally {
            setTestingPortal('');
        }
    };

    useEffect(() => {
        dataExtractorApi.getSettings()
            .then((data) => {
                setSettings(data);
                const hints = data?.providerStatus?.googleApiKeys || {};
                const cx = hints.cseCx || data?.sourceConnectors?.google?.cseCx || '';
                setGoogleKeys({ cseApiKey: '', cseCx: cx, placesApiKey: '' });
            })
            .catch(() => toast.error('Failed to load settings'))
            .finally(() => setLoading(false));
    }, []);

    const onSaveGoogleKeys = async () => {
        const hints = settings?.providerStatus?.googleApiKeys || {};
        const needCseKey = !hints.cseApiKeySet && !googleKeys.cseApiKey.trim();
        const needCx = !hints.cseCxSet && !googleKeys.cseCx.trim();
        if (needCseKey || needCx) {
            toast.error('Paste both Google CSE API key and Search engine ID (cx), then Save.', { duration: 8000 });
            return;
        }
        setSaving(true);
        try {
            const gk = {};
            if (googleKeys.cseApiKey.trim()) gk.cseApiKey = googleKeys.cseApiKey.trim();
            if (googleKeys.cseCx.trim()) gk.cseCx = googleKeys.cseCx.trim();
            if (googleKeys.placesApiKey.trim()) gk.placesApiKey = googleKeys.placesApiKey.trim();
            const updated = await dataExtractorApi.updateSettings({ googleApiKeys: gk });
            setSettings(updated);
            const hints = updated?.providerStatus?.googleApiKeys || {};
            setGoogleKeys((prev) => ({
                cseApiKey: '',
                cseCx: hints.cseCx || prev.cseCx,
                placesApiKey: '',
            }));
            const ok = updated?.providerStatus?.configured;
            toast.success(ok ? 'Google keys saved — search is ready' : 'Keys saved — check Test connection', { duration: 8000 });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const onSave = async () => {
        setSaving(true);
        try {
            const payload = {
                moduleEnabled: settings.moduleEnabled,
                maxUrlsPerJob: settings.maxUrlsPerJob,
                maxJobsPerDay: settings.maxJobsPerDay,
                maxResultsPerSearch: settings.maxResultsPerSearch,
                searchTimeoutMs: settings.searchTimeoutMs,
                enableSearchLogs: settings.enableSearchLogs,
                aiEnabled: settings.aiEnabled,
            };
            const gk = {};
            if (googleKeys.cseApiKey.trim()) gk.cseApiKey = googleKeys.cseApiKey.trim();
            if (googleKeys.cseCx.trim()) gk.cseCx = googleKeys.cseCx.trim();
            if (googleKeys.placesApiKey.trim()) gk.placesApiKey = googleKeys.placesApiKey.trim();
            if (Object.keys(gk).length) payload.googleApiKeys = gk;

            const updated = await dataExtractorApi.updateSettings(payload);
            setSettings(updated);
            const hints = updated?.providerStatus?.googleApiKeys || {};
            setGoogleKeys((prev) => ({
                cseApiKey: '',
                cseCx: hints.cseCx || prev.cseCx,
                placesApiKey: '',
            }));
            toast.success('Settings saved');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: 24 }}>Loading settings…</div>;

    const ps = settings?.providerStatus || {};
    const googleHints = ps.googleApiKeys || {};
    const portals = ps.portalAdapters || [];
    const google = (ps.webSearchProviders || []).find((p) => p.id === 'google_cse');
    const social = ps.socialPublicDiscovery || {};
    const ai = ps.aiLayer || {};

    const onTestGoogle = async () => {
        setTestingGoogle(true);
        try {
            const result = await dataExtractorApi.testWebSearch();
            if (result?.ok) toast.success(result.message || 'Google connected');
            else toast.error(result?.message || 'Test failed', { duration: 10000 });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Test failed');
        } finally {
            setTestingGoogle(false);
        }
    };

    return (
        <div style={{ padding: 24, maxWidth: 640 }}>
            <h2 style={{ marginTop: 0 }}>Data Extractor Settings</h2>
            {!isSuperadmin && (
                <p style={{ color: '#b45309', fontSize: 13, background: '#fffbeb', padding: 12, borderRadius: 8 }}>
                    Only platform superadmin can enable this module for a company.
                </p>
            )}

            <DataExtractorUserGuide variant="full" providerStatus={ps} />

            {!ps.configured && (
                <div style={{ background: '#fef2f2', border: '2px solid #f87171', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 14 }}>
                    <strong style={{ color: '#b91c1c' }}>No Google API keys saved yet</strong>
                    <p style={{ margin: '8px 0 0', color: '#7f1d1d', lineHeight: 1.6 }}>
                        Enabling Data Extractor and restarting the backend does <em>not</em> configure Google.
                        You must paste real API keys from Google Cloud below (or in <code>backend/.env</code>).
                    </p>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#991b1b', fontSize: 13 }}>
                        <li>CSE API key: {googleHints.cseApiKeySet ? 'saved' : 'missing'}</li>
                        <li>Search engine ID (cx): {googleHints.cseCxSet ? 'saved' : 'missing'}</li>
                        <li>Places API key (optional): {googleHints.placesApiKeySet ? 'saved' : 'missing'}</li>
                    </ul>
                </div>
            )}

            <div style={{ background: '#ecfdf5', border: '2px solid #34d399', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#047857' }}>Google API keys (save here — no backend restart)</h3>
                <p style={{ margin: '0 0 12px', color: '#334155', lineHeight: 1.6 }}>
                    Paste your Google keys below and click <strong>Save Settings</strong>. Keys are stored per company in the database.
                    Restart is only needed if you edit <code>backend/.env</code> instead.
                </p>
                {(googleHints.fromEnv?.cse || googleHints.fromEnv?.places) && (
                    <p style={{ margin: '0 0 12px', color: '#0369a1', fontSize: 12, background: '#e0f2fe', padding: 8, borderRadius: 6 }}>
                        Some keys are loaded from backend <code>.env</code>
                        {googleHints.fromEnv.cse ? ' (CSE)' : ''}
                        {googleHints.fromEnv.places ? ' (Places)' : ''}
                        .
                    </p>
                )}
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>
                    Google CSE API key
                    {googleHints.cseApiKeySet && <span style={{ color: '#166534', marginLeft: 8, fontSize: 11 }}>saved ✓</span>}
                    <input
                        type="password"
                        autoComplete="off"
                        placeholder={googleHints.cseApiKeySet ? 'Leave blank to keep saved key' : 'AIza…'}
                        value={googleKeys.cseApiKey}
                        disabled={!canEditSettings}
                        onChange={(e) => setGoogleKeys((k) => ({ ...k, cseApiKey: e.target.value }))}
                        style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #a7f3d0' }}
                    />
                </label>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>
                    Search engine ID (cx)
                    {googleHints.cseCxSet && <span style={{ color: '#166534', marginLeft: 8, fontSize: 11 }}>saved ✓</span>}
                    <input
                        type="text"
                        autoComplete="off"
                        placeholder="Programmable Search Engine ID"
                        value={googleKeys.cseCx}
                        disabled={!canEditSettings}
                        onChange={(e) => setGoogleKeys((k) => ({ ...k, cseCx: e.target.value }))}
                        style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #a7f3d0' }}
                    />
                </label>
                <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                    Google Places API key (for Google Business / Maps)
                    {googleHints.placesApiKeySet && <span style={{ color: '#166534', marginLeft: 8, fontSize: 11 }}>saved ✓</span>}
                    <input
                        type="password"
                        autoComplete="off"
                        placeholder={googleHints.placesApiKeySet ? 'Leave blank to keep saved key' : 'AIza… (Places API New enabled)'}
                        value={googleKeys.placesApiKey}
                        disabled={!canEditSettings}
                        onChange={(e) => setGoogleKeys((k) => ({ ...k, placesApiKey: e.target.value }))}
                        style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #a7f3d0' }}
                    />
                </label>
                <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 12 }}>
                    Minimum for keyword search: CSE API key + cx. Google Business works with Places key (full data) or CSE only (Maps URL fallback).
                </p>
                {canEditSettings && (
                    <button
                        type="button"
                        onClick={onSaveGoogleKeys}
                        disabled={saving}
                        style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginRight: 8 }}
                    >
                        {saving ? 'Saving…' : 'Save Google keys'}
                    </button>
                )}
                {!canEditSettings && (
                    <p style={{ margin: 0, color: '#92400e', fontSize: 12 }}>Ask an admin with Settings permission to paste Google keys here.</p>
                )}
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e40af' }}>1. Google Custom Search (recommended first)</h3>
                <ol style={{ margin: '0 0 12px', paddingLeft: 20, color: '#334155', lineHeight: 1.6 }}>
                    <li>Enable <a href="https://console.cloud.google.com/apis/library/customsearch.googleapis.com" target="_blank" rel="noreferrer">Custom Search API</a> in Google Cloud → create API key</li>
                    <li>Create a search engine at <a href="https://programmablesearchengine.google.com/controlpanel/all" target="_blank" rel="noreferrer">Programmable Search Engine</a> → search the entire web → copy Search engine ID (cx)</li>
                    <li>Paste keys in the green box above, or add to <code>backend/.env</code> and restart backend</li>
                </ol>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: google?.configured ? '#166534' : '#92400e' }}>
                        Status:
                        {' '}
                        {google?.configured ? 'Configured' : 'Not configured'}
                    </span>
                    <button type="button" onClick={onTestGoogle} disabled={testingGoogle} style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                        {testingGoogle ? 'Testing…' : 'Test Google connection'}
                    </button>
                </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Web Search Provider (active)</h3>
                <div style={{ display: 'grid', gap: 6 }}>
                    <div><strong>Provider:</strong> {ps.providerLabel || ps.provider || '—'}</div>
                    <div><strong>Configured:</strong> {ps.configured ? 'Yes' : 'No'}</div>
                    <div><strong>API Status:</strong> {ps.configured ? 'Ready' : 'Not configured'}</div>
                    <div><strong>Daily search limit:</strong> {ps.dailySearchLimit ?? settings?.maxJobsPerDay ?? 10}</div>
                    <div><strong>Timeout:</strong> {ps.timeoutMs ?? settings?.searchTimeoutMs ?? 15000} ms</div>
                    <div><strong>Results per search:</strong> {ps.resultsPerSearch ?? settings?.maxResultsPerSearch ?? 20}</div>
                </div>
                {!ps.configured && (
                    <p style={{ margin: '12px 0 0', color: '#92400e', fontSize: 12 }}>
                        {ps.message || 'Configure DATA_EXTRACTOR_PROVIDER and API key in backend .env'}
                    </p>
                )}
            </div>

            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#c2410c' }}>Google Business / Maps (Places API)</h3>
                <p style={{ margin: '0 0 12px', color: '#334155', lineHeight: 1.6 }}>
                    Official Google Places Text Search — best for keyword + city discovery (phone, website, Maps link).
                </p>
                <ol style={{ margin: '0 0 12px', paddingLeft: 20, color: '#64748b', lineHeight: 1.6, fontSize: 12 }}>
                    <li>Enable <strong>Places API (New)</strong> in Google Cloud</li>
                    <li>Paste Places API key in the green box above, or set in <code>backend/.env</code></li>
                </ol>
                <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 6, fontSize: 11, overflow: 'auto', marginBottom: 12 }}>{`# Optional — backend/.env alternative:
EXTRACTOR_GOOGLE_PLACES_API_KEY=your_key
# or GOOGLE_MAPS_API_KEY=your_key`}</pre>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: ps.googleBusiness?.configured ? '#166534' : '#92400e' }}>
                        Status:
                        {' '}
                        {ps.googleBusiness?.configured ? 'Configured' : 'Not configured'}
                    </span>
                    <button type="button" onClick={() => onTestPortal('google_business')} disabled={testingPortal === 'google_business'} style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                        {testingPortal === 'google_business' ? 'Testing…' : 'Test Google Business'}
                    </button>
                </div>
                {!ps.googleBusiness?.configured && ps.googleBusiness?.message && (
                    <p style={{ margin: '12px 0 0', color: '#92400e', fontSize: 12 }}>{ps.googleBusiness.message}</p>
                )}
            </div>

            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#6b21a8' }}>Phase 5 — Public social pages</h3>
                <p style={{ margin: '0 0 12px', color: '#334155', lineHeight: 1.6 }}>
                    Finds public <strong>Facebook Pages</strong> and <strong>Instagram business profiles</strong> using the same Web Search provider above.
                    Groups, reels, stories, and personal profiles are automatically rejected.
                </p>
                <ul style={{ margin: '0 0 12px', paddingLeft: 20, color: '#64748b', lineHeight: 1.6, fontSize: 12 }}>
                    <li>No login or private group access</li>
                    <li>No member or follower list scraping</li>
                    <li>Preview-first — review before saving drafts</li>
                </ul>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: social.configured ? '#166534' : '#92400e' }}>
                        Status:
                        {' '}
                        {social.configured ? 'Ready (uses Web Search)' : 'Needs Web Search keys'}
                    </span>
                    <button type="button" onClick={() => onTestPortal('social_public')} disabled={testingPortal === 'social_public'} style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                        {testingPortal === 'social_public' ? 'Testing…' : 'Test social discovery'}
                    </button>
                </div>
                {!social.configured && social.message && (
                    <p style={{ margin: '12px 0 0', color: '#92400e', fontSize: 12 }}>{social.message}</p>
                )}
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#166534' }}>Phase 6 — AI layer</h3>
                <p style={{ margin: '0 0 12px', color: '#334155', lineHeight: 1.6 }}>
                    Auto-classifies business type, boosts confidence/lead scores, and translates Chinese/export listings when OpenAI is configured.
                </p>
                <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 6, fontSize: 11, overflow: 'auto', marginBottom: 12 }}>{`# Optional — backend/.env for translation (Alibaba / Made-in-China listings)
EXTRACTOR_OPENAI_API_KEY=
EXTRACTOR_OPENAI_MODEL=gpt-4o-mini`}</pre>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <input
                        type="checkbox"
                        checked={!!settings?.aiEnabled}
                        disabled={!isSuperadmin}
                        onChange={(e) => setSettings((s) => ({ ...s, aiEnabled: e.target.checked }))}
                    />
                    Enable AI on search results (off by default)
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: ai.aiEnabled ? '#166534' : '#64748b' }}>
                        Mode:
                        {' '}
                        {ai.mode || 'disabled'}
                    </span>
                    <button type="button" onClick={() => onTestPortal('ai')} disabled={testingPortal === 'ai'} style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                        {testingPortal === 'ai' ? 'Testing…' : 'Test AI layer'}
                    </button>
                </div>
                {ai.message && <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: 12 }}>{ai.message}</p>}
            </div>

            {portals.length > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Portal Adapters (Phase 4)</h3>
                    <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 12 }}>
                        Official seller APIs only — syncs your IndiaMART / TradeIndia inbox or Justdial webhook leads (not public directory scraping).
                    </p>
                    {portals.map((p) => (
                        <div key={p.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #e2e8f0' }}>
                            <div><strong>{p.label}</strong> — {p.configured ? 'Configured' : 'Not configured'}</div>
                            {p.description && <div style={{ color: '#64748b', marginTop: 4 }}>{p.description}</div>}
                            {p.id === 'indiamart' && (
                                <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 10, borderRadius: 6, fontSize: 11, marginTop: 8, overflow: 'auto' }}>{`# backend/.env — from seller.indiamart.com → Lead Manager → Pull API
INDIAMART_GLUSR_CRM_KEY=your_key`}</pre>
                            )}
                            {p.id === 'tradeindia' && (
                                <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 10, borderRadius: 6, fontSize: 11, marginTop: 8, overflow: 'auto' }}>{`# backend/.env — from tradeindia.com → Inquiries → My Inquiry API
TRADEINDIA_USER_ID=
TRADEINDIA_PROFILE_ID=
TRADEINDIA_API_KEY=`}</pre>
                            )}
                            {p.id === 'justdial' && p.webhookUrl && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>Webhook URL (share with Justdial account manager):</div>
                                    <code style={{ display: 'block', wordBreak: 'break-all', background: '#f1f5f9', padding: 8, borderRadius: 6, fontSize: 11 }}>{p.webhookUrl}</code>
                                    <button type="button" onClick={() => copyText(p.webhookUrl)} style={{ marginTop: 6, fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>Copy webhook URL</button>
                                </div>
                            )}
                            {!p.configured && p.message && <div style={{ color: '#92400e', marginTop: 4, fontSize: 12 }}>{p.message}</div>}
                            <div style={{ marginTop: 8 }}>
                                <button type="button" onClick={() => onTestPortal(p.id)} disabled={testingPortal === p.id} style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>
                                    {testingPortal === p.id ? 'Testing…' : `Test ${p.label}`}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input
                    type="checkbox"
                    checked={!!settings?.moduleEnabled}
                    disabled={!isSuperadmin}
                    onChange={(e) => setSettings((s) => ({ ...s, moduleEnabled: e.target.checked }))}
                />
                Enable Data Extractor for this company
            </label>
            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                Max URLs per job
                <input
                    type="number"
                    min={1}
                    max={200}
                    value={settings?.maxUrlsPerJob ?? 50}
                    disabled={!isSuperadmin}
                    onChange={(e) => setSettings((s) => ({ ...s, maxUrlsPerJob: Number(e.target.value) }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
            </label>
            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                Max jobs per day
                <input
                    type="number"
                    min={1}
                    max={100}
                    value={settings?.maxJobsPerDay ?? 10}
                    disabled={!isSuperadmin}
                    onChange={(e) => setSettings((s) => ({ ...s, maxJobsPerDay: Number(e.target.value) }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
            </label>
            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                Results per search
                <input
                    type="number"
                    min={1}
                    max={50}
                    value={settings?.maxResultsPerSearch ?? 20}
                    disabled={!isSuperadmin}
                    onChange={(e) => setSettings((s) => ({ ...s, maxResultsPerSearch: Number(e.target.value) }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13 }}>
                <input
                    type="checkbox"
                    checked={!!settings?.enableSearchLogs}
                    disabled={!isSuperadmin}
                    onChange={(e) => setSettings((s) => ({ ...s, enableSearchLogs: e.target.checked }))}
                />
                Enable search logs (backend console)
            </label>
            {isSuperadmin && (
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                >
                    {saving ? 'Saving…' : 'Save Settings'}
                </button>
            )}
        </div>
    );
}
