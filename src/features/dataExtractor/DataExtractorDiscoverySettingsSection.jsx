import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';

const field = { display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' };
const label = { display: 'block', marginBottom: 10, fontSize: 13 };
const checkRow = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 };

/**
 * Free-First Discovery settings: caps, Brave, IndiaMART, optional paid fallback.
 * Persists via updateSettings({ discoverySettings, braveSettings }).
 */
export default function DataExtractorDiscoverySettingsSection({ canEdit }) {
    const [mode, setMode] = useState('loading');
    const [saving, setSaving] = useState(false);
    const [testingBrave, setTestingBrave] = useState(false);
    const [braveKey, setBraveKey] = useState('');
    const [braveMasked, setBraveMasked] = useState('');
    const [form, setForm] = useState({
        freeFirstEnabled: true,
        allowPaidFallback: false,
        braveEnabled: true,
        indiamartEnabled: true,
        indiamartPublicDiscoveryMode: false,
        indiamartManualUrlMode: true,
        indiamartExcelImportMode: true,
        websiteEnrichmentEnabled: true,
        socialDiscoveryEnabled: true,
        serpapiEnabled: false,
        placesEnabled: false,
        browserAssistedEnabled: false,
        defaultTarget: 10,
        maxTarget: 1000,
        defaultBatchSize: 10,
        maxBatchSize: 50,
        defaultRequestDelayMs: 0,
        sourceDelayMs: 0,
        monthlySafetyLimit: 1000,
        perJobLimit: 100,
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const settings = await dataExtractorApi.getSettings();
                if (cancelled) return;
                const d = settings?.sourceConnectors?.discovery || settings?.discoverySettings || {};
                const b = settings?.sourceConnectors?.brave || {};
                setForm((f) => ({
                    ...f,
                    freeFirstEnabled: d.freeFirstEnabled !== false,
                    allowPaidFallback: d.allowPaidFallback === true,
                    braveEnabled: d.braveEnabled !== false,
                    indiamartEnabled: d.indiamartEnabled !== false,
                    indiamartPublicDiscoveryMode: d.indiamartPublicDiscoveryMode === true,
                    indiamartManualUrlMode: d.indiamartManualUrlMode !== false,
                    indiamartExcelImportMode: d.indiamartExcelImportMode !== false,
                    websiteEnrichmentEnabled: d.websiteEnrichmentEnabled !== false,
                    socialDiscoveryEnabled: d.socialDiscoveryEnabled !== false,
                    serpapiEnabled: d.serpapiEnabled === true,
                    placesEnabled: d.placesEnabled === true,
                    browserAssistedEnabled: d.browserAssistedEnabled === true,
                    defaultTarget: Number(d.defaultTarget ?? d.defaultTargetCompanies) || 10,
                    maxTarget: Number(d.maxTarget ?? d.maxTargetCompanies) || 1000,
                    defaultBatchSize: Number(d.defaultBatchSize) || 10,
                    maxBatchSize: Number(d.maxBatchSize) || 50,
                    defaultRequestDelayMs: Number(d.defaultRequestDelayMs ?? d.requestDelayMs) || 0,
                    sourceDelayMs: Number(d.sourceDelayMs) || 0,
                    monthlySafetyLimit: Number(b.monthlySafetyLimit) || 1000,
                    perJobLimit: Number(b.perJobLimit) || 100,
                }));
                setBraveMasked(b.apiKeyMasked || '');
                setMode('settings');
            } catch {
                if (!cancelled) setMode('readonly');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const onNum = (key) => (e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
    const onBool = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.checked }));

    const onSave = async () => {
        if (!canEdit) {
            toast.error('You do not have permission to edit discovery settings');
            return;
        }
        setSaving(true);
        try {
            const discoverySettings = {
                freeFirstEnabled: !!form.freeFirstEnabled,
                allowPaidFallback: !!form.allowPaidFallback,
                braveEnabled: !!form.braveEnabled,
                indiamartEnabled: !!form.indiamartEnabled,
                indiamartPublicDiscoveryMode: !!form.indiamartPublicDiscoveryMode,
                indiamartManualUrlMode: !!form.indiamartManualUrlMode,
                indiamartExcelImportMode: !!form.indiamartExcelImportMode,
                websiteEnrichmentEnabled: !!form.websiteEnrichmentEnabled,
                socialDiscoveryEnabled: !!form.socialDiscoveryEnabled,
                serpapiEnabled: !!form.serpapiEnabled,
                placesEnabled: !!form.placesEnabled,
                browserAssistedEnabled: !!form.browserAssistedEnabled,
                defaultTarget: Number(form.defaultTarget) || 10,
                maxTarget: Math.min(1000, Math.max(1, Number(form.maxTarget) || 1000)),
                defaultBatchSize: Number(form.defaultBatchSize) || 10,
                maxBatchSize: Number(form.maxBatchSize) || 50,
                defaultRequestDelayMs: Number(form.defaultRequestDelayMs) || 0,
                sourceDelayMs: Number(form.sourceDelayMs) || 0,
            };
            const braveSettings = {
                enabled: !!form.braveEnabled,
                monthlySafetyLimit: Number(form.monthlySafetyLimit) || 1000,
                perJobLimit: Number(form.perJobLimit) || 100,
            };
            if (braveKey.trim()) braveSettings.apiKey = braveKey.trim();
            await dataExtractorApi.updateSettings({ discoverySettings, braveSettings });
            setBraveKey('');
            toast.success('Free-First Discovery settings saved');
            const refreshed = await dataExtractorApi.getSettings();
            const b = refreshed?.sourceConnectors?.brave || {};
            setBraveMasked(b.apiKeyMasked || (braveKey.trim() ? '••••••••saved' : braveMasked));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const onTestBrave = async () => {
        setTestingBrave(true);
        try {
            const result = await dataExtractorApi.testDiscoveryProvider('brave', {});
            const status = result?.status || result?.connectionStatus || (result?.ok ? 'CONNECTED' : 'FAILED');
            if (result?.ok || status === 'CONNECTED') toast.success(`Brave: ${status}`);
            else toast.error(`Brave: ${status} — ${result?.message || ''}`, { duration: 8000 });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Brave test failed');
        } finally {
            setTestingBrave(false);
        }
    };

    if (mode === 'loading') {
        return <div style={{ marginBottom: 16, fontSize: 13 }}>Loading discovery settings…</div>;
    }

    return (
        <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#0e7490' }}>Free-First Business Discovery</h3>
            <p style={{ margin: '0 0 12px', color: '#334155', lineHeight: 1.6 }}>
                Priority: Brave → IndiaMART (manual/import) → Manual URL → Excel/CSV → Website enrichment → Facebook/Instagram public URLs.
                SerpAPI and Google Places stay optional and off unless paid fallback is allowed.
            </p>
            {mode === 'readonly' ? (
                <p style={{ margin: 0, color: '#155e75', background: '#f0fdfa', padding: 10, borderRadius: 6 }}>
                    Could not load settings. Defaults apply on the Business Discovery page.
                </p>
            ) : (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.freeFirstEnabled} disabled={!canEdit} onChange={onBool('freeFirstEnabled')} />
                            Free-First mode (prefer free/manual sources)
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.allowPaidFallback} disabled={!canEdit} onChange={onBool('allowPaidFallback')} />
                            Allow optional paid fallback (SerpAPI / Places)
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.braveEnabled} disabled={!canEdit} onChange={onBool('braveEnabled')} />
                            Brave Search enabled
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.indiamartEnabled} disabled={!canEdit} onChange={onBool('indiamartEnabled')} />
                            IndiaMART enabled
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.indiamartManualUrlMode} disabled={!canEdit} onChange={onBool('indiamartManualUrlMode')} />
                            IndiaMART manual URL mode
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.indiamartExcelImportMode} disabled={!canEdit} onChange={onBool('indiamartExcelImportMode')} />
                            IndiaMART Excel/CSV import mode
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.indiamartPublicDiscoveryMode} disabled={!canEdit} onChange={onBool('indiamartPublicDiscoveryMode')} />
                            IndiaMART public discovery via Brave site:indiamart.com (requires Brave)
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.websiteEnrichmentEnabled} disabled={!canEdit} onChange={onBool('websiteEnrichmentEnabled')} />
                            Website enrichment
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.socialDiscoveryEnabled} disabled={!canEdit} onChange={onBool('socialDiscoveryEnabled')} />
                            Facebook / Instagram public URL modes
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.serpapiEnabled} disabled={!canEdit || !form.allowPaidFallback} onChange={onBool('serpapiEnabled')} />
                            SerpAPI enabled (optional paid)
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.placesEnabled} disabled={!canEdit || !form.allowPaidFallback} onChange={onBool('placesEnabled')} />
                            Google Places enrichment (optional paid)
                        </label>
                        <label style={checkRow}>
                            <input type="checkbox" checked={!!form.browserAssistedEnabled} disabled={!canEdit} onChange={onBool('browserAssistedEnabled')} />
                            Browser-assisted local Discovery Agent (Windows / visible Chromium)
                        </label>
                    </div>

                    <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                        <strong style={{ display: 'block', marginBottom: 8 }}>Brave Search API</strong>
                        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#475569' }}>
                            Key is stored server-side only. Never shown in full after save.
                            {braveMasked ? ` Saved key: ${braveMasked}` : ' No key saved yet (status NOT_CONFIGURED).'}
                        </p>
                        <label style={label}>
                            Brave API key (leave blank to keep saved)
                            <input type="password" autoComplete="off" value={braveKey} disabled={!canEdit} onChange={(e) => setBraveKey(e.target.value)} style={field} placeholder="BSA..." />
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <label style={label}>
                                Monthly safety limit
                                <input type="number" min={1} value={form.monthlySafetyLimit} disabled={!canEdit} onChange={onNum('monthlySafetyLimit')} style={field} />
                            </label>
                            <label style={label}>
                                Per-job limit
                                <input type="number" min={1} value={form.perJobLimit} disabled={!canEdit} onChange={onNum('perJobLimit')} style={field} />
                            </label>
                        </div>
                        <button type="button" onClick={onTestBrave} disabled={testingBrave} style={{ marginTop: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                            {testingBrave ? 'Testing…' : 'Test Brave connection'}
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <label style={label}>
                            Default target companies
                            <input type="number" min={1} max={1000} value={form.defaultTarget} disabled={!canEdit} onChange={onNum('defaultTarget')} style={field} />
                        </label>
                        <label style={label}>
                            Max target companies
                            <input type="number" min={1} max={1000} value={form.maxTarget} disabled={!canEdit} onChange={onNum('maxTarget')} style={field} />
                        </label>
                        <label style={label}>
                            Default batch size
                            <input type="number" min={1} max={50} value={form.defaultBatchSize} disabled={!canEdit} onChange={onNum('defaultBatchSize')} style={field} />
                        </label>
                        <label style={label}>
                            Max batch size
                            <input type="number" min={1} max={50} value={form.maxBatchSize} disabled={!canEdit} onChange={onNum('maxBatchSize')} style={field} />
                        </label>
                        <label style={label}>
                            Request delay (ms)
                            <input type="number" min={0} max={10000} value={form.defaultRequestDelayMs} disabled={!canEdit} onChange={onNum('defaultRequestDelayMs')} style={field} />
                        </label>
                        <label style={label}>
                            Source delay (ms)
                            <input type="number" min={0} max={30000} value={form.sourceDelayMs} disabled={!canEdit} onChange={onNum('sourceDelayMs')} style={field} />
                        </label>
                    </div>
                    {canEdit && (
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={saving}
                            style={{ marginTop: 12, padding: '8px 16px', background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                        >
                            {saving ? 'Saving…' : 'Save Free-First Discovery settings'}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
