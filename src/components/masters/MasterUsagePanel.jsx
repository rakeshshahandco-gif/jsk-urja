import React, { useState } from 'react';
import api from '@/services/api';

/** View Usage / Dependencies panel for Customer / Supplier / Ledger / Item */
export default function MasterUsagePanel({ masterType, masterId, buttonLabel = 'View Usage' }) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setOpen(true);
        setLoading(true);
        setError('');
        try {
            const res = await api.get(`/master-alteration/usage/${encodeURIComponent(masterType)}/${masterId}`);
            setData(res.data?.data || res.data);
        } catch (e) {
            setError(e?.response?.data?.message || e.message || 'Failed to load usage');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button type="button" onClick={load} style={{ fontSize: 12 }}>
                {buttonLabel}
            </button>
            {open && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.4)',
                        zIndex: 9998,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            background: '#fff',
                            padding: 20,
                            borderRadius: 8,
                            maxWidth: 480,
                            width: '100%',
                            maxHeight: '80vh',
                            overflow: 'auto',
                        }}
                    >
                        <h3 style={{ marginTop: 0 }}>View Usage / Dependencies</h3>
                        <p>
                            {masterType} · {masterId}
                        </p>
                        {loading && <p>Loading…</p>}
                        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
                        {data?.counts && (
                            <ul>
                                {Object.entries(data.counts).map(([k, v]) => (
                                    <li key={k}>
                                        {k}: <strong>{v}</strong>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {data?.linkedLedgerId && (
                            <p style={{ fontSize: 12 }}>Linked ledger: {data.linkedLedgerId}</p>
                        )}
                        <button type="button" onClick={() => setOpen(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
