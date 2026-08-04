import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import api from '@/services/api';

const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const card = {
    background: '#fff', borderRadius: 12, maxWidth: 520, width: '100%',
    boxShadow: '0 20px 50px rgba(0,0,0,0.15)', padding: 24,
};
const inp = {
    padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none',
};
const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 };
const metaRow = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#334155', marginBottom: 6 };

export default function SalesInvoiceCancelDeleteModal({
    open,
    mode,
    invoiceNumber,
    salesInvoiceId,
    onClose,
    onConfirm,
    submitting,
    /** 'estimate' | 'invoice' — UI copy only; backend verifies series type */
    documentKind = 'invoice',
    estimateDate,
    customerName,
    amount,
    soId,
    soNumber,
}) {
    const [reason, setReason] = useState('');
    const [convertedAck, setConvertedAck] = useState(false);
    const [ewayBillCancelStatus, setEwayBillCancelStatus] = useState('');
    const [ewayBillCancelRef, setEwayBillCancelRef] = useState('');
    const [ewayBillCancelDate, setEwayBillCancelDate] = useState('');
    const [ewayInfo, setEwayInfo] = useState(null);

    const isCancel = mode === 'cancel';
    const isEstimate = documentKind === 'estimate';
    const isConverted = !!(soId || soNumber);

    useEffect(() => {
        if (!open) {
            setReason('');
            setConvertedAck(false);
            setEwayBillCancelStatus('');
            setEwayBillCancelRef('');
            setEwayBillCancelDate('');
            setEwayInfo(null);
            return;
        }
        if (isCancel && salesInvoiceId) {
            api.get('/eway-bills', { params: { salesInvoiceId, limit: 1 } })
                .then((res) => {
                    const payload = res.data?.data ?? res.data;
                    const list = payload?.ewayBills || (Array.isArray(payload) ? payload : []);
                    const doc = Array.isArray(list) ? list[0] : null;
                    if (doc && doc.status !== 'Cancelled') {
                        setEwayInfo(doc);
                    }
                })
                .catch(() => setEwayInfo(null));
        }
    }, [open, isCancel, salesInvoiceId]);

    if (!open) return null;

    const title = isCancel
        ? (isEstimate ? 'Cancel Estimate' : 'Cancel Invoice')
        : (isEstimate ? 'Delete Estimate?' : 'Delete Invoice');
    const confirmLabel = isCancel
        ? (isEstimate ? 'Confirm Cancel' : 'Confirm Cancel')
        : (isEstimate ? 'Confirm Delete Estimate' : 'Confirm Delete');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!reason.trim()) return;
        if (!isCancel && isEstimate && isConverted && !convertedAck) return;
        const payload = { reason: reason.trim() };
        if (isCancel) {
            if (ewayBillCancelStatus) payload.ewayBillCancelStatus = ewayBillCancelStatus;
            if (ewayBillCancelRef.trim()) payload.ewayBillCancelRef = ewayBillCancelRef.trim();
            if (ewayBillCancelDate) payload.ewayBillCancelDate = ewayBillCancelDate;
        }
        onConfirm(payload);
    };

    const deleteBlockedByConversionAck = !isCancel && isEstimate && isConverted && !convertedAck;

    return (
        <div style={overlay} onClick={onClose}>
            <div style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                        <X size={20} />
                    </button>
                </div>

                {!isCancel && isEstimate ? (
                    <div style={{ marginBottom: 16 }}>
                        <div style={metaRow}><span>Estimate Number</span><strong>{invoiceNumber || '—'}</strong></div>
                        <div style={metaRow}><span>Estimate Date</span><strong>{estimateDate || '—'}</strong></div>
                        <div style={metaRow}><span>Customer</span><strong>{customerName || '—'}</strong></div>
                        <div style={metaRow}>
                            <span>Amount</span>
                            <strong>
                                {amount != null
                                    ? `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                    : '—'}
                            </strong>
                        </div>
                        <div style={metaRow}>
                            <span>Conversion status</span>
                            <strong>{isConverted ? `Converted${soNumber ? ` → SO ${soNumber}` : ''}` : 'Not converted'}</strong>
                        </div>
                        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.55, margin: '12px 0 0' }}>
                            This Estimate will be deleted. Later Estimate numbers will remain unchanged, and a numbering gap is allowed.
                        </p>
                    </div>
                ) : (
                    <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.55, margin: '0 0 16px' }}>
                        {isCancel ? (
                            <>
                                Cancel Invoice No. <strong>{invoiceNumber}</strong>? This will permanently block this invoice number.
                                It will remain in Sales Register / GSTR document summary as <strong>CANCELLED</strong>.
                                Ledger and stock impact will be removed. This action cannot reuse the invoice number.
                            </>
                        ) : (
                            <>
                                Delete Invoice No. <strong>{invoiceNumber}</strong>? This will remove the invoice from Sales Register and GST reports
                                and release the number if it is the latest in the series. Ledger and stock impact will be removed.
                                This is different from Cancel.
                            </>
                        )}
                    </p>
                )}

                {!isCancel && isEstimate && isConverted && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: 10, padding: 12, marginBottom: 16,
                        background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
                    }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0 }} />
                            <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                                This Estimate has been converted. Deleting it will not delete or alter the linked Sales Order, Invoice,
                                Delivery Challan or other downstream document.
                            </p>
                        </div>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#78350f', fontWeight: 600 }}>
                            <input
                                type="checkbox"
                                checked={convertedAck}
                                onChange={(e) => setConvertedAck(e.target.checked)}
                                style={{ marginTop: 2 }}
                            />
                            I understand — only this Estimate will be deleted; the linked document remains unchanged.
                        </label>
                    </div>
                )}

                {isCancel && ewayInfo && (
                    <div style={{
                        display: 'flex', gap: 10, padding: 12, marginBottom: 16,
                        background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
                    }}>
                        <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0 }} />
                        <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                            E-Way Bill exists for this invoice
                            {ewayInfo.ewayBillNo ? ` (${ewayInfo.ewayBillNo})` : ''}.
                            Please confirm e-way bill cancellation/reference before cancelling invoice.
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <label style={lbl}>Reason (required)</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        required
                        style={{ ...inp, resize: 'vertical', marginBottom: 14 }}
                        placeholder={isCancel ? 'Reason for cancellation' : 'Reason for deletion'}
                    />

                    {isCancel && ewayInfo && (
                        <>
                            <label style={lbl}>E-way bill cancelled?</label>
                            <select
                                value={ewayBillCancelStatus}
                                onChange={(e) => setEwayBillCancelStatus(e.target.value)}
                                style={{ ...inp, marginBottom: 14 }}
                            >
                                <option value="">— Select —</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                            </select>
                            <label style={lbl}>E-way bill cancellation reference</label>
                            <input
                                type="text"
                                value={ewayBillCancelRef}
                                onChange={(e) => setEwayBillCancelRef(e.target.value)}
                                style={{ ...inp, marginBottom: 14 }}
                                placeholder="Reference / acknowledgement no."
                            />
                            <label style={lbl}>E-way bill cancellation date</label>
                            <input
                                type="date"
                                value={ewayBillCancelDate}
                                onChange={(e) => setEwayBillCancelDate(e.target.value)}
                                style={{ ...inp, marginBottom: 14 }}
                            />
                        </>
                    )}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !reason.trim() || deleteBlockedByConversionAck}
                            style={{
                                padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                fontWeight: 700, fontSize: 13, color: '#fff',
                                background: isCancel ? '#d97706' : '#dc2626',
                                opacity: submitting || !reason.trim() || deleteBlockedByConversionAck ? 0.6 : 1,
                            }}
                        >
                            {submitting ? 'Processing…' : confirmLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
