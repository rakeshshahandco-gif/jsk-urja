import React from 'react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

export function TdsLiabilityAlertModal({ open, supplierName, decision, master, onYes, onNo, loading }) {
    if (!open || !decision) return null;
    const sectionLabel = master?.sectionName
        ? `${decision.tdsSection} - ${master.sectionName}`
        : decision.tdsSection;
    return (
        <div
            role="presentation"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.55)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
            onClick={() => !loading && onNo()}
        >
            <div
                role="dialog"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 24,
                    maxWidth: 480,
                    width: '100%',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                    border: '2px solid #fecaca',
                }}
            >
                <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#991b1b' }}>TDS LIABILITY ALERT</h2>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1e293b' }}>
                    <p style={{ margin: '0 0 6px' }}><strong>Supplier:</strong> {supplierName || '-'}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>Section:</strong> {sectionLabel}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>Previous aggregate (FY, same section):</strong> {fmt(decision.cumulativeBefore)}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>Current voucher (TDS base):</strong> {fmt(decision.tdsBase)}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>New aggregate:</strong> {fmt(decision.cumulativeAfter)}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>TDS already deducted (FY, same section):</strong> {fmt(decision.cumulativeTdsDeductedBefore ?? 0)}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>Total taxable value for TDS (this withholding):</strong> {fmt(decision.taxableAmount > 0 ? decision.taxableAmount : decision.tdsBase)}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>Applicable TDS:</strong> {decision.tdsRate}%</p>
                    <p style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 0', color: '#b91c1c' }}>
                        TDS to deduct now (catch-up included if applicable): {fmt(decision.tdsAmount)}
                    </p>
                    <p style={{ margin: '8px 0 0', fontWeight: 600 }}>Net payable (after this TDS on current bill): {fmt(decision.netPayable)}</p>
                </div>
                <p style={{ margin: '16px 0', fontSize: 13 }}>Confirm TDS deduction on posting, or skip (engine skipped for this voucher).</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onNo} disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        Skip
                    </button>
                    <button type="button" onClick={onYes} disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                        {loading ? 'Saving...' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
}
