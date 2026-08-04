import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { emailBulkApi } from '@/services/emailBulkApi';
import ModuleHomeBackLink from '@/features/dashboard/components/ModuleHomeBackLink';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 };
const btn = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer' };

export default function EmailBulkHistoryPage() {
    const [rows, setRows] = useState([]);

    useEffect(() => {
        emailBulkApi.listCampaigns({ limit: 200 })
            .then(setRows)
            .catch((err) => toast.error(err.response?.data?.message || 'Failed to load history'));
    }, []);

    const onExport = async () => {
        try {
            const blob = await emailBulkApi.exportHistory();
            const url = window.URL.createObjectURL(new Blob([blob]));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'email-bulk-campaign-history.xlsx';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Export failed');
        }
    };

    return (
        <div style={page}>
            <ModuleHomeBackLink to={PATHS.SETTINGS.COMMUNICATION_HOME} label="Back to Communication Home" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h1 style={{ margin: 0 }}>Email Campaign History</h1>
                <button type="button" style={btn} onClick={onExport}>Export Excel</button>
            </div>
            <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                            <th>Campaign</th><th>Status</th><th>Total</th><th>Sent</th><th>Failed</th><th>Skipped</th><th>Started</th><th>Completed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((c) => (
                            <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td>{c.campaignName}</td>
                                <td>{c.status}</td>
                                <td>{c.totalRecipients}</td>
                                <td>{c.sentCount}</td>
                                <td>{c.failedCount}</td>
                                <td>{c.skippedCount}</td>
                                <td>{c.startedAt ? new Date(c.startedAt).toLocaleString() : '—'}</td>
                                <td>{c.completedAt ? new Date(c.completedAt).toLocaleString() : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
