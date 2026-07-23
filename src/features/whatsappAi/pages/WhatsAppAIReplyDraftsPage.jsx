import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';
import { whatsappAiApi } from '@/services/whatsappAiApi';
import { useAuth } from '@/hooks/useAuth';
import { WHATSAPP_AI_PERMISSIONS } from '../constants';

const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13, marginBottom: 8 };
const btn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', marginRight: 8, marginBottom: 8 };
const btnMuted = { ...btn, background: '#fff', color: '#0f766e' };
const btnDanger = { ...btn, background: '#b91c1c', borderColor: '#b91c1c' };

export default function WhatsAppAIReplyDraftsPage() {
    const { hasPermission } = useAuth();
    const canView = hasPermission(WHATSAPP_AI_PERMISSIONS.DRAFTS_VIEW);
    const canEdit = hasPermission(WHATSAPP_AI_PERMISSIONS.DRAFTS_EDIT);
    const canApprove = hasPermission(WHATSAPP_AI_PERMISSIONS.DRAFTS_APPROVE);
    const canReject = hasPermission(WHATSAPP_AI_PERMISSIONS.DRAFTS_REJECT);
    const canRegen = hasPermission(WHATSAPP_AI_PERMISSIONS.DRAFTS_REGENERATE);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState(null);
    const [editText, setEditText] = useState('');
    const [note, setNote] = useState('');
    const [rejectReason, setRejectReason] = useState('');

    const load = useCallback(() => {
        if (!canView) return;
        setLoading(true);
        whatsappAiApi.listReplyDrafts({ pendingOnly: true })
            .then((data) => setItems(data?.results || []))
            .catch((err) => toast.error(err?.response?.data?.message || 'Failed to load drafts'))
            .finally(() => setLoading(false));
    }, [canView]);

    useEffect(() => { load(); }, [load]);

    const openDraft = async (id) => {
        try {
            const data = await whatsappAiApi.getReplyDraft(id);
            setSelected(id);
            setDetail(data);
            setEditText(data?.draft?.draftText || '');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to open draft');
        }
    };

    const run = async (fn, okMsg) => {
        try {
            const data = await fn();
            toast.success(okMsg);
            if (data?.outboundSent) toast.error('Unexpected outbound send flag');
            load();
            if (selected) openDraft(selected);
            return data;
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Action failed');
            return null;
        }
    };

    return (
        <WhatsAppAiPageShell
            title="Reply Draft Review"
            subtitle="Human review queue for AI reply drafts. Approval means ready for controlled sending later — it does not send WhatsApp."
            filters={["Status: pending / edited / regen"]}
            actions={[]}
        >
            <div data-whatsapp-ai-reply-drafts="1" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(320px, 1.4fr)', gap: 16 }}>
                <div>
                    {loading ? <p style={{ color: '#64748b' }}>Loading…</p> : null}
                    {!loading && items.length === 0 ? (
                        <p style={{ color: '#64748b' }}>No pending reply drafts.</p>
                    ) : null}
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {items.map((d) => (
                            <li key={d.id} style={{ marginBottom: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => openDraft(d.id)}
                                    style={{
                                        width: '100%', textAlign: 'left', padding: 12, borderRadius: 10,
                                        border: selected === d.id ? '1px solid #0f766e' : '1px solid #e2e8f0',
                                        background: selected === d.id ? '#f0fdfa' : '#fff', cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{d.intent || 'unknown'} · {d.status}</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                        {(d.draftText || '').slice(0, 120)}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff' }}>
                    {!detail ? (
                        <p style={{ color: '#64748b' }}>Select a draft to review.</p>
                    ) : (
                        <>
                            <p style={{ fontSize: 12, color: '#9a3412', background: '#fff7ed', padding: 10, borderRadius: 8 }}>
                                Approval does not send WhatsApp. Outbound remains blocked in Phase 1D.
                            </p>
                            <h3 style={{ marginTop: 12, fontSize: 15 }}>Customer message</h3>
                            <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{detail.customerMessage?.text || '(none)'}</p>

                            <h3 style={{ fontSize: 15 }}>Detected intent</h3>
                            <p style={{ fontSize: 13 }}>{detail.draft?.intent} (confidence {detail.draft?.confidence ?? '—'})</p>

                            <h3 style={{ fontSize: 15 }}>Safety</h3>
                            <pre style={{ fontSize: 11, background: '#f8fafc', padding: 8, overflow: 'auto' }}>
                                {JSON.stringify(detail.draft?.safetyResult || detail.safetyWarnings || {}, null, 2)}
                            </pre>

                            <h3 style={{ fontSize: 15 }}>Draft text</h3>
                            <textarea
                                style={{ ...inp, minHeight: 120 }}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                disabled={!canEdit}
                                data-whatsapp-ai-draft-edit="1"
                            />

                            <div>
                                {canEdit ? (
                                    <button type="button" style={btn} onClick={() => run(() => whatsappAiApi.editReplyDraft(selected, { draftText: editText }), 'Draft saved')}>Save edit</button>
                                ) : null}
                                {canApprove ? (
                                    <button type="button" style={btn} data-whatsapp-ai-draft-approve="1" onClick={() => run(() => whatsappAiApi.approveReplyDraft(selected), 'Approved (not sent)')}>Approve</button>
                                ) : null}
                                {canReject ? (
                                    <button type="button" style={btnDanger} onClick={() => run(() => whatsappAiApi.rejectReplyDraft(selected, { reason: rejectReason }), 'Rejected')}>Reject</button>
                                ) : null}
                                {canRegen ? (
                                    <button type="button" style={btnMuted} onClick={() => run(() => whatsappAiApi.regenerateReplyDraft(selected), 'Regeneration requested')}>Request regeneration</button>
                                ) : null}
                            </div>

                            {canReject ? (
                                <input style={inp} placeholder="Rejection reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                            ) : null}

                            {canEdit ? (
                                <div style={{ marginTop: 12 }}>
                                    <input style={inp} placeholder="Internal review note" value={note} onChange={(e) => setNote(e.target.value)} />
                                    <button type="button" style={btnMuted} onClick={() => run(async () => { const r = await whatsappAiApi.addReplyDraftNote(selected, { note }); setNote(''); return r; }, 'Note added')}>Add note</button>
                                </div>
                            ) : null}

                            <h3 style={{ fontSize: 15 }}>Review notes</h3>
                            <ul style={{ fontSize: 12, color: '#475569' }}>
                                {(detail.draft?.reviewNotes || []).map((n, i) => (
                                    <li key={i}>{n.note}</li>
                                ))}
                            </ul>

                            <p style={{ fontSize: 12, color: '#64748b' }}>
                                Provider: {JSON.stringify(detail.providerStatus || {})} · outboundSent: false
                            </p>
                        </>
                    )}
                </div>
            </div>
        </WhatsAppAiPageShell>
    );
}
