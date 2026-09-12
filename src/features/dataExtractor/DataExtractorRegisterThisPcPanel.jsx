import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';
import {
    formatRegisterPcStatus,
    isDataExtractorAdminUser,
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
const field = { display: 'block', width: '100%', maxWidth: 360, marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' };

export default function DataExtractorRegisterThisPcPanel({ compact = false }) {
    const { user, hasRole } = useAuth() || {};
    const isAdmin = isDataExtractorAdminUser(user, hasRole);
    const [tokens, setTokens] = useState([]);
    const [newToken, setNewToken] = useState(null);
    const [deviceName, setDeviceName] = useState('');
    const [busy, setBusy] = useState('');
    const [agent, setAgent] = useState(null);

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
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [load]);

    const online = Boolean(agent?.online || agent?.connected || agent?.agentOnline);
    const liveDevice = agent?.deviceName || agent?.assignedDeviceName
        || tokens.find((t) => t.isActive)?.deviceName
        || '';
    const statusText = formatRegisterPcStatus({ online, deviceName: liveDevice });

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
            toast.success('PC registered — copy the token now. It will not be shown again.');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Could not register this PC');
        } finally {
            setBusy('');
        }
    };

    const revoke = async (id) => {
        setBusy('revoke-' + id);
        try {
            await dataExtractorApi.revokeDiscoveryAgentToken(id);
            toast.success('Device revoked');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Revoke failed');
        } finally {
            setBusy('');
        }
    };

    return (
        <section style={box}>
            <h2 style={{ margin: '0 0 8px', fontSize: compact ? 16 : 18 }}>Discovery Agent</h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: online ? '#166534' : '#9a3412', fontWeight: 600 }}>
                Status: {statusText}
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#334155' }}>
                Device: {liveDevice || '—'}
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
                Register this Windows computer under your login. Extraction on your search opens Google only on this PC.
                {isAdmin ? ' As admin you can see company devices.' : ' You only manage your own PC.'}
            </p>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
                This PC name
                <input
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="e.g. JATIN-PC"
                    style={field}
                />
            </label>
            <button
                type="button"
                disabled={!!busy}
                onClick={createToken}
                style={{ padding: '8px 14px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            >
                {busy === 'token' ? 'Registering…' : 'Register this PC'}
            </button>
            {newToken?.token ? (
                <div style={{ marginTop: 12, background: '#ecfdf5', padding: 10, borderRadius: 8, fontSize: 12 }}>
                    <strong>Copy now (shown once):</strong>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{newToken.token}</pre>
                    {newToken.deviceId ? (
                        <p style={{ margin: '8px 0 0' }}>
                            On this PC, set in <code>.env.production.local</code> or <code>.env.local</code>:<br />
                            DISCOVERY_AGENT_DEVICE_ID={newToken.deviceId}<br />
                            DISCOVERY_AGENT_DEVICE_NAME={newToken.deviceName || deviceName || 'Windows-PC'}
                        </p>
                    ) : null}
                    <p style={{ margin: '8px 0 0' }}>{newToken.warning}</p>
                </div>
            ) : null}
            <div style={{ marginTop: 14, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 12, fontSize: 12, color: '#9a3412', lineHeight: 1.55 }}>
                <strong>Windows setup (this computer only)</strong>
                <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    <li>Copy the token above. It is shown once and is never written to logs.</li>
                    <li>On this PC open <code>tools/discovery-agent</code>.</li>
                    <li>Put the token in <code>.env.production.local</code> as <code>DISCOVERY_AGENT_TOKEN</code>. Do not copy another user’s token.</li>
                    <li>Set the Device ID / Device Name from the box above, or run <code>register-user-discovery-agent.cmd</code>.</li>
                    <li>Start <code>start-production-discovery-agent.cmd</code> (or local listen). Keep the existing Startup launcher if you already have one.</li>
                    <li>This page should change to <strong>Ready — your PC name</strong>. Then Start Extraction is enabled.</li>
                </ol>
            </div>
            {compact ? (
                <p style={{ margin: '12px 0 0', fontSize: 12 }}>
                    <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_AGENT}>Open full Discovery Agent setup</Link>
                </p>
            ) : null}
            <table style={{ width: '100%', marginTop: 14, fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b' }}>
                        <th style={{ padding: 6 }}>Device</th>
                        {isAdmin ? <th style={{ padding: 6 }}>User</th> : null}
                        <th style={{ padding: 6 }}>Active</th>
                        <th style={{ padding: 6 }}>Last used</th>
                        <th style={{ padding: 6 }} />
                    </tr>
                </thead>
                <tbody>
                    {(tokens || []).map((t) => (
                        <tr key={t.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                            <td style={{ padding: 6 }}>{t.deviceName || t.hostname || t.name || '—'}</td>
                            {isAdmin ? <td style={{ padding: 6 }}>{t.userName || '—'}</td> : null}
                            <td style={{ padding: 6 }}>{t.isActive ? 'Yes' : 'No'}</td>
                            <td style={{ padding: 6 }}>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : '—'}</td>
                            <td style={{ padding: 6 }}>
                                {t.isActive ? (
                                    <button type="button" onClick={() => revoke(t.id)} disabled={!!busy}>Revoke</button>
                                ) : null}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}
