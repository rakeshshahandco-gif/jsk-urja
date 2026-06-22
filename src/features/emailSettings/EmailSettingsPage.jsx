import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { emailSettingsApi } from '@/services/emailSettingsApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, maxWidth: 720 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const lbl = { fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' };
const btn = { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer', marginRight: 8 };
const btnSec = { ...btn, background: '#475569' };

const emptyForm = {
    provider: 'gmail',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    secure: true,
    authUser: '',
    authPass: '',
    fromEmail: '',
    senderName: '',
    replyTo: '',
    enabled: false,
};

export default function EmailSettingsPage() {
    const [form, setForm] = useState(emptyForm);
    const [providers, setProviders] = useState([]);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        Promise.all([emailSettingsApi.getSettings(), emailSettingsApi.getProviders()])
            .then(([settings, meta]) => {
                setForm({ ...emptyForm, ...settings, authPass: '' });
                setProviders(meta?.providers || []);
            })
            .catch((err) => toast.error(err.response?.data?.message || 'Failed to load settings'));
    }, []);

    const onProviderChange = (provider) => {
        setForm((f) => ({ ...f, provider }));
    };

    const onSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form };
            if (!payload.authPass) delete payload.authPass;
            const saved = await emailSettingsApi.saveSettings(payload);
            setForm({ ...emptyForm, ...saved, authPass: '' });
            toast.success('Email settings saved');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const onTest = async () => {
        setTesting(true);
        try {
            const payload = { ...form };
            if (!payload.authPass) delete payload.authPass;
            await emailSettingsApi.testConnection(payload);
            toast.success('SMTP connection successful');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Connection test failed');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={page}>
            <h1>Email Settings</h1>
            <p style={{ color: '#64748b', marginBottom: 20 }}>Company-wise SMTP configuration. Credentials are stored encrypted.</p>
            <form style={card} onSubmit={onSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={lbl}>Provider</label>
                        <select style={inp} value={form.provider} onChange={(e) => onProviderChange(e.target.value)}>
                            {(providers.length ? providers : ['gmail', 'google_workspace', 'outlook', 'microsoft365', 'zoho', 'custom_smtp']).map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>From email</label>
                        <input style={inp} value={form.fromEmail || ''} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} required />
                    </div>
                    <div>
                        <label style={lbl}>SMTP host</label>
                        <input style={inp} value={form.smtpHost || ''} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
                    </div>
                    <div>
                        <label style={lbl}>SMTP port</label>
                        <input style={inp} type="number" value={form.smtpPort || 587} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} />
                    </div>
                    <div>
                        <label style={lbl}>Auth user</label>
                        <input style={inp} value={form.authUser || ''} onChange={(e) => setForm({ ...form, authUser: e.target.value })} />
                    </div>
                    <div>
                        <label style={lbl}>Auth password {form.authPassMasked ? `(saved: ${form.authPassMasked})` : ''}</label>
                        <input style={inp} type="password" value={form.authPass || ''} onChange={(e) => setForm({ ...form, authPass: e.target.value })} placeholder="Leave blank to keep existing" />
                    </div>
                    <div>
                        <label style={lbl}>Sender name</label>
                        <input style={inp} value={form.senderName || ''} onChange={(e) => setForm({ ...form, senderName: e.target.value })} />
                    </div>
                    <div>
                        <label style={lbl}>Reply-to</label>
                        <input style={inp} value={form.replyTo || ''} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
                    </div>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
                    <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                    <span>Enable email for this company</span>
                </label>
                <div style={{ marginTop: 20 }}>
                    <button type="button" style={btnSec} onClick={onTest} disabled={testing}>{testing ? 'Testing...' : 'Test Connection'}</button>
                    <button type="submit" style={btn} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
                </div>
            </form>
        </div>
    );
}
