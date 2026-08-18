import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const btn = (bg, color = '#fff') => ({
    padding: '8px 14px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
});

const FACEBOOK_TYPES = [
    ['pages', 'Business/Pages'],
    ['groups', 'Groups'],
    ['group_intelligence', 'Group Intelligence'],
    ['posts', 'Posts/Activity'],
];

const INSTAGRAM_TYPES = [
    ['business_profiles', 'Business Profiles'],
    ['professional_accounts', 'Professional Accounts'],
    ['hashtag_topic', 'Hashtag/Topic'],
    ['related_accounts', 'Related Accounts'],
    ['community_intelligence', 'Community Intelligence'],
];

export default function DataExtractorSocialSourcePage({ platform }) {
    const isIg = platform === 'instagram';
    const label = isIg ? 'Instagram' : 'Facebook';
    const types = isIg ? INSTAGRAM_TYPES : FACEBOOK_TYPES;
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState('');
    const [mode, setMode] = useState('public_search');
    const [keyword, setKeyword] = useState('Home Automation');
    const [location, setLocation] = useState(isIg ? '' : 'Mumbai');
    const [searchType, setSearchType] = useState(types[0][0]);
    const [result, setResult] = useState(null);

    const loadStatus = useCallback(async () => {
        try {
            const data = isIg ? await dataExtractorApi.instagramSourceStatus() : await dataExtractorApi.facebookSourceStatus();
            setStatus(data);
        } catch (e) {
            toast.error(e?.response?.data?.message || `Failed to load ${label} status`);
        }
    }, [isIg, label]);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    const loginStatus = status?.directLogin?.status || 'disconnected';
    const loginLabel = loginStatus === 'connected' ? 'Connected' : loginStatus === 'expired' ? 'Session Expired' : 'Disconnected';

    const onConnect = async () => {
        setBusy('connect');
        try {
            const data = isIg ? await dataExtractorApi.instagramConnect() : await dataExtractorApi.facebookConnect();
            toast.success(data?.status === 'connected' ? `${label} connected` : 'Login not completed');
            await loadStatus();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Connect failed');
        } finally {
            setBusy('');
        }
    };

    const onDisconnect = async () => {
        setBusy('disconnect');
        try {
            if (isIg) await dataExtractorApi.instagramDisconnect();
            else await dataExtractorApi.facebookDisconnect();
            toast.success(`${label} disconnected`);
            await loadStatus();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Disconnect failed');
        } finally {
            setBusy('');
        }
    };

    const onStart = async () => {
        if (!keyword.trim()) {
            toast.error('Keyword is required');
            return;
        }
        setBusy('extract');
        setResult(null);
        try {
            const payload = { mode, keyword: keyword.trim(), location: location.trim(), searchType };
            const data = isIg
                ? await dataExtractorApi.startInstagramExtraction(payload)
                : await dataExtractorApi.startFacebookExtraction(payload);
            setResult(data);
            if (data?.ingested) toast.success(`${data.ingested} candidate(s) sent to Processing`);
            else toast(data?.errors?.[0] || 'No candidates found');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Extraction failed');
        } finally {
            setBusy('');
        }
    };

    return (
        <div style={{ maxWidth: 760 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{label} extraction</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                {label} is a source adapter only. Results enter the existing Processing → Verified Data workflow.
                Convert to Lead stays manual. LinkedIn and X are not included.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['public_search', 'Public Search'], ['direct_login', `Direct ${label} Login`]].map(([id, text]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setMode(id)}
                        style={{
                            ...btn(mode === id ? '#2563eb' : '#fff', mode === id ? '#fff' : '#334155'),
                        }}
                    >
                        {text}
                    </button>
                ))}
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16, background: '#f8fafc', fontSize: 13 }}>
                <div><strong>Public Search:</strong> {status?.publicSearch?.message || 'Available'}</div>
                <div style={{ marginTop: 6 }}>
                    <strong>Direct Login:</strong> {loginLabel}
                    {mode === 'direct_login' ? (
                        <span style={{ marginLeft: 8 }}>
                            <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={onConnect}>Connect</button>
                            {' '}
                            <button type="button" disabled={!!busy} style={btn('#fff', '#334155')} onClick={onDisconnect}>Disconnect</button>
                        </span>
                    ) : null}
                </div>
                <div style={{ marginTop: 6, color: '#64748b' }}>
                    Official API: {status?.officialApi?.message || 'Not configured'}
                </div>
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Location {isIg ? '(optional)' : '(optional)'}</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Mumbai" style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Search type</label>
            <select value={searchType} onChange={(e) => setSearchType(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 16 }}>
                {types.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>

            {(status?.limitations || []).map((t) => (
                <p key={t} style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8 }}>{t}</p>
            ))}

            <button type="button" disabled={!!busy} style={btn('#1d4ed8')} onClick={onStart}>
                {busy === 'extract' ? 'Starting…' : `START ${label.toUpperCase()} EXTRACTION`}
            </button>

            {result ? (
                <div style={{ marginTop: 16, border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 8, padding: 12, fontSize: 13 }}>
                    <p style={{ marginTop: 0 }}>{result.note}</p>
                    <p>Ingested: <strong>{result.ingested || 0}</strong></p>
                    {(result.errors || []).length ? <p style={{ color: '#b91c1c' }}>{result.errors.join(' ')}</p> : null}
                    {result.processingUrl ? (
                        <Link to={result.sessionId ? PATHS.DATA_EXTRACTOR.RUN(result.sessionId) : PATHS.DATA_EXTRACTOR.SIMPLE_LEAD_SEARCH}>
                            Open Processing → Verified Data
                        </Link>
                    ) : null}
                    {(result.records || []).slice(0, 8).map((r) => (
                        <div key={r.resultUrl} style={{ marginTop: 6 }}>
                            <a href={r.resultUrl} target="_blank" rel="noreferrer">{r.title || r.resultUrl}</a>
                            <span style={{ color: '#64748b' }}> · {r.resultTypeHint}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
