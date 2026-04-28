import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCreditDebitNote, cancelCreditDebitNote } from '@/services/creditDebitNoteApi';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';

const labelStyle = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 };
const valueStyle = { fontSize: 14, fontWeight: 600, color: '#1e293b' };

export default function CreditDebitNoteDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getCreditDebitNote(id)
            .then(setNote)
            .catch(() => toast.error('Failed to load note details'))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
    if (!note) return <div style={{ padding: 40, textAlign: 'center' }}>Note not found</div>;

    const handleCancel = () => {
        const reason = window.prompt("Reason for cancellation:");
        if (!reason) return;
        cancelCreditDebitNote(id, { reason })
            .then(() => {
                toast.success('Note cancelled');
                navigate(note.noteType === 'Credit Note' ? PATHS.SALES.CREDIT_NOTES : PATHS.SALES.DEBIT_NOTES);
            })
            .catch(e => toast.error(e.response?.data?.message || 'Cancel failed'));
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
                <div style={{ display: 'flex', gap: 10 }}>
                    {note.status === 'Draft' && (
                        <button onClick={() => navigate(`/sales/${note.noteType === 'Credit Note' ? 'credit-notes' : 'debit-notes'}/edit/${id}`)} 
                            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                            Edit Draft
                        </button>
                    )}
                    {note.status === 'Final' && (
                        <button onClick={handleCancel} style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                            Cancel Note
                        </button>
                    )}
                    <button onClick={() => window.print()} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                        Print Note
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <div style={{ background: note.noteType === 'Credit Note' ? '#f0fdf4' : '#eff6ff', padding: '20px 28px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: note.noteType === 'Credit Note' ? '#16a34a' : '#2563eb', textTransform: 'uppercase' }}>{note.noteType}</div>
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{note.noteNumber}</h1>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#fff', border: '1px solid #e5e7eb' }}>{note.status}</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#64748b' }}>Date: {new Date(note.noteDate).toLocaleDateString('en-IN')}</div>
                    </div>
                </div>

                <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
                    <div>
                        <div style={labelStyle}>Customer</div>
                        <div style={{ ...valueStyle, fontSize: 16 }}>{note.customerName}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>GSTIN: {note.customerGstin}</div>
                    </div>
                    <div>
                        <div style={labelStyle}>Original Invoice</div>
                        <div style={valueStyle}>{note.originalInvoiceNumber}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Date: {new Date(note.originalInvoiceDate).toLocaleDateString('en-IN')}</div>
                    </div>
                    <div>
                        <div style={labelStyle}>Reason & POS</div>
                        <div style={valueStyle}>{note.reason || '—'}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>POS: {note.placeOfSupply}</div>
                    </div>
                </div>

                <div style={{ padding: '0 28px 28px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Description', 'HSN', 'Qty', 'Rate', 'Disc%', 'Taxable', 'GST', 'Amount'].map(h => (
                                    <th key={h} style={{ ...th, borderBottom: '2px solid #f1f5f9' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {note.items.map((item, i) => (
                                <tr key={i}>
                                    <td style={td}>{item.itemName}</td>
                                    <td style={td}>{item.hsnCode}</td>
                                    <td style={td}>{item.qty} {item.uom}</td>
                                    <td style={td}>₹{item.rate.toFixed(2)}</td>
                                    <td style={td}>{item.discountPercent}%</td>
                                    <td style={{ ...td, textAlign: 'right' }}>₹{item.taxableAmount.toFixed(2)}</td>
                                    <td style={td}>{item.gstRate || (item.igstRate + item.cgstRate + item.sgstRate)}%</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>₹{item.totalAmount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                        <div style={{ width: 300 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                                <span style={{ color: '#64748b' }}>Subtotal</span>
                                <span style={{ fontWeight: 600 }}>₹{note.subTotal.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                                <span style={{ color: '#64748b' }}>Freight</span>
                                <span style={{ fontWeight: 600 }}>₹{(note.freightAmount || 0).toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14, color: '#2563eb' }}>
                                <span>GST ({note.gstType})</span>
                                <span style={{ fontWeight: 600 }}>₹{note.totalGst.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '2px solid #f1f5f9', fontSize: 20, fontWeight: 900, color: '#16a34a' }}>
                                <span>Total</span>
                                <span>₹{note.roundedTotal.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 40, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={labelStyle}>Remarks</div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{note.remarks || 'No remarks provided.'}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const th = { padding: '12px 0', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' };
const td = { padding: '12px 0', fontSize: 14, color: '#1e293b', borderBottom: '1px solid #f1f5f9' };
