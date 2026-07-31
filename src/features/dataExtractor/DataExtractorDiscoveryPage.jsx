import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const fieldStyle = { display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' };
const labelStyle = { display: 'block', marginBottom: 12, fontSize: 13, fontWeight: 500 };
const btnPrimary = { padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnSecondary = { padding: '10px 16px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 13 };

const TARGET_PRESETS = [10, 25, 50, 100, 250, 500, 1000];
const MAX_TARGET_CAP = 1000;
const DISCLAIMER = 'Results depend on publicly available information and configured providers. The requested target is not guaranteed.';

const STATIC_SOURCES = [
    { id: 'brave', label: 'Brave Search', active: true, kind: 'Free-first search' },
    { id: 'indiamart', label: 'IndiaMART', active: true, kind: 'Directory (manual/import)' },
    { id: 'manual_url', label: 'Manual URL', active: true, kind: 'Free/manual' },
    { id: 'excel_csv', label: 'Excel/CSV', active: true, kind: 'Free/manual' },
    { id: 'company_websites', label: 'Company Websites', active: true, kind: 'Free/manual' },
    { id: 'facebook_public', label: 'Facebook Public', active: true, kind: 'Free/manual' },
    { id: 'instagram_public', label: 'Instagram Public', active: true, kind: 'Free/manual' },
    { id: 'serpapi', label: 'SerpAPI (Optional Paid)', active: true, kind: 'Optional paid' },
    { id: 'google_places', label: 'Google Places (Optional)', active: true, kind: 'Optional paid' },
    { id: 'tradeindia', label: 'TradeIndia', active: false, kind: 'Coming soon' },
    { id: 'justdial', label: 'Justdial', active: false, kind: 'Coming soon' },
    { id: 'exportersindia', label: 'ExportersIndia', active: false, kind: 'Coming soon' },
    { id: 'linkedin', label: 'LinkedIn', active: false, kind: 'Coming soon' },
    { id: 'youtube', label: 'YouTube', active: false, kind: 'Coming soon' },
    { id: 'apify', label: 'Apify', active: false, kind: 'Coming soon' },
    { id: 'bright_data', label: 'Bright Data', active: false, kind: 'Coming soon' },
];

function badgeStyle(text) {
    const t = String(text || '').toLowerCase();
    let bg = '#f1f5f9';
    let color = '#475569';
    if (t.includes('configured') && !t.includes('not')) { bg = '#ecfdf5'; color = '#047857'; }
    if (t.includes('not configured')) { bg = '#fef2f2'; color = '#b91c1c'; }
    if (t.includes('enabled')) { bg = '#eff6ff'; color = '#1d4ed8'; }
    if (t.includes('disabled')) { bg = '#f8fafc'; color = '#64748b'; }
    if (t.includes('coming')) { bg = '#fff7ed'; color = '#c2410c'; }
    if (t.includes('free') || t.includes('manual')) { bg = '#f0fdf4'; color = '#166534'; }
    if (t.includes('api')) { bg = '#eef2ff'; color = '#3730a3'; }
    return {
        display: 'inline-block',
        marginLeft: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
    };
}

function resolveStatusBadges(src, providerMap) {
    const p = providerMap[src.id] || {};
    const badges = [];
    if (!src.active) {
        badges.push(p.statusLabel || 'Coming soon');
        return badges;
    }
    if (p.comingSoon) {
        badges.push('Coming soon');
        return badges;
    }
    const configured = p.isConfigured ?? p.configured;
    if (configured === true) badges.push('Configured');
    else if (configured === false) badges.push('Not configured');

    const enabled = p.isEnabled ?? p.enabled;
    if (enabled === true) badges.push('Enabled');
    else if (enabled === false) badges.push('Disabled');

    if (p.statusLabel && !badges.includes(p.statusLabel)) badges.push(p.statusLabel);
    if (src.kind) badges.push(src.kind);
    if (!badges.length) badges.push(src.kind || 'Available');
    return badges;
}

export default function DataExtractorDiscoveryPage() {
    const { selectedFY } = useFinancialYear();
    const navigate = useNavigate();
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [importUrls, setImportUrls] = useState('');
    const [targetPreset, setTargetPreset] = useState(10);
    const [customTarget, setCustomTarget] = useState('');
    const [useCustomTarget, setUseCustomTarget] = useState(false);
    const [form, setForm] = useState({
        keyword: '',
        city: '',
        state: '',
        country: 'India',
        batchSize: 10,
    });
    const [selectedSources, setSelectedSources] = useState(() => (
        STATIC_SOURCES.filter((s) => s.active && !String(s.kind || '').toLowerCase().includes('optional paid')).map((s) => s.id)
    ));

    useEffect(() => {
        dataExtractorApi.listDiscoveryProviders()
            .then((data) => {
                const list = Array.isArray(data) ? data : (data?.providers || data?.results || []);
                setProviders(list);
            })
            .catch(() => setProviders([]));
    }, []);

    const providerMap = useMemo(() => {
        const map = {};
        for (const p of providers) {
            const id = p.providerId || p.id;
            if (id) map[id] = p;
        }
        // Frontend source ids → registry provider ids
        if (map.website_enrichment && !map.company_websites) map.company_websites = map.website_enrichment;
        if (map.excel_import && !map.excel_csv) map.excel_csv = map.excel_import;
        return map;
    }, [providers]);

    const targetCompanies = useMemo(() => {
        if (useCustomTarget) {
            const n = Number(customTarget);
            if (!Number.isFinite(n) || n < 1) return 10;
            return Math.min(MAX_TARGET_CAP, Math.floor(n));
        }
        return targetPreset;
    }, [useCustomTarget, customTarget, targetPreset]);

    const onChange = (key) => (e) => {
        let value = e.target.value;
        if (key === 'batchSize') {
            value = Math.min(50, Math.max(1, Number(value) || 1));
        }
        setForm((f) => ({ ...f, [key]: value }));
    };

    const toggleSource = (id, active) => {
        if (!active) return;
        setSelectedSources((prev) => (
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        ));
    };

    const onStart = async (e) => {
        e.preventDefault();
        if (!form.keyword.trim()) {
            toast.error('Enter keyword');
            return;
        }
        if (!selectedSources.length) {
            toast.error('Select at least one source');
            return;
        }
        setLoading(true);
        try {
            const created = await dataExtractorApi.createDiscoveryJob({
                keyword: form.keyword.trim(),
                city: form.city.trim(),
                state: form.state.trim(),
                country: form.country.trim(),
                targetCompanies,
                batchSize: Number(form.batchSize) || 10,
                sources: selectedSources,
                financialYear: selectedFY,
            });
            const job = created?.job || created;
            const jobId = job?._id || job?.id;
            if (!jobId) throw new Error('No job id returned');
            await dataExtractorApi.startDiscoveryJob(jobId);
            toast.success('Discovery started');
            navigate(PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(jobId));
        } catch (err) {
            toast.error(err?.response?.data?.message || err.message || 'Failed to start discovery');
        } finally {
            setLoading(false);
        }
    };

    const onImportUrls = async () => {
        const urls = importUrls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
        if (!urls.length) {
            toast.error('Paste at least one URL');
            return;
        }
        setImporting(true);
        try {
            const result = await dataExtractorApi.importDiscoveryUrls({
                urls,
                keyword: form.keyword.trim() || undefined,
                city: form.city.trim() || undefined,
                state: form.state.trim() || undefined,
                country: form.country.trim() || undefined,
                financialYear: selectedFY,
            });
            const job = result?.job || result;
            const jobId = job?._id || job?.id;
            toast.success(`Imported ${urls.length} URL(s)`);
            if (jobId) navigate(PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(jobId));
            else setShowImport(false);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'URL import failed');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div style={{ maxWidth: 820 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Business Discovery</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 12 }}>
                Search public business listings by keyword and location across selected sources.
                Target Companies is a maximum, not a guarantee.
            </p>
            <div style={{
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
                color: '#92400e',
                lineHeight: 1.5,
            }}
            >
                {DISCLAIMER}
            </div>

            <form onSubmit={onStart}>
                <label style={labelStyle}>
                    Keyword *
                    <input type="text" value={form.keyword} onChange={onChange('keyword')} placeholder="Home Automation Provider" style={fieldStyle} />
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

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Target Companies</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {TARGET_PRESETS.map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => { setUseCustomTarget(false); setTargetPreset(n); }}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 8,
                                    border: !useCustomTarget && targetPreset === n ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                    background: !useCustomTarget && targetPreset === n ? '#eff6ff' : '#fff',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 600,
                                }}
                            >
                                {n}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setUseCustomTarget(true)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: useCustomTarget ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                background: useCustomTarget ? '#eff6ff' : '#fff',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                            }}
                        >
                            Custom
                        </button>
                    </div>
                    {useCustomTarget && (
                        <label style={labelStyle}>
                            Custom target (max {MAX_TARGET_CAP})
                            <input
                                type="number"
                                min={1}
                                max={MAX_TARGET_CAP}
                                value={customTarget}
                                onChange={(e) => setCustomTarget(e.target.value)}
                                style={fieldStyle}
                            />
                        </label>
                    )}
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                        Maximum Target: {targetCompanies}. Search may stop when no more unique public results are available.
                    </p>
                </div>

                <label style={labelStyle}>
                    Batch Size
                    <input type="number" min={1} max={50} value={form.batchSize} onChange={onChange('batchSize')} style={fieldStyle} />
                </label>
                <p style={{ margin: '-4px 0 16px', fontSize: 12, color: '#94a3b8' }}>
                    Default 10. Discovery runs in controlled batches.
                </p>

                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Sources</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {STATIC_SOURCES.map((src) => {
                            const badges = resolveStatusBadges(src, providerMap);
                            const checked = selectedSources.includes(src.id);
                            return (
                                <label
                                    key={src.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 10,
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 8,
                                        background: src.active ? '#fff' : '#f8fafc',
                                        opacity: src.active ? 1 : 0.72,
                                        cursor: src.active ? 'pointer' : 'not-allowed',
                                        fontSize: 13,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked && src.active}
                                        disabled={!src.active}
                                        onChange={() => toggleSource(src.id, src.active)}
                                        style={{ marginTop: 2 }}
                                    />
                                    <span>
                                        <strong>{src.label}</strong>
                                        {badges.map((b) => (
                                            <span key={b} style={badgeStyle(b)}>{b}</span>
                                        ))}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                    <button type="submit" disabled={loading} style={{ ...btnPrimary, cursor: loading ? 'wait' : 'pointer' }}>
                        {loading ? 'Starting…' : 'Start Discovery'}
                    </button>
                    <button type="button" onClick={() => setShowImport((v) => !v)} style={btnSecondary}>
                        Import URLs
                    </button>
                    <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOBS} style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                        View Jobs
                    </Link>
                </div>
            </form>

            {showImport && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Import URLs</h3>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b' }}>
                        One public URL per line (websites, IndiaMART public profiles, public Facebook pages, public Instagram business profiles).
                    </p>
                    <textarea
                        value={importUrls}
                        onChange={(e) => setImportUrls(e.target.value)}
                        rows={8}
                        placeholder={"https://example.com\nhttps://www.indiamart.com/acme-company/\nhttps://www.facebook.com/examplebiz"}
                        style={{ ...fieldStyle, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <button type="button" onClick={onImportUrls} disabled={importing} style={{ ...btnPrimary, marginTop: 10, cursor: importing ? 'wait' : 'pointer' }}>
                        {importing ? 'Importing…' : 'Submit URLs'}
                    </button>
                </div>
            )}
        </div>
    );
}
