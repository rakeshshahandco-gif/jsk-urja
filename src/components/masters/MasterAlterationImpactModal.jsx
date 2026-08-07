import React, { useState } from 'react';
import api from '@/services/api';

/**
 * MASTER ALTERATION IMPACT preview + apply modal (Phase 2–3).
 */
export default function MasterAlterationImpactModal({
    open,
    onClose,
    masterType,
    masterId,
    proposedChanges,
    effectiveFrom: initialEffectiveFrom = '',
    onApplied,
}) {
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [reason, setReason] = useState('');
    const [effectiveFrom, setEffectiveFrom] = useState(initialEffectiveFrom || '');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [showDetails, setShowDetails] = useState(false);

    React.useEffect(() => {
        if (!open || !masterType || !masterId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            setResult(null);
            try {
                const { data } = await api.post('/master-alteration/preview', {
                    masterType,
                    masterId,
                    proposedChanges,
                    effectiveFrom: effectiveFrom || null,
                });
                if (!cancelled) setPreview(data?.data || data);
            } catch (e) {
                if (!cancelled) setError(e?.response?.data?.message || e.message || 'Preview failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, masterType, masterId, JSON.stringify(proposedChanges), effectiveFrom]);

    if (!open) return null;

    const apply = async () => {
        if (preview?.requiresReason && !String(reason).trim()) {
            setError('Reason for Alteration is required');
            return;
        }
        setApplying(true);
        setError('');
        try {
            const { data } = await api.post('/master-alteration/apply', {
                masterType,
                masterId,
                proposedChanges,
                reason,
                effectiveFrom: effectiveFrom || null,
                confirmApply: true,
            });
            const payload = data?.data || data;
            setResult(payload);
            onApplied?.(payload);
        } catch (e) {
            setError(e?.response?.data?.message || e.message || 'Apply failed');
        } finally {
            setApplying(false);
        }
    };

    const overlay = {
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    };
    const card = {
        background: '#fff',
        borderRadius: 8,
        maxWidth: 640,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
    };

    return (
        <div style={overlay} role="dialog" aria-modal="true">
            <div style={card}>
                <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>MASTER ALTERATION IMPACT</h2>
                {loading && <p>Calculating impact…</p>}
                {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

                {preview && !result && (
                    <>
                        <p style={{ margin: '4px 0' }}>
                            <strong>Master:</strong> {preview.masterName} ({preview.masterType})
                        </p>
                        <div style={{ marginTop: 12 }}>
                            <strong>Fields Changed:</strong>
                            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                                {(preview.fieldsChanged || []).map((f) => (
                                    <li key={f.field}>
                                        {f.label}: <em>{String(f.oldValue ?? 'Blank')}</em> →{' '}
                                        <em>{String(f.newValue ?? 'Blank')}</em>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {(preview.fieldsChanged || []).some((f) => f.field === 'underGroup' || f.field === 'groupName') &&
                            preview.accountingImpact && (
                            <div style={{ marginTop: 10, padding: 10, background: '#eff6ff', borderRadius: 6, fontSize: 13 }}>
                                <div><strong>Old Group:</strong> {preview.accountingImpact.currentGroup?.name || '—'}</div>
                                <div><strong>New Group:</strong> {preview.accountingImpact.proposedGroup?.name || '—'}</div>
                                <div><strong>Effective From:</strong> {effectiveFrom || preview.effectiveFrom || (preview.accountingImpact.requiresEffectiveFrom ? 'Required' : 'Immediate')}</div>
                                <div><strong>Affected FYs:</strong> {(preview.accountingImpact.financialYearsAffected || []).map((fy) => fy.financialYear).join(', ') || '—'}</div>
                                <div><strong>Open entries:</strong> {preview.accountingImpact.openFyTransactions ?? 0}</div>
                                <div><strong>Locked entries:</strong> {preview.accountingImpact.lockedFyTransactions ?? 0}</div>
                                <div><strong>Accounting:</strong> {preview.accountingImpact.accountingReportsNote || 'Per-entry-date group resolution'}</div>
                                <div><strong>P&amp;L:</strong> {preview.accountingImpact.plImpact}</div>
                                <div><strong>Balance Sheet:</strong> {preview.accountingImpact.bsImpact}</div>
                                <div><strong>Outstanding:</strong> {preview.accountingImpact.outstandingImpact}</div>
                            </div>
                        )}
                        {(preview.fieldsChanged || []).some((f) => f.field === 'hsnCode' || f.field === 'hsnSacId') && (
                            <div style={{ marginTop: 10, padding: 10, background: '#f0fdf4', borderRadius: 6, fontSize: 13 }}>
                                <div><strong>Old HSN → New HSN</strong> shown under Fields Changed above.</div>
                                <div>Open sales lines: {preview.affected?.openSalesInvoiceLines ?? 0}</div>
                                <div>Filed sales lines: {preview.affected?.filedInvoiceLines ?? 0}</div>
                                <div>E-Invoice lines: {preview.affected?.eInvoiceLines ?? preview.affected?.eInvoiced ?? 0}</div>
                                <div>Open GSTR-1 HSN: {preview.affected?.openGstr1Hsn ?? 0}</div>
                                <div>Purchase refs: {preview.affected?.purchaseReferences ?? preview.affected?.purchaseInvoiceLines ?? 0}</div>
                            </div>
                        )}
                        <div style={{ marginTop: 8 }}>
                            <strong>Affected:</strong>
                            <pre style={{ background: '#f8fafc', padding: 10, fontSize: 12, overflow: 'auto' }}>
                                {JSON.stringify(preview.affected || {}, null, 2)}
                            </pre>
                        </div>
                        {(preview.automaticAction || []).length > 0 && (
                            <div>
                                <strong>Automatic Action:</strong>
                                <ul>{preview.automaticAction.map((a) => <li key={a}>{a}</li>)}</ul>
                            </div>
                        )}
                        {(preview.protectedAction || []).length > 0 && (
                            <div>
                                <strong>Protected:</strong>
                                <ul>{preview.protectedAction.map((a) => <li key={a}>{a}</li>)}</ul>
                            </div>
                        )}
                        {(preview.requiredAction || []).length > 0 && (
                            <div>
                                <strong>Required:</strong>
                                <ul>{preview.requiredAction.map((a) => <li key={a}>{a}</li>)}</ul>
                            </div>
                        )}
                        {preview.blockReason && (
                            <p style={{ color: '#b45309', fontWeight: 600 }}>{preview.blockReason}</p>
                        )}
                        {(preview.requiresEffectiveFrom || preview.accountingImpact?.requiresEffectiveFrom) && (
                            <label style={{ display: 'block', marginTop: 8 }}>
                                Effective From Date
                                <input
                                    type="date"
                                    value={effectiveFrom ? String(effectiveFrom).slice(0, 10) : ''}
                                    onChange={(e) => setEffectiveFrom(e.target.value)}
                                    style={{ display: 'block', marginTop: 4, width: '100%', padding: 8 }}
                                />
                            </label>
                        )}
                        {preview.requiresReason && (
                            <label style={{ display: 'block', marginTop: 8 }}>
                                Reason for Alteration
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={3}
                                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                                />
                            </label>
                        )}
                        {showDetails && preview.accountingImpact && (
                            <pre style={{ fontSize: 11, background: '#f1f5f9', padding: 8 }}>
                                {JSON.stringify(preview.accountingImpact, null, 2)}
                            </pre>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                            <button type="button" onClick={onClose}>Cancel</button>
                            <button type="button" onClick={() => setShowDetails((v) => !v)}>Review Details</button>
                            <button
                                type="button"
                                disabled={!preview.canApply || applying}
                                onClick={apply}
                                style={{ fontWeight: 700 }}
                            >
                                {applying ? 'Applying…' : 'Apply Change'}
                            </button>
                        </div>
                    </>
                )}

                {result && (
                    <>
                        <p style={{ fontWeight: 700, color: '#15803d' }}>{result.message || 'Master Updated'}</p>
                        <ul>
                            {(result.summary?.resultLines || []).map((l) => (
                                <li key={l}>{l}</li>
                            ))}
                        </ul>
                        <div style={{ textAlign: 'right' }}>
                            <button type="button" onClick={onClose}>Close</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
