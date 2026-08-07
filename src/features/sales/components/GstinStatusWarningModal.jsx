import React from 'react';

const box = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 10000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const panel = {
    background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%', padding: 20,
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)', borderTop: '4px solid #dc2626',
};

/**
 * Sales entry GSTIN cancelled-before-invoice warning.
 */
export default function GstinStatusWarningModal({
    open,
    data,
    onConfirmB2C,
    onEnterAnotherGstin,
    onRefresh,
    onContinueWithApproval,
    onCancel,
    busy,
    canApprove,
}) {
    if (!open || !data) return null;
    return (
        <div style={box} role="dialog" aria-modal="true">
            <div style={panel}>
                <h2 style={{ margin: 0, color: '#991b1b', fontSize: 18 }}>GSTIN STATUS WARNING</h2>
                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: '#334155' }}>
                    <div><strong>GSTIN:</strong> {data.gstin || '—'}</div>
                    <div><strong>Customer:</strong> {data.customerName || '—'}</div>
                    <div><strong>Invoice Date:</strong> {data.invoiceDate ? String(data.invoiceDate).slice(0, 10) : '—'}</div>
                    <div><strong>Current GST Status:</strong> {data.currentPortalStatus || '—'}</div>
                    <div><strong>Cancellation Effective Date:</strong> {data.cancellationDate ? String(data.cancellationDate).slice(0, 10) : '—'}</div>
                    <div><strong>Status on Invoice Date:</strong> {data.statusOnTransactionDate || '—'}</div>
                    <div><strong>Recommended GST Treatment:</strong> {data.recommendedGSTTreatment || '—'}</div>
                    <div><strong>Recommended GSTR-1 Category:</strong> {data.recommendedReturnCategory || '—'}</div>
                    <div><strong>Reason:</strong> {data.resolutionReason || '—'}</div>
                </div>
                <p style={{ marginTop: 14, fontSize: 13, color: '#7f1d1d', background: '#fef2f2', padding: 10, borderRadius: 8 }}>
                    {data.warningMessage
                        || 'The recipient GSTIN was cancelled before this invoice date. This transaction should not be treated as a normal B2B supply using this GSTIN. Please confirm B2C treatment, enter another valid GSTIN, or refresh the GST status.'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                    <button type="button" disabled={busy} onClick={onConfirmB2C} style={btnDanger}>Confirm B2C for This Transaction</button>
                    <button type="button" disabled={busy} onClick={onEnterAnotherGstin} style={btnSec}>Enter Another GSTIN</button>
                    <button type="button" disabled={busy} onClick={onRefresh} style={btnSec}>Refresh GST Status</button>
                    {canApprove && (
                        <button type="button" disabled={busy} onClick={onContinueWithApproval} style={btnWarn}>Continue with Approval</button>
                    )}
                    <button type="button" disabled={busy} onClick={onCancel} style={btnGhost}>Cancel</button>
                </div>
            </div>
        </div>
    );
}

const btnDanger = { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' };
const btnSec = { background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: 'pointer' };
const btnWarn = { background: '#b45309', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' };
const btnGhost = { background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' };
