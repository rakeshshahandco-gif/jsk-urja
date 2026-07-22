import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';
import { whatsappAiApi } from '@/services/whatsappAiApi';
import { useAuth } from '@/hooks/useAuth';
import { WHATSAPP_AI_PERMISSIONS } from '../constants';

const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13, marginBottom: 8 };
const tableWrap = { width: '100%', overflowX: 'auto' };

export default function WhatsAppAIKnowledgePage() {
    const { hasPermission } = useAuth();
    const canManage = hasPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE);
    const canApprove = hasPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        whatsappAiApi.listKnowledge()
            .then((data) => setItems(data?.results || data?.items || (Array.isArray(data) ? data : [])))
            .catch((err) => toast.error(err?.response?.data?.message || 'Failed to load knowledge'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const onCreate = async () => {
        if (!canManage) return;
        try {
            // Backend forces draft + inactive; do not send active:true.
            await whatsappAiApi.createKnowledge({ title, content, approvalStatus: 'draft', active: false });
            setTitle('');
            setContent('');
            toast.success('Knowledge created as Draft / Inactive');
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Create failed');
        }
    };

    const act = async (fn, okMsg) => {
        try {
            await fn();
            toast.success(okMsg);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Action failed');
        }
    };

    return (
        <WhatsAppAiPageShell
            title="WhatsApp AI Knowledge"
            subtitle="Foundation knowledge base. New records are Draft and Inactive. AI does not use this content in Phase 1A."
            filters={['Search title', 'Status']}
            actions={[
                { label: 'Create draft', enabled: canManage && !!title.trim(), onClick: onCreate },
            ]}
        >
            {canManage ? (
                <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
                    <input style={inp} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <textarea style={{ ...inp, minHeight: 80 }} placeholder="Content" value={content} onChange={(e) => setContent(e.target.value)} />
                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>
                        New record defaults: Draft + Inactive. Activation requires Approved status via the activate endpoint.
                    </p>
                </div>
            ) : null}

            {loading ? <p style={{ color: '#64748b' }}>Loading…</p> : null}
            {!loading && items.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: 32 }}>No knowledge records yet.</p>
            ) : null}
            {items.length > 0 ? (
                <div style={tableWrap}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#64748b' }}>
                                <th style={{ padding: 8 }}>Title</th>
                                <th style={{ padding: 8 }}>Status</th>
                                <th style={{ padding: 8 }}>Active</th>
                                <th style={{ padding: 8 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((row) => (
                                <tr key={row._id || row.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8 }}>{row.title}</td>
                                    <td style={{ padding: 8 }}>{row.approvalStatus || 'draft'}</td>
                                    <td style={{ padding: 8 }}>{row.active ? 'Yes' : 'No'}</td>
                                    <td style={{ padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {canManage ? (
                                            <button type="button" onClick={() => act(() => whatsappAiApi.submitKnowledge(row._id || row.id), 'Submitted')}>Submit</button>
                                        ) : null}
                                        {canApprove ? (
                                            <>
                                                <button type="button" onClick={() => act(() => whatsappAiApi.approveKnowledge(row._id || row.id), 'Approved (still inactive)')}>Approve</button>
                                                <button type="button" onClick={() => act(() => whatsappAiApi.rejectKnowledge(row._id || row.id, { reason: 'Rejected from UI' }), 'Rejected')}>Reject</button>
                                            </>
                                        ) : null}
                                        {canManage && row.approvalStatus === 'approved' && !row.active ? (
                                            <button type="button" onClick={() => act(() => whatsappAiApi.activateKnowledge(row._id || row.id), 'Activated')}>Activate</button>
                                        ) : null}
                                        {canManage && row.active ? (
                                            <button type="button" onClick={() => act(() => whatsappAiApi.deactivateKnowledge(row._id || row.id), 'Deactivated')}>Deactivate</button>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </WhatsAppAiPageShell>
    );
}
