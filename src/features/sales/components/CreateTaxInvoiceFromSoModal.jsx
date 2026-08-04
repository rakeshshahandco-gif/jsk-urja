import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

function fmtCur(n) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
}

/**
 * Simple pre-confirmation only.
 * Does NOT create an invoice — Continue opens the original Tax Invoice form.
 */
export default function CreateTaxInvoiceFromSoModal({ open, so, onClose }) {
  const navigate = useNavigate();
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => cancelBtnRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open || !so) return null;

  const handleContinue = () => {
    onClose?.();
    navigate(`${PATHS.SALES.NEW_INVOICE}?soId=${so._id}`);
  };

  const handleClose = () => {
    onClose?.();
  };

  const modal = (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 10050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tax-invoice-title"
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3
            id="create-tax-invoice-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}
          >
            Create Tax Invoice?
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              cursor: 'pointer',
              color: '#64748b',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          <p style={{ margin: '0 0 14px', fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
            Please double-check the Sales Order details before proceeding to the Tax Invoice creation screen.
          </p>
          <div style={{ fontSize: 13, color: '#475569', display: 'grid', gap: 8 }}>
            <div>
              <span style={{ color: '#64748b' }}>Sales Order: </span>
              <strong>{so.soNumber || '—'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Customer: </span>
              <strong>{so.customerName || '—'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Grand Total: </span>
              <strong>{fmtCur(so.roundedTotal || so.grandTotal)}</strong>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '12px 20px 16px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={handleClose}
            style={{
              padding: '9px 16px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            style={{
              padding: '9px 16px',
              background: '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
