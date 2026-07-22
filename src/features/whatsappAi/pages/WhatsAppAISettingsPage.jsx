import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';
import { whatsappAiApi } from '@/services/whatsappAiApi';
import { useAuth } from '@/hooks/useAuth';
import { WHATSAPP_AI_PERMISSIONS } from '../constants';

const lbl = { fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 };

const SAFE_KEYS = [
    'enabled', 'mode', 'defaultLanguage', 'welcomeMessage',
    'workingHoursEnabled', 'outsideWorkingHoursMessage',
    'autoLeadDraftEnabled', 'humanEscalationEnabled',
    'confidenceThresholdHigh', 'confidenceThresholdMedium', 'confidenceThresholdLow',
    'maxMessagesPerMinute', 'maxMessagesPerConversation',
];

export default function WhatsAppAISettingsPage() {
    const { hasPermission } = useAuth();
    const canManage = hasPermission(WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        whatsappAiApi.getSettings()
            .then(setForm)
            .catch((err) => setError(err?.response?.data?.message || 'Failed to load settings'));
    }, []);

    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const onSave = async (e) => {
        e.preventDefault();
        if (!canManage || !form) return;
        setSaving(true);
        try {
            const body = {};
            SAFE_KEYS.forEach((k) => {
                if (Object.prototype.hasOwnProperty.call(form, k)) body[k] = form[k];
            });
            // Phase 1A: never send unsupported live/ai modes from this page.
            if (body.mode === 'live' || body.mode === 'ai' || body.mode === 'autonomous') {
                body.mode = 'disabled';
            }
            const updated = await whatsappAiApi.updateSettings(body);
            setForm(updated);
            toast.success('Settings saved');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <WhatsAppAiPageShell
            title="WhatsApp AI Settings"
            subtitle="Company-scoped foundation settings. Mode remains disabled in Phase 1A. API secrets and WhatsApp session controls are not shown here."
            filters={[]}
            actions={[]}
        >
            {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
            {!form ? (
                <p style={{ color: '#64748b' }}>Loading settings…</p>
            ) : (
                <form onSubmit={onSave}>
                    <p style={{ fontSize: 13, color: '#9a3412', background: '#fff7ed', padding: 10, borderRadius: 8, border: '1px solid #fed7aa' }}>
                        Phase 1A: live WhatsApp processing is not activated from this screen. Default mode is <strong>disabled</strong>.
                    </p>
                    <div style={{ ...grid, marginTop: 16 }}>
                        <label>
                            <span style={lbl}>Enabled</span>
                            <input type="checkbox" checked={!!form.enabled} disabled={!canManage} onChange={(e) => set('enabled', e.target.checked)} />
                        </label>
                        <label>
                            <span style={lbl}>Mode</span>
                            <select style={inp} value={form.mode || 'disabled'} disabled={!canManage} onChange={(e) => set('mode', e.target.value)}>
                                <option value="disabled">disabled</option>
                                <option value="dry_run">dry_run</option>
                                <option value="scripted">scripted</option>
                            </select>
                        </label>
                        <label>
                            <span style={lbl}>Default language</span>
                            <input style={inp} value={form.defaultLanguage || ''} disabled={!canManage} onChange={(e) => set('defaultLanguage', e.target.value)} />
                        </label>
                        <label>
                            <span style={lbl}>Confidence high</span>
                            <input style={inp} type="number" value={form.confidenceThresholdHigh ?? 80} disabled={!canManage} onChange={(e) => set('confidenceThresholdHigh', Number(e.target.value))} />
                        </label>
                        <label>
                            <span style={lbl}>Confidence medium</span>
                            <input style={inp} type="number" value={form.confidenceThresholdMedium ?? 60} disabled={!canManage} onChange={(e) => set('confidenceThresholdMedium', Number(e.target.value))} />
                        </label>
                        <label>
                            <span style={lbl}>Confidence low</span>
                            <input style={inp} type="number" value={form.confidenceThresholdLow ?? 0} disabled={!canManage} onChange={(e) => set('confidenceThresholdLow', Number(e.target.value))} />
                        </label>
                        <label>
                            <span style={lbl}>Max messages / minute</span>
                            <input style={inp} type="number" value={form.maxMessagesPerMinute ?? 10} disabled={!canManage} onChange={(e) => set('maxMessagesPerMinute', Number(e.target.value))} />
                        </label>
                        <label>
                            <span style={lbl}>Max messages / conversation</span>
                            <input style={inp} type="number" value={form.maxMessagesPerConversation ?? 200} disabled={!canManage} onChange={(e) => set('maxMessagesPerConversation', Number(e.target.value))} />
                        </label>
                    </div>
                    <label style={{ display: 'block', marginTop: 12 }}>
                        <span style={lbl}>Welcome message</span>
                        <textarea style={{ ...inp, minHeight: 80 }} value={form.welcomeMessage || ''} disabled={!canManage} onChange={(e) => set('welcomeMessage', e.target.value)} />
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
                        <label><input type="checkbox" checked={!!form.workingHoursEnabled} disabled={!canManage} onChange={(e) => set('workingHoursEnabled', e.target.checked)} /> Working hours</label>
                        <label><input type="checkbox" checked={!!form.autoLeadDraftEnabled} disabled={!canManage} onChange={(e) => set('autoLeadDraftEnabled', e.target.checked)} /> Auto Lead Draft</label>
                        <label><input type="checkbox" checked={!!form.humanEscalationEnabled} disabled={!canManage} onChange={(e) => set('humanEscalationEnabled', e.target.checked)} /> Human escalation</label>
                    </div>
                    <label style={{ display: 'block', marginTop: 12 }}>
                        <span style={lbl}>Outside working hours message</span>
                        <textarea style={{ ...inp, minHeight: 60 }} value={form.outsideWorkingHoursMessage || ''} disabled={!canManage} onChange={(e) => set('outsideWorkingHoursMessage', e.target.value)} />
                    </label>
                    {canManage ? (
                        <button type="submit" disabled={saving} style={{ marginTop: 16, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                            {saving ? 'Saving…' : 'Save settings'}
                        </button>
                    ) : (
                        <p style={{ color: '#64748b', fontSize: 13 }}>View only — settings.manage required to save.</p>
                    )}
                </form>
            )}
        </WhatsAppAiPageShell>
    );
}
