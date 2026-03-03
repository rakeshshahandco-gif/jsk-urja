import React, { useState } from 'react';
import { createPaymentEntry } from '@/services/purchaseApi';
import toast from 'react-hot-toast';

const inp = { padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const lbl = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 };

const PAYMENT_MODES = ['Cash', 'UPI', 'Cheque', 'Net Banking', 'NEFT/RTGS/IMPS', 'Card', 'Other'];
const UPI_APPS = ['GPay', 'PhonePe', 'Paytm', 'Amazon Pay', 'BHIM', 'Other'];

export default function RecordPaymentModal({ invoice, onClose, onSuccess }) {
    const today = new Date().toISOString().split('T')[0];
    const remaining = Math.max(0, (invoice.grandTotal || 0) - (invoice.paidAmount || 0));

    const [form, setForm] = useState({
        paymentMode: 'UPI',
        paymentDate: today,
        amountPaid: remaining,
        cashAccount: 'Main Cash',
        bankName: '',
        fromAccount: '',
        transactionId: '',
        upiApp: 'GPay',
        upiTransactionId: '',
        chequeNo: '',
        chequeDate: today,
        chequeStatus: 'Cleared',
        notes: '',
    });
    const [saving, setSaving] = useState(false);
    const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const mode = form.paymentMode;
    const isBank = ['Net Banking', 'NEFT/RTGS/IMPS', 'Card'].includes(mode);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.amountPaid || form.amountPaid <= 0) return toast.error('Enter a valid amount');
        if (mode === 'UPI' && !form.upiTransactionId) return toast.error('UPI Transaction ID is required');
        if (isBank && !form.transactionId) return toast.error('Transaction / UTR Number is required');
        if (isBank && !form.bankName) return toast.error('Bank Name is required');
        if (mode === 'Cheque' && !form.chequeNo) return toast.error('Cheque No is required');
        if (mode === 'Cheque' && !form.bankName) return toast.error('Bank Name is required');

        setSaving(true);
        try {
            await createPaymentEntry({ invoiceId: invoice._id, ...form });
            toast.success(`₹${form.amountPaid} recorded via ${mode}`);
            onSuccess();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to record payment');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
            <div style={{ background: '#1e293b', borderRadius: '16px', border: '1px solid #334155', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>💳 Record Payment</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>{invoice.invoiceNumber} · Total ₹{(invoice.grandTotal || 0).toLocaleString('en-IN')} · Paid ₹{(invoice.paidAmount || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>

                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8', fontSize: '13px' }}>Remaining Balance</span>
                    <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: '16px' }}>₹{remaining.toLocaleString('en-IN')}</span>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gap: '14px' }}>

                        {/* Payment Mode */}
                        <div>
                            <span style={lbl}>Payment Mode *</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {PAYMENT_MODES.map(m => (
                                    <button key={m} type="button" onClick={() => setF('paymentMode', m)}
                                        style={{ padding: '6px 14px', borderRadius: '20px', border: `2px solid ${mode === m ? '#3b82f6' : '#334155'}`, background: mode === m ? '#1e3a5f' : '#0f172a', color: mode === m ? '#60a5fa' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Date + Amount */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div><span style={lbl}>Payment Date *</span><input type="date" value={form.paymentDate} onChange={e => setF('paymentDate', e.target.value)} style={inp} required /></div>
                            <div><span style={lbl}>Amount Paid (₹) *</span><input type="number" min="0.01" step="0.01" value={form.amountPaid} onChange={e => setF('amountPaid', e.target.value)} style={inp} required /></div>
                        </div>

                        {/* CASH */}
                        {mode === 'Cash' && (
                            <div><span style={lbl}>Cash Account</span><input value={form.cashAccount} onChange={e => setF('cashAccount', e.target.value)} style={inp} placeholder="Main Cash" /></div>
                        )}

                        {/* UPI */}
                        {mode === 'UPI' && (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div><span style={lbl}>UPI App</span>
                                    <select value={form.upiApp} onChange={e => setF('upiApp', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                        {UPI_APPS.map(a => <option key={a}>{a}</option>)}
                                    </select>
                                </div>
                                <div><span style={lbl}>UPI Transaction ID *</span><input value={form.upiTransactionId} onChange={e => setF('upiTransactionId', e.target.value)} style={inp} placeholder="12-digit UPI ID" required /></div>
                            </div>
                        </>)}

                        {/* BANK / NET BANKING / NEFT */}
                        {isBank && (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div><span style={lbl}>Bank Name *</span><input value={form.bankName} onChange={e => setF('bankName', e.target.value)} style={inp} placeholder="e.g. HDFC Bank" required /></div>
                                <div><span style={lbl}>From Account (optional)</span><input value={form.fromAccount} onChange={e => setF('fromAccount', e.target.value)} style={inp} placeholder="A/C last 4 digits" /></div>
                            </div>
                            <div><span style={lbl}>Transaction / UTR Number *</span><input value={form.transactionId} onChange={e => setF('transactionId', e.target.value)} style={inp} placeholder="UTR / Reference No" required /></div>
                        </>)}

                        {/* CHEQUE */}
                        {mode === 'Cheque' && (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div><span style={lbl}>Bank Name *</span><input value={form.bankName} onChange={e => setF('bankName', e.target.value)} style={inp} placeholder="e.g. SBI" required /></div>
                                <div><span style={lbl}>Cheque No *</span><input value={form.chequeNo} onChange={e => setF('chequeNo', e.target.value)} style={inp} placeholder="Cheque number" required /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div><span style={lbl}>Cheque Date *</span><input type="date" value={form.chequeDate} onChange={e => setF('chequeDate', e.target.value)} style={inp} required /></div>
                                <div><span style={lbl}>Cheque Status</span>
                                    <select value={form.chequeStatus} onChange={e => setF('chequeStatus', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                        <option>Cleared</option><option>Pending</option><option>Bounced</option>
                                    </select>
                                </div>
                            </div>
                            {form.chequeStatus === 'Pending' && (
                                <div style={{ background: '#1c1000', border: '1px solid #f59e0b', borderRadius: '8px', padding: '10px 14px', color: '#f59e0b', fontSize: '12px' }}>
                                    ⚠️ Cheque is Pending — Invoice will show "Pending Clearance" until cheque is cleared.
                                </div>
                            )}
                        </>)}

                        {/* Notes */}
                        <div><span style={lbl}>Notes / Remarks</span><input value={form.notes} onChange={e => setF('notes', e.target.value)} style={inp} placeholder="Optional" /></div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 20px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: saving ? '#334155' : 'linear-gradient(135deg,#10b981,#0d9488)', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px' }}>
                            {saving ? 'Saving...' : '✅ Save Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
