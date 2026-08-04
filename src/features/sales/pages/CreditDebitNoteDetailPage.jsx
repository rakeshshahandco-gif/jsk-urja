import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getCreditDebitNote,
    cancelCreditDebitNote,
    reverseCreditNoteAllocation,
} from '@/services/creditDebitNoteApi';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';

const labelStyle = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 };
const valueStyle = { fontSize: 14, fontWeight: 600, color: '#1e293b' };
const th = { padding: '12px 0', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' };
const td = { padding: '12px 0', fontSize: 14, color: '#1e293b', borderBottom: '1px solid #f1f5f9' };

export default function CreditDebitNoteDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { hasRole, hasPermission } = useAuth();
    const canReverse = hasRole('admin') || hasRole('superadmin')
        || hasPermission('accounts.bill_adjustment.reverse_note_allocation');
    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => getCreditDebitNote(id).then(setNote), [id]);

    useEffect(() => {
        reload()
            .catch(() => toast.error('Failed to load note details'))
            .finally(() => setLoading(false));
    }, [reload]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
    if (!note) return <div style={{ padding: 40, textAlign: 'center' }}>Note not found</div>;

    const handleCancel = () => {
        const reason = window.prompt('Reason for cancellation:');
        if (!reason) return;
        cancelCreditDebitNote(id, { reason })
            .then(() => {
                toast.success('Note cancelled');
                navigate(note.noteType === 'Credit Note' ? PATHS.ACCOUNTS.CREDIT_NOTES : PATHS.ACCOUNTS.DEBIT_NOTES);
            })
            .catch((e) => toast.error(e.response?.data?.message || 'Cancel failed'));
    };

    const grand = Number(note.grandTotal || note.roundedTotal || 0);
    const applied = Number(note.derivedAppliedAmount ?? note.appliedAmount ?? 0);
    const available = Number(note.availableBalance ?? Math.max(0, grand - applied));
    const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button type="button" onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
                <div style={{ display: 'flex', gap: 10 }}>
                    {note.status === 'Draft' && (
                        <button
                            type="button"
                            onClick={() => navigate(`/voucher-entry/${note.noteType === 'Credit Note' ? 'credit-notes' : 'debit-notes'}/edit/${id}`)}
                            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                        >
                            Edit Draft
                        </button>
                    )}
                    {note.status === 'Final' && (
                        <button type="button" onClick={handleCancel} style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                            Cancel Note
                        </button>
                    )}
                </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ background: note.noteType === 'Credit Note' ? '#f0fdf4' : '#eff6ff', padding: '20px 28px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: note.noteType === 'Credit Note' ? '#16a34a' : '#2563eb', textTransform: 'uppercase' }}>{note.noteType}</div>
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{note.noteNumber}</h1>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#fff', border: '1px solid #e5e7eb', display: 'inline-block' }}>{note.status}</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#64748b' }}>Date: {new Date(note.noteDate).toLocaleDateString('en-IN')}</div>
                    </div>
                </div>

                {note.noteType === 'Credit Note' && (
                    <div style={{ padding: '16px 28px', background: '#faf5ff', borderBottom: '1px solid #ede9fe', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 16 }}>
                        <div><div style={labelStyle}>Original Amount</div><div style={valueStyle}>₹{fmt(note.originalAmount ?? grand)}</div></div>
                        <div><div style={labelStyle}>Applied Amount</div><div style={valueStyle}>₹{fmt(applied)}</div></div>
                        <div><div style={labelStyle}>Available Balance (read-only)</div><div style={{ ...valueStyle, color: '#5b21b6' }}>₹{fmt(available)}</div></div>
                        <div>
                            <div style={labelStyle}>Accounting Link</div>
                            <div style={valueStyle}>{note.accountingLinkStatus || (note.linkedVoucherId ? 'Linked' : 'Not Linked')}</div>
                            {note.linkedVoucherId?.voucherNo && <div style={{ fontSize: 12, color: '#64748b' }}>{note.linkedVoucherId.voucherNo}</div>}
                        </div>
                    </div>
                )}

                <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
                    <div>
                        <div style={labelStyle}>Customer</div>
                        <div style={{ ...valueStyle, fontSize: 16 }}>{note.customerName}</div>
                    </div>
                    <div>
                        <div style={labelStyle}>Original Invoice</div>
                        <div style={valueStyle}>{note.originalInvoiceNumber || '—'}</div>
                    </div>
                    <div>
                        <div style={labelStyle}>Grand Total</div>
                        <div style={{ ...valueStyle, fontSize: 18, color: '#16a34a' }}>₹{fmt(grand)}</div>
                    </div>
                </div>

                {note.noteType === 'Credit Note' && (
                    <div style={{ padding: '0 28px 28px' }}>
                        <div style={{ ...labelStyle, marginBottom: 10 }}>Allocation History</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr>
                                    {['Invoice', 'Amount', 'Date', 'CN Voucher', 'Status', ''].map((h) => (
                                        <th key={h || 'a'} style={{ ...th, borderBottom: '2px solid #f1f5f9' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(note.allocationHistory || []).length === 0 ? (
                                    <tr><td style={td} colSpan={6}>No allocations yet.</td></tr>
                                ) : (note.allocationHistory || []).map((a) => (
                                    <tr key={a._id}>
                                        <td style={td}>{a.billNo}</td>
                                        <td style={td}>₹{fmt(a.adjustedAmount)}</td>
                                        <td style={td}>{a.adjustmentDate ? new Date(a.adjustmentDate).toLocaleDateString('en-IN') : '—'}</td>
                                        <td style={td}>{a.paymentNo}</td>
                                        <td style={td}>{a.isReversed ? 'Reversed' : 'Active'}</td>
                                        <td style={td}>
                                            {!a.isReversed && canReverse && (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const reason = window.prompt('Reversal reason?');
                                                        if (!reason?.trim()) return;
                                                        try {
                                                            await reverseCreditNoteAllocation(a._id, { reason });
                                                            toast.success('Allocation reversed');
                                                            reload();
                                                        } catch (e) {
                                                            toast.error(e.response?.data?.message || 'Reverse failed');
                                                        }
                                                    }}
                                                    style={{ border: 'none', background: 'transparent', color: '#b45309', fontWeight: 700, cursor: 'pointer' }}
                                                >
                                                    Reverse
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
