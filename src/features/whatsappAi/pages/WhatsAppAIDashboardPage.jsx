import React, { useEffect, useState } from 'react';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';
import { whatsappAiApi } from '@/services/whatsappAiApi';
import { DASHBOARD_CARD_DEFS, ZERO_DASHBOARD } from '../constants';
import ConfidenceBadge from '../components/ConfidenceBadge';

const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 12,
};

const metricCard = {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '14px 16px',
    background: '#f8fafc',
};

export default function WhatsAppAIDashboardPage() {
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        whatsappAiApi.dashboardSummary()
            .then((data) => {
                if (!cancelled) {
                    setSummary({ ...ZERO_DASHBOARD, ...(data || {}) });
                    setError('');
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setSummary({ ...ZERO_DASHBOARD });
                    setError(err?.response?.data?.message || err?.message || 'Failed to load dashboard summary');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        // One-shot load only — no polling / sockets.
        return () => { cancelled = true; };
    }, []);

    const data = summary || ZERO_DASHBOARD;

    return (
        <WhatsAppAiPageShell
            title="WhatsApp AI Dashboard"
            subtitle="Company-scoped foundation metrics. Live automation is not enabled in Phase 1A."
            filters={[]}
            actions={[]}
            emptyTitle=""
            emptyMessage=""
        >
            {loading ? (
                <p style={{ color: '#64748b', margin: 0 }}>Loading dashboard…</p>
            ) : (
                <>
                    {error ? (
                        <p style={{ color: '#b45309', marginTop: 0, fontSize: 13 }}>
                            Showing zero-state ({error}). Enable the company feature and permissions to load live counts.
                        </p>
                    ) : null}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                        <ConfidenceBadge value={null} label="Sample confidence" />
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>Live processing: {String(data.liveProcessingEnabled)}</span>
                    </div>
                    <div style={grid}>
                        {DASHBOARD_CARD_DEFS.map((def) => {
                            let value = data[def.key];
                            if (def.key === 'mostAskedProduct') {
                                value = value || '—';
                            } else if (value == null) {
                                value = 0;
                            }
                            return (
                                <div key={def.key} style={metricCard}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                        {def.label}
                                    </div>
                                    <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', marginTop: 6 }}>
                                        {value}{def.suffix || ''}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </WhatsAppAiPageShell>
    );
}
