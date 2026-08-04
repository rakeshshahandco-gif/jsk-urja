import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { communicationHistoryApi } from '@/services/communicationHistoryApi';
import ModuleHomeBackLink from '@/features/dashboard/components/ModuleHomeBackLink';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginRight: 8 };

export default function CommunicationHistoryPage() {
    const [rows, setRows] = useState([]);
    const [channel, setChannel] = useState('');
    const [status, setStatus] = useState('');

    const load = async () => {
        try {
            const params = {};
            if (channel) params.channel = channel;
            if (status) params.status = status;
            setRows(await communicationHistoryApi.list(params));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load history');
        }
    };

    useEffect(() => { load(); }, [channel, status]);

    return (
        <div style={page}>
            <ModuleHomeBackLink to={PATHS.SETTINGS.COMMUNICATION_HOME} label="Back to Communication Home" />
            <h1>Communication History</h1>
            <p style={{ color: '#64748b', marginBottom: 16 }}>Company-wise WhatsApp and email communication logs.</p>
            <div style={{ marginBottom: 16 }}>
                <select style={inp} value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="">All channels</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                </select>
                <select style={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="skipped">Skipped</option>
                </select>
            </div>
            <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                            <th>Date</th><th>Channel</th><th>Recipient</th><th>Subject</th><th>Status</th><th>Campaign</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td>{r.sentAt ? new Date(r.sentAt).toLocaleString() : new Date(r.createdAt).toLocaleString()}</td>
                                <td>{r.channel}</td>
                                <td>{r.recipient || r.recipientEmail}</td>
                                <td>{r.subject || r.messagePreview || '—'}</td>
                                <td>{r.status}</td>
                                <td>{r.campaignName || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
