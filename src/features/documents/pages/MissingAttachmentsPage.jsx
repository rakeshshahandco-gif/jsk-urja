import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { voucherAttachmentApi } from '@/services/voucherAttachmentApi';
import { PATHS } from '@/routes/paths';
import DocumentsFeatureGate from '@/features/documents/DocumentsFeatureGate';

const TABS = [
    { id: 'purchase', label: 'Missing Purchase Bills' },
    { id: 'expense', label: 'Missing Expense Bills' },
    { id: 'dispatch', label: 'Missing Sales Dispatch Proof' },
];

const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

function MissingContent() {
    const navigate = useNavigate();
    const [tab, setTab] = useState('purchase');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await voucherAttachmentApi.missingReport({ category: tab, limit: 100 });
            setRows(data?.results || []);
            setMessage(data?.message || '');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load report');
        } finally {
            setLoading(false);
        }
    }, [tab]);

    useEffect(() => {
        load();
    }, [load]);

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
    const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

    const uploadFor = (row) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf,image/*';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                await voucherAttachmentApi.upload({
                    file,
                    voucherType: row.voucherType,
                    voucherId: row.voucherId,
                });
                toast.success('Attached');
                load();
            } catch (err) {
                toast.error(err.response?.data?.message || 'Upload failed');
            }
        };
        input.click();
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            <button type="button" onClick={() => navigate(PATHS.DOCUMENTS.SCAN_BILLS)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
                ← Scan Bills
            </button>
            <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Missing Attachment Report</h1>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        style={{
                            padding: '7px 14px',
                            borderRadius: 8,
                            border: tab === t.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
                            background: tab === t.id ? '#eff6ff' : '#fff',
                            color: tab === t.id ? '#2563eb' : '#475569',
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: 'pointer',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {message && <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>{message}</p>}

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                        <tr>
                            <th style={th}>Voucher No</th>
                            <th style={th}>Date</th>
                            <th style={th}>Party</th>
                            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                            <th style={th}>Status</th>
                            <th style={th}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No missing attachments in this category</td></tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.voucherId}>
                                    <td style={td}>{row.voucherNumber}</td>
                                    <td style={td}>{fmt(row.voucherDate)}</td>
                                    <td style={td}>{row.partyName}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{fmtAmt(row.amount)}</td>
                                    <td style={td}>
                                        <span style={{ padding: '3px 8px', borderRadius: 12, background: '#fffbeb', color: '#d97706', fontSize: 11, fontWeight: 700 }}>Missing</span>
                                    </td>
                                    <td style={td}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button
                                                type="button"
                                                onClick={() => navigate(`${PATHS.DOCUMENTS.MOBILE_SCAN}?voucherType=${row.voucherType}&voucherId=${row.voucherId}`)}
                                                style={{ padding: '5px 10px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Scan
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => uploadFor(row)}
                                                style={{ padding: '5px 10px', borderRadius: 6, background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Upload
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function MissingAttachmentsPage() {
    return (
        <DocumentsFeatureGate>
            <MissingContent />
        </DocumentsFeatureGate>
    );
}
