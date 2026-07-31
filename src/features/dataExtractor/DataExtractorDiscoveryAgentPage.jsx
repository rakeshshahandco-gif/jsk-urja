import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const field = { display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' };
const label = { display: 'block', marginBottom: 10, fontSize: 13 };
const btn = (bg) => ({ padding: '8px 14px', background: bg, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 });

const SOURCES = [
    { id: 'google_visible', label: 'Google Search (visible browser)' },
    { id: 'facebook_public_visible', label: 'Facebook public pages (visible)' },
    { id: 'instagram_public_visible', label: 'Instagram public profiles (visible)' },
    { id: 'manual_directory', label: 'Manual directory browsing' },
];

export default function DataExtractorDiscoveryAgentPage() {
    const { selectedFY } = useFinancialYear();
    const [tokens, setTokens] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [newToken, setNewToken] = useState(null);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        sourceMode: 'google_visible',
        keyword: '',
        city: '',
        state: '',
        country: 'India',
        maxPages: 3,
        maxCompanies: 10,
        delayMsMin: 2500,
        delayMsMax: 6000,
        websiteEnrichment: false,
    });

    const load = useCallback(async () => {
        try {
            const [t, j] = await Promise.all([
                dataExtractorApi.listDiscoveryAgentTokens(),
                dataExtractorApi.listDiscoveryAgentJobs(),
            ]);
            setTokens(t?.tokens || t || []);
            setJobs(j?.results || j || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load agent data');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const createToken = async () => {
        setBusy('token');
        try {
            const data = await dataExtractorApi.createDiscoveryAgentToken({ name: 'Local Discovery Agent' });
            setNewToken(data);
            toast.success('Token created — copy it now');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Token create failed');
        } finally {
            setBusy('');
        }
    };

    const revoke = async (id) => {
        setBusy('revoke-' + id);
        try {
            await dataExtractorApi.revokeDiscoveryAgentToken(id);
            toast.success('Token revoked');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Revoke failed');
        } finally {
            setBusy('');
        }
    };

    const createJob = async (e) => {
        e.preventDefault();
        setBusy('job');
        try {
            const data = await dataExtractorApi.createDiscoveryAgentJob({
                ...form,
                financialYear: selectedFY,
            });
            toast.success('Agent job created. Run local agent with this job id.');
            load();
            if (data?.agentJob?._id) {
                toast((t) => (
                    <span>Job id: <code>{data.agentJob._id}</code></span>
                ), { duration: 8000 });
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Create job failed (enable Browser-assisted in Settings?)');
        } finally {
            setBusy('');
        }
    };

    const control = async (id, command) => {
        setBusy(command + id);
        try {
            await dataExtractorApi.controlDiscoveryAgentJob(id, { command });
            toast.success(command);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Control failed');
        } finally {
            setBusy('');
        }
    };

    return (
        <div style={{ maxWidth: 900 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Discovery Agent (Local Browser)</h2>
            <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.55 }}>
                Optional Windows helper with <strong>visible Chromium</strong>. Browser sessions stay on the PC.
                Cookies and passwords are never uploaded. CAPTCHA requires manual action. Results are drafts only.
            </p>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#9a3412' }}>
                Does not run on Render. Setup: <code>tools/discovery-agent</code> → npm install → playwright install chromium → .env.local with token.
                See <code>tools/discovery-agent/README.md</code>.
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>Agent tokens</h3>
                <button type="button" style={btn('#0f766e')} disabled={!!busy} onClick={createToken}>
                    {busy === 'token' ? 'Creating…' : 'Create agent token'}
                </button>
                {newToken?.token ? (
                    <div style={{ marginTop: 12, background: '#ecfdf5', padding: 10, borderRadius: 8, fontSize: 12 }}>
                        <strong>Copy now (shown once):</strong>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{newToken.token}</pre>
                        <p style={{ margin: 0 }}>{newToken.warning}</p>
                    </div>
                ) : null}
                <table style={{ width: '100%', marginTop: 12, fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#64748b' }}>
                            <th style={{ padding: 6 }}>Name</th>
                            <th style={{ padding: 6 }}>Prefix</th>
                            <th style={{ padding: 6 }}>Active</th>
                            <th style={{ padding: 6 }}>Last used</th>
                            <th style={{ padding: 6 }} />
                        </tr>
                    </thead>
                    <tbody>
                        {(tokens || []).map((t) => (
                            <tr key={t.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 6 }}>{t.name}</td>
                                <td style={{ padding: 6 }}><code>{t.tokenPrefix}</code></td>
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
            </div>

            <form onSubmit={createJob} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>Create agent job</h3>
                <label style={label}>
                    Source mode
                    <select style={field} value={form.sourceMode} onChange={(e) => setForm((f) => ({ ...f, sourceMode: e.target.value }))}>
                        {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </label>
                <label style={label}>
                    Keyword
                    <input style={field} value={form.keyword} onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))} required />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <label style={label}>City<input style={field} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></label>
                    <label style={label}>State<input style={field} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} /></label>
                    <label style={label}>Country<input style={field} value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <label style={label}>Max pages<input type="number" min={1} max={50} style={field} value={form.maxPages} onChange={(e) => setForm((f) => ({ ...f, maxPages: Number(e.target.value) }))} /></label>
                    <label style={label}>Max companies<input type="number" min={1} max={200} style={field} value={form.maxCompanies} onChange={(e) => setForm((f) => ({ ...f, maxCompanies: Number(e.target.value) }))} /></label>
                    <label style={label}>Delay min ms<input type="number" min={500} style={field} value={form.delayMsMin} onChange={(e) => setForm((f) => ({ ...f, delayMsMin: Number(e.target.value) }))} /></label>
                    <label style={label}>Delay max ms<input type="number" min={500} style={field} value={form.delayMsMax} onChange={(e) => setForm((f) => ({ ...f, delayMsMax: Number(e.target.value) }))} /></label>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
                    <input type="checkbox" checked={form.websiteEnrichment} onChange={(e) => setForm((f) => ({ ...f, websiteEnrichment: e.target.checked }))} />
                    Website enrichment (optional, still local)
                </label>
                <button type="submit" style={btn('#2563eb')} disabled={!!busy}>{busy === 'job' ? 'Creating…' : 'Create agent job'}</button>
            </form>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>Agent jobs</h3>
                {(jobs || []).length === 0 ? <p style={{ color: '#64748b' }}>No agent jobs yet.</p> : null}
                {(jobs || []).map((j) => (
                    <div key={j._id} style={{ borderTop: '1px solid #e2e8f0', padding: '10px 0', fontSize: 13 }}>
                        <div><strong>{j.keyword || j.sourceMode}</strong> · {j.sourceMode} · <code>{j.status}</code></div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            id: {j._id} · extracted: {j.extractedCount || 0}
                            {j.discoveryJobId ? <> · <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(j.discoveryJobId)}>Open discovery job</Link></> : null}
                        </div>
                        {j.manualActionMessage ? <div style={{ color: '#9a3412' }}>Manual: {j.manualActionMessage}</div> : null}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => control(j._id, 'pause')}>Pause</button>
                            <button type="button" onClick={() => control(j._id, 'resume')}>Resume</button>
                            <button type="button" onClick={() => control(j._id, 'continue_after_manual')}>Continue after manual</button>
                            <button type="button" onClick={() => control(j._id, 'stop')}>Stop</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
