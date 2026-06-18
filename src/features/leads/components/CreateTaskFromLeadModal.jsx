import React, { useState } from 'react';
import { leadApi } from '@/services/leadApi';

const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function CreateTaskFromLeadModal({ open, lead, onClose, onCreated }) {
    const [title, setTitle] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState('MEDIUM');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open || !lead) return;
        const label = lead.customerName || lead.customerId?.customerName || 'Lead';
        setTitle(`Follow-up for ${label}`);
        const d = lead.nextFollowUpDate
            ? new Date(lead.nextFollowUpDate).toISOString().slice(0, 10)
            : new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
        setDueDate(d);
        setPriority('MEDIUM');
        setNotes(lead.notes || '');
        setError('');
    }, [open, lead]);

    if (!open) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!lead?._id) return;
        setSaving(true);
        setError('');
        try {
            const existing = await leadApi.tasks(lead._id);
            if (existing?.length > 0) {
                const ok = window.confirm(
                    `This lead already has ${existing.length} linked task(s). Create another follow-up task anyway?`,
                );
                if (!ok) {
                    setSaving(false);
                    return;
                }
            }
            const task = await leadApi.createTask(lead._id, {
                title,
                dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
                priority,
                remarks: notes,
                description: [
                    lead.customerMobile ? `Mobile: ${lead.customerMobile}` : '',
                    lead.source ? `Lead source: ${lead.source}` : '',
                ].filter(Boolean).join('\n'),
            });
            onCreated?.(task);
            onClose?.();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to create task');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <form
                onSubmit={handleSubmit}
                style={{
                    background: '#fff', borderRadius: 10, padding: 20, width: '100%', maxWidth: 480,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                }}
            >
                <h3 style={{ margin: '0 0 12px' }}>Create Task from Lead</h3>
                {error && <div style={{ color: '#dc2626', marginBottom: 8, fontSize: 13 }}>{error}</div>}
                <label style={lbl}>Task title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required style={inp} />
                <label style={lbl}>Due date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required style={inp} />
                <label style={lbl}>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inp}>
                    {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <label style={lbl}>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={inp} />
                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="submit" disabled={saving} style={{ background: '#1e3a8a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6 }}>
                        {saving ? 'Creating...' : 'Create Task'}
                    </button>
                </div>
            </form>
        </div>
    );
}

const lbl = { display: 'block', fontSize: 12, color: '#475569', margin: '8px 0 4px' };
const inp = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box', fontSize: 13 };
