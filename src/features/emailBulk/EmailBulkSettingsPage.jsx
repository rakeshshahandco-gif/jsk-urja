import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { emailBulkApi } from '@/services/emailBulkApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, maxWidth: 720 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const lbl = { fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' };
const btn = { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer' };

export default function EmailBulkSettingsPage() {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(null);

    useEffect(() => {
        emailBulkApi.getSettings()
            .then(setForm)
            .catch((err) => toast.error(err.response?.data?.message || 'Failed to load settings'));
    }, []);

    const onSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await emailBulkApi.saveSettings(form);
            toast.success('Settings saved');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (!form) return <div style={page}>Loading...</div>;

    return (
        <div style={page}>
            <h1>Email Bulk Campaign Settings</h1>
            <p style={{ color: '#64748b', marginBottom: 20 }}>Company-wise rate limits and scheduler controls.</p>
            <form style={card} onSubmit={onSave}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                    <span>Enable Email Bulk Campaign module</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Daily limit</label><input style={inp} type="number" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Batch size</label><input style={inp} type="number" value={form.defaultBatchSize || form.batchSize} onChange={(e) => setForm({ ...form, defaultBatchSize: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Send window start</label><input style={inp} value={form.sendWindowStart} onChange={(e) => setForm({ ...form, sendWindowStart: e.target.value })} /></div>
                    <div><label style={lbl}>Send window end</label><input style={inp} value={form.sendWindowEnd} onChange={(e) => setForm({ ...form, sendWindowEnd: e.target.value })} /></div>
                </div>
                <div style={{ marginTop: 20 }}>
                    <button type="submit" style={btn} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
                </div>
            </form>
        </div>
    );
}
