import React, { useState } from 'react';
import { changeInvoiceDate } from '@/services/salesApi';
import toast from 'react-hot-toast';

function toDateInput(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDisplayDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB');
}

const inp = {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    background: '#fff',
    color: '#1e293b',
};
const lbl = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#475569',
    marginBottom: 4,
};

export default function ChangeInvoiceDateModal({ inv, onClose, onSuccess }) {
    const [invoiceDate, setInvoiceDate] = useState(toDateInput(inv.invoiceDate));
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleConfirm = async () => {
        if (!invoiceDate) {
            toast.error('New invoice date is required');
            return;
        }
        if (!String(reason || '').trim()) {
            toast.error('Reason for date change is required');
            return;
        }
        setSubmitting(true);
        try {
            await changeInvoiceDate(inv._id, { invoiceDate, reason: reason.trim() });
            toast.success('Invoice date updated');
            onSuccess?.();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to change invoice date');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 460, maxWidth: '92vw', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Change Invoice Date</h3>

                <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                        <span style={lbl}>Invoice No.</span>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{inv.displayInvoiceNumber || inv.invoiceNumber}</div>
                    </div>
                    <div>
                        <span style={lbl}>Current Invoice Date</span>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{formatDisplayDate(inv.invoiceDate)}</div>
                    </div>
                    <div>
                        <label style={lbl} htmlFor="change-invoice-date-new">New Invoice Date</label>
                        <input
                            id="change-invoice-date-new"
                            type="date"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            style={inp}
                        />
                    </div>
                    <div>
                        <label style={lbl} htmlFor="change-invoice-date-reason">Reason for Date Change</label>
                        <textarea
                            id="change-invoice-date-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            required
                            placeholder="Enter the reason for changing the invoice date"
                            style={{ ...inp, resize: 'vertical' }}
                        />
                    </div>
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.5 }}>
                        Changing the invoice date may affect GST, accounting and date-based reports. Invoice number and invoice values will not change.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: 8, color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={submitting}
                        style={{ flex: 1, padding: '10px', background: '#0f766e', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer' }}
                    >
                        {submitting ? 'Saving…' : 'Confirm Change'}
                    </button>
                </div>
            </div>
        </div>
    );
}
