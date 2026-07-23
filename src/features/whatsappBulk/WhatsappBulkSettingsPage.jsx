import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { whatsappBulkApi } from '@/services/whatsappBulkApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, maxWidth: 720 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const lbl = { fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' };
const btn = { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer' };

export default function WhatsappBulkSettingsPage() {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(null);

    useEffect(() => {
        whatsappBulkApi.getSettings()
            .then(setForm)
            .catch((err) => toast.error(err.response?.data?.message || 'Failed to load settings'));
    }, []);

    const onSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await whatsappBulkApi.saveSettings(form);
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
            <h1 style={{ marginBottom: 8 }}>WhatsApp Bulk Messaging Settings</h1>
            <p style={{ color: '#64748b', marginBottom: 20 }}>Company-wise module controls. Existing WhatsApp chat is not affected.</p>
            <form style={card} onSubmit={onSave}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                    <span>Enable WhatsApp Bulk Messaging module</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={form.safeModeEnabled !== false} onChange={(e) => setForm({ ...form, safeModeEnabled: e.target.checked })} />
                    <span>Safe Mode enabled (sequential sends + delays)</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={!!form.requireManualApproval} onChange={(e) => setForm({ ...form, requireManualApproval: e.target.checked })} />
                    <span>Require manual approval before queue</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={!!form.mandatoryTestSend} onChange={(e) => setForm({ ...form, mandatoryTestSend: e.target.checked })} />
                    <span>Mandatory test send before queue</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={!!form.aiAssistantEnabled} onChange={(e) => setForm({ ...form, aiAssistantEnabled: e.target.checked })} />
                    <span>Enable AI Campaign Assistant (optional, never auto-sends)</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={!!form.simulateSend} onChange={(e) => setForm({ ...form, simulateSend: e.target.checked })} />
                    <span>Simulate send (no live WhatsApp)</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                    <input type="checkbox" checked={!!form.enableFastMode} onChange={(e) => setForm({ ...form, enableFastMode: e.target.checked })} />
                    <span>Allow Fast Mode (admin only)</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Safe delay min (ms)</label><input style={inp} type="number" value={form.safeDelayMinMs} onChange={(e) => setForm({ ...form, safeDelayMinMs: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Safe delay max (ms)</label><input style={inp} type="number" value={form.safeDelayMaxMs} onChange={(e) => setForm({ ...form, safeDelayMaxMs: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Pause after messages</label><input style={inp} type="number" value={form.pauseAfterMessages} onChange={(e) => setForm({ ...form, pauseAfterMessages: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Pause duration min (ms)</label><input style={inp} type="number" value={form.pauseDurationMinMs ?? form.pauseDurationMs} onChange={(e) => setForm({ ...form, pauseDurationMinMs: Number(e.target.value), pauseDurationMs: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Pause duration max (ms)</label><input style={inp} type="number" value={form.pauseDurationMaxMs ?? form.pauseDurationMs} onChange={(e) => setForm({ ...form, pauseDurationMaxMs: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Max retry count</label><input style={inp} type="number" value={form.maxRetryCount ?? 2} onChange={(e) => setForm({ ...form, maxRetryCount: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Timezone</label><input style={inp} value={form.defaultTimezone || 'Asia/Kolkata'} onChange={(e) => setForm({ ...form, defaultTimezone: e.target.value })} /></div>
                    <div><label style={lbl}>Daily limit</label><input style={inp} type="number" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Default batch size</label><input style={inp} type="number" value={form.defaultBatchSize} onChange={(e) => setForm({ ...form, defaultBatchSize: Number(e.target.value) })} /></div>
                    <div><label style={lbl}>Send window start</label><input style={inp} value={form.sendWindowStart} onChange={(e) => setForm({ ...form, sendWindowStart: e.target.value })} /></div>
                    <div><label style={lbl}>Send window end</label><input style={inp} value={form.sendWindowEnd} onChange={(e) => setForm({ ...form, sendWindowEnd: e.target.value })} /></div>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
                    <input type="checkbox" checked={!!form.retryFailedMessages} onChange={(e) => setForm({ ...form, retryFailedMessages: e.target.checked })} />
                    <span>Retry failed messages</span>
                </label>
                <div style={{ marginTop: 20 }}>
                    <button type="submit" style={btn} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
                </div>
            </form>
        </div>
    );
}
