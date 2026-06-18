import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { scanEntryApi } from '@/services/scanEntryApi';

export default function ScanEntryReportsPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                setData(await scanEntryApi.getReportSummary());
            } catch (err) {
                toast.error(err?.response?.data?.message || 'Failed to load reports');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <div style={{ padding: 24 }}>Loading reports…</div>;
    const s = data?.summary || {};
    return (
        <div style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Scan Entry Reports</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: 12, maxWidth: 900 }}>
                {[
                    ['Total', s.total || 0],
                    ['Pending', s.pending || 0],
                    ['Posted', s.posted || 0],
                    ['Duplicate', s.duplicate || 0],
                    ['Errors', s.errors || 0],
                ].map(([k, v]) => (
                    <div key={k} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{k}</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

