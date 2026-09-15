import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';
import {
    crmApiBaseUrl,
    formatDiscoveryAgentHeadline,
    isDataExtractorAdminUser,
    LOCAL_DISCOVERY_AGENT_ORIGIN,
    readLocalDeviceId,
    writeLocalDeviceId,
} from './simpleLeadSearchOwnershipUi';

const box = {
    background: '#fff',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
};
const primaryBtn = { padding: '8px 14px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginRight: 8 };
const secondaryBtn = { padding: '8px 14px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginRight: 8 };
const field = { display: 'block', width: '100%', maxWidth: 360, marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' };

async function probeLocalAgent() {
    const res = await fetch(`${LOCAL_DISCOVERY_AGENT_ORIGIN}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) throw new Error('offline');
    return res.json();
}

export default function DataExtractorRegisterThisPcPanel({ compact = false }) {
    const { user, hasRole } = useAuth() || {};
    const isAdmin = isDataExtractorAdminUser(user, hasRole);
    const [tokens, setTokens] = useState([]);
    const [newToken, setNewToken] = useState(null);
    const [deviceName, setDeviceName] = useState('');
    const [busy, setBusy] = useState('');
    const [agent, setAgent] = useState(null);
    const [localAgent, setLocalAgent] = useState(null);
    const [showDev, setShowDev] = useState(false);
    const [reconnectHint, setReconnectHint] = useState(false);

    const load = useCallback(async () => {
        try {
            const [tokenRes, statusRes] = await Promise.all([
                dataExtractorApi.listDiscoveryAgentTokens().catch(() => ({ tokens: [] })),
                dataExtractorApi.simpleLeadSearchAgentStatus().catch(() => null),
            ]);
            const rows = tokenRes?.tokens || tokenRes || [];
            setTokens(Array.isArray(rows) ? rows : []);
            setAgent(statusRes || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load Discovery Agent');
        }
        try {
            setLocalAgent(await probeLocalAgent());
        } catch {
            setLocalAgent(null);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const t = setInterval(load, 8000);
        return () => clearInterval(t);
    }, [load]);

    const online = Boolean(agent?.online || agent?.connected || agent?.agentOnline);
    const liveDevice = agent?.deviceName || agent?.assignedDeviceName
        || localAgent?.deviceName
        || tokens.find((t) => t.isActive)?.deviceName
        || '';
    const installed = Boolean(localAgent?.installed || localAgent?.ok);
    const headline = formatDiscoveryAgentHeadline({ online, deviceName: liveDevice, installed });
    const sourceLabel = (row, readyWhenOnline) => {
        const status = String(row?.status || '').toLowerCase();
        if (readyWhenOnline && online && (status === 'ready' || !status || status === 'offline')) return online ? 'Ready' : 'Offline';
        if (status === 'connected') return 'Connected';
        if (status === 'expired' || status === 'session_expired') return 'Session Expired';
        if (status === 'connecting') return 'Connecting';
        if (status === 'ready') return 'Ready';
        return 'Disconnected';
    };
    const webStatus = sourceLabel(agent?.sources?.web, true);
    const facebookStatus = sourceLabel(agent?.sources?.facebook);
    const instagramStatus = sourceLabel(agent?.sources?.instagram);

    const connectThisPc = async () => {
        setBusy('connect');
        setReconnectHint(false);
        try {
            let health = localAgent;
            try {
                health = await probeLocalAgent();
                setLocalAgent(health);
            } catch {
                setReconnectHint(true);
                toast.error('JSK Discovery Agent is not running on this PC.');
                return;
            }
            const session = await dataExtractorApi.createDiscoveryAgentPairing();
            const pairRes = await fetch(`${LOCAL_DISCOVERY_AGENT_ORIGIN}/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pairingCode: session.pairingCode,
                    crmBaseUrl: crmApiBaseUrl(),
                }),
            });
            const pairJson = await pairRes.json().catch(() => ({}));
            if (!pairRes.ok) throw new Error(pairJson?.message || 'Could not connect this PC');
            if (pairJson?.deviceName) writeLocalDeviceId(pairJson.deviceId || readLocalDeviceId());
            toast.success(pairJson?.deviceName
                ? `Connected — ${pairJson.deviceName}`
                : 'This PC is connected');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || 'Could not connect this PC');
        } finally {
            setBusy('');
        }
    };

    const connectSource = async (source) => {
        const label = source === 'instagram' ? 'Instagram' : 'Facebook';
        setBusy(source);
        try {
            const session = await dataExtractorApi.requestExtractionSourceConnect(source);
            const pairRes = await fetch(`${LOCAL_DISCOVERY_AGENT_ORIGIN}/sources/${source}/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: session.userId, crmBaseUrl: crmApiBaseUrl() }),
            });
            const pairJson = await pairRes.json().catch(() => ({}));
            if (!pairRes.ok || pairJson?.ok === false) {
                throw new Error(pairJson?.message || `Could not connect ${label} on this PC`);
            }
            toast.success(`${label}: Connected`);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || `Could not connect ${label}`);
        } finally {
            setBusy('');
        }
    };

    const logoutSource = async (source) => {
        const label = source === 'instagram' ? 'Instagram' : 'Facebook';
        setBusy('logout-' + source);
        try {
            const session = await dataExtractorApi.requestExtractionSourceLogout(source);
            try {
                await fetch(`${LOCAL_DISCOVERY_AGENT_ORIGIN}/sources/${source}/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: session.userId }),
                });
            } catch {
                /* local agent may be closed */
            }
            toast.success(`${label}: Disconnected`);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || `Could not log out ${label}`);
        } finally {
            setBusy('');
        }
    };

    const startOrReconnect = async () => {
        setBusy('start');
        try {
            try {
                await fetch(`${LOCAL_DISCOVERY_AGENT_ORIGIN}/start`, { method: 'POST', signal: AbortSignal.timeout(1500) });
                toast.success('Asked the local agent to reconnect');
                await load();
                return;
            } catch {
                setReconnectHint(true);
            }
            window.location.href = 'jskdiscovery://start';
        } finally {
            setBusy('');
        }
    };

    const installAgent = async () => {
        setBusy('install');
        try {
            const blob = await dataExtractorApi.downloadDiscoveryAgentSetup();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'JSK-Discovery-Agent-Setup.exe';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success('Download started — run JSK Discovery Agent Setup.exe');
        } catch (e) {
            const status = e?.response?.status;
            toast.error(status === 404
                ? 'Installer is not available on this CRM yet. Ask an admin to build the staff Setup.exe.'
                : (e?.response?.data?.message || 'Could not download the installer'));
        } finally {
            setBusy('');
        }
    };

    const disconnect = async (id) => {
        setBusy('revoke-' + id);
        try {
            await dataExtractorApi.revokeDiscoveryAgentToken(id);
            try { await fetch(`${LOCAL_DISCOVERY_AGENT_ORIGIN}/forget`, { method: 'POST', signal: AbortSignal.timeout(1500) }); } catch { /* local agent may be closed */ }
            toast.success('This PC was disconnected');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Disconnect failed');
        } finally {
            setBusy('');
        }
    };

    const createToken = async () => {
        setBusy('token');
        try {
            const name = deviceName.trim() || `${String(user?.name || 'Windows').split(' ')[0]}-PC`;
            const data = await dataExtractorApi.createDiscoveryAgentToken({
                name,
                deviceName: name,
                deviceId: readLocalDeviceId() || undefined,
            });
            setNewToken(data);
            if (data?.deviceId) writeLocalDeviceId(data.deviceId);
            toast.success('Developer token created — copy it now. Staff should use Connect This PC instead.');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Could not create developer token');
        } finally {
            setBusy('');
        }
    };

    return (
        <section style={box}>
            <h2 style={{ margin: '0 0 8px', fontSize: compact ? 16 : 18 }}>JSK Extraction Agent</h2>
            <p style={{ margin: '0 0 10px', fontSize: 14, color: online ? '#166534' : '#9a3412', fontWeight: 700 }}>
                {headline}
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#334155' }}>
                Device: {liveDevice || '—'}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#334155' }}>Web Discovery: {webStatus}</p>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#334155' }}>Facebook: {facebookStatus}</p>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#334155' }}>Instagram: {instagramStatus}</p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569' }}>
                {online
                    ? 'This computer is ready. Click Start Extraction when you want to search.'
                    : 'Install once, connect this PC once, then Start Extraction anytime.'}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {!installed ? (
                    <button type="button" disabled={!!busy} onClick={installAgent} style={primaryBtn}>
                        {busy === 'install' ? 'Downloading…' : 'Install Discovery Agent'}
                    </button>
                ) : null}
                {installed && !online ? (
                    <button type="button" disabled={!!busy} onClick={connectThisPc} style={primaryBtn}>
                        {busy === 'connect' ? 'Connecting…' : 'Connect This PC'}
                    </button>
                ) : null}
                {!online ? (
                    <button type="button" disabled={!!busy} onClick={startOrReconnect} style={secondaryBtn}>
                        {busy === 'start' ? 'Starting…' : 'Start / Reconnect Agent'}
                    </button>
                ) : null}
                {installed ? (
                    <>
                        <button type="button" disabled={!!busy} onClick={() => connectSource('facebook')} style={secondaryBtn}>
                            {busy === 'facebook' ? 'Connecting Facebook…' : (facebookStatus === 'Connected' ? 'Reconnect Facebook' : 'Connect Facebook')}
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => connectSource('instagram')} style={secondaryBtn}>
                            {busy === 'instagram' ? 'Connecting Instagram…' : (instagramStatus === 'Connected' ? 'Reconnect Instagram' : 'Connect Instagram')}
                        </button>
                        {facebookStatus === 'Connected' || facebookStatus === 'Session Expired' ? (
                            <button type="button" disabled={!!busy} onClick={() => logoutSource('facebook')} style={secondaryBtn}>
                                Logout Facebook
                            </button>
                        ) : null}
                        {instagramStatus === 'Connected' || instagramStatus === 'Session Expired' ? (
                            <button type="button" disabled={!!busy} onClick={() => logoutSource('instagram')} style={secondaryBtn}>
                                Logout Instagram
                            </button>
                        ) : null}
                    </>
                ) : null}
            </div>

            {reconnectHint ? (
                <div style={{ marginBottom: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 12, fontSize: 13, color: '#9a3412', lineHeight: 1.55 }}>
                    <strong>Open JSK Discovery Agent</strong>
                    <p style={{ margin: '8px 0 0' }}>
                        Use the Start menu shortcut <em>JSK Extraction Agent</em> (or JSK Discovery Agent), or run
                        {' '}JSK Extraction Agent Setup.exe again if it is not installed.
                    </p>
                    <p style={{ margin: '8px 0 0' }}>
                        <a href="jskdiscovery://start">Open JSK Extraction Agent</a>
                    </p>
                </div>
            ) : null}

            {compact ? (
                <p style={{ margin: '0 0 12px', fontSize: 12 }}>
                    <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_AGENT}>Open Discovery Agent</Link>
                </p>
            ) : null}

            <table style={{ width: '100%', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b' }}>
                        <th style={{ padding: 6 }}>Device</th>
                        {isAdmin ? <th style={{ padding: 6 }}>User</th> : null}
                        <th style={{ padding: 6 }}>Status</th>
                        <th style={{ padding: 6 }}>Last Seen</th>
                        <th style={{ padding: 6 }}>Agent Version</th>
                        <th style={{ padding: 6 }} />
                    </tr>
                </thead>
                <tbody>
                    {(tokens || []).map((t) => {
                        const rowOnline = online && liveDevice && (t.deviceName === liveDevice || t.hostname === liveDevice);
                        return (
                            <tr key={t.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 6 }}>{t.deviceName || t.hostname || t.name || '—'}</td>
                                {isAdmin ? <td style={{ padding: 6 }}>{t.userName || '—'}</td> : null}
                                <td style={{ padding: 6 }}>{t.isActive ? (rowOnline ? 'Ready' : 'Offline') : 'Disconnected'}</td>
                                <td style={{ padding: 6 }}>{t.lastSeen || t.lastHeartbeatAt || t.lastUsedAt ? new Date(t.lastSeen || t.lastHeartbeatAt || t.lastUsedAt).toLocaleString() : '—'}</td>
                                <td style={{ padding: 6 }}>{t.agentVersion || '—'}</td>
                                <td style={{ padding: 6 }}>
                                    {t.isActive ? (
                                        <button type="button" onClick={() => disconnect(t.id)} disabled={!!busy}>Disconnect This PC</button>
                                    ) : null}
                                </td>
                            </tr>
                        );
                    })}
                    {!(tokens || []).length ? (
                        <tr><td colSpan={isAdmin ? 6 : 5} style={{ padding: 8, color: '#64748b' }}>No computer connected yet.</td></tr>
                    ) : null}
                </tbody>
            </table>

            {isAdmin ? (
                <div style={{ marginTop: 16 }}>
                    <button type="button" onClick={() => setShowDev((v) => !v)} style={{ ...secondaryBtn, fontSize: 12 }}>
                        {showDev ? 'Hide developer fallback' : 'Developer / admin fallback'}
                    </button>
                    {showDev ? (
                        <div style={{ marginTop: 12, background: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: 8, padding: 12 }}>
                            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>
                                Manual token / .env / .cmd setup. Do not use this as the staff workflow.
                            </p>
                            <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
                                This PC name
                                <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="e.g. JATIN-PC" style={field} />
                            </label>
                            <button type="button" disabled={!!busy} onClick={createToken} style={primaryBtn}>
                                {busy === 'token' ? 'Creating…' : 'Create developer token'}
                            </button>
                            {newToken?.token ? (
                                <div style={{ marginTop: 12, background: '#ecfdf5', padding: 10, borderRadius: 8, fontSize: 12 }}>
                                    <strong>Copy now (shown once, developer only):</strong>
                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{newToken.token}</pre>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
