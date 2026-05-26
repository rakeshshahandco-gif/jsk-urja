import React, { useEffect, useState, useCallback } from 'react';
import { tdsComplianceApi } from '@/services/tdsComplianceApi';
import { getLedgers } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

/**
 * Create or map section-wise TDS Payable ledger (Duties & Taxes → TDS Payable).
 */
export function TdsPayableLedgerModal({ open, sectionCode, sectionName, introText, primaryButtonLabel, onClose, onSuccess }) {
    const [mode, setMode] = useState('create'); // create | map
    const [ledgerName, setLedgerName] = useState('');
    const [printName, setPrintName] = useState('');
    const [status, setStatus] = useState('Active');
    const [loading, setLoading] = useState(false);
    const [ledgerOptions, setLedgerOptions] = useState([]);
    const [mapLedgerId, setMapLedgerId] = useState('');
    const [loadingLedgers, setLoadingLedgers] = useState(false);

    const code = String(sectionCode || '').trim().toUpperCase();

    const loadSuggestion = useCallback(async () => {
        if (!code) return;
        try {
            const s = await tdsComplianceApi.getPayableLedgerSuggestion(code);
            setLedgerName(s?.suggestedName || '');
        } catch {
            setLedgerName('');
        }
    }, [code]);

    useEffect(() => {
        if (!open) return;
        setMode('create');
        setPrintName('');
        setStatus('Active');
        setMapLedgerId('');
        loadSuggestion();
    }, [open, code, loadSuggestion]);

    useEffect(() => {
        if (!open || mode !== 'map') return;
        let cancelled = false;
        (async () => {
            setLoadingLedgers(true);
            try {
                const rows = await getLedgers({ search: 'TDS', type: 'Tax' });
                const list = Array.isArray(rows) ? rows : [];
                const all = list.length ? list : await getLedgers({ search: '' });
                if (!cancelled) setLedgerOptions(Array.isArray(all) ? all : []);
            } catch {
                if (!cancelled) setLedgerOptions([]);
            } finally {
                if (!cancelled) setLoadingLedgers(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, mode]);

    if (!open || !code) return null;

    const submit = async () => {
        setLoading(true);
        try {
            if (mode === 'map') {
                if (!mapLedgerId) {
                    toast.error('Select a ledger to map');
                    setLoading(false);
                    return;
                }
                await tdsComplianceApi.createSectionPayableLedger(code, {
                    mapExistingLedgerId: mapLedgerId,
                    status,
                });
            } else {
                const n = String(ledgerName || '').trim();
                if (!n) {
                    toast.error('Enter ledger name');
                    setLoading(false);
                    return;
                }
                await tdsComplianceApi.createSectionPayableLedger(code, {
                    ledgerName: n,
                    printName: printName.trim(),
                    status,
                });
            }
            toast.success(`TDS Payable mapped for ${code}`);
            onSuccess?.();
            onClose?.();
        } catch (e) {
            toast.error(e.response?.data?.message || e.message || 'Save failed');
        } finally {
            setLoading(false);
        }
    };

    const sn = sectionName || '';

    return (
        <div
            role="presentation"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.5)',
                zIndex: 1200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
            onClick={() => !loading && onClose?.()}
        >
            <div
                role="dialog"
                aria-labelledby="tds-payable-modal-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 24,
                    maxWidth: 480,
                    width: '100%',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                    border: '1px solid #e2e8f0',
                }}
            >
                <h2 id="tds-payable-modal-title" style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>
                    TDS Payable ledger — {code}{sn ? ` (${sn})` : ''}
                </h2>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                    {introText ||
                        'Create a new ledger under Duties & Taxes → TDS Payable, or map an existing ledger. Posting always uses ledger ID so renames stay safe.'}
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button
                        type="button"
                        onClick={() => setMode('create')}
                        disabled={loading}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: mode === 'create' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: mode === 'create' ? '#eff6ff' : '#fff',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        Create new
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('map')}
                        disabled={loading}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: mode === 'map' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: mode === 'map' ? '#eff6ff' : '#fff',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        Map existing
                    </button>
                </div>

                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                    <strong>Group:</strong> Duties &amp; Taxes → TDS Payable
                </div>

                {mode === 'create' ? (
                    <>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Ledger name *</label>
                        <input
                            value={ledgerName}
                            onChange={(e) => setLedgerName(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                marginBottom: 12,
                                boxSizing: 'border-box',
                            }}
                        />
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Display name</label>
                        <input
                            value={printName}
                            onChange={(e) => setPrintName(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                marginBottom: 12,
                                boxSizing: 'border-box',
                            }}
                        />
                    </>
                ) : (
                    <>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                            Select ledger
                        </label>
                        <select
                            value={mapLedgerId}
                            onChange={(e) => setMapLedgerId(e.target.value)}
                            disabled={loadingLedgers}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                marginBottom: 12,
                                boxSizing: 'border-box',
                            }}
                        >
                            <option value="">{loadingLedgers ? 'Loading…' : '— Choose ledger —'}</option>
                            {ledgerOptions.map((L) => (
                                <option key={L._id} value={L._id}>
                                    {L.name}
                                </option>
                            ))}
                        </select>
                    </>
                )}

                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Status</label>
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        marginBottom: 20,
                        boxSizing: 'border-box',
                    }}
                >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                </select>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={() => !loading && onClose?.()}
                        disabled={loading}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={loading}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#2563eb',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                        }}
                    >
                        {loading ? 'Saving…' : primaryButtonLabel || 'Save & Map'}
                    </button>
                </div>
            </div>
        </div>
    );
}
