import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCreditDebitNotes, cancelCreditDebitNote } from '@/services/creditDebitNoteApi';
import { getInvoiceSeries } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { TableSkeleton } from '@/components/ui/BrandedLoading';
import { useFilterPersistence } from '@/hooks/useFilterPersistence';

const STATUS_COLORS = {
    'Final': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    'Cancelled': { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    'Draft': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
};

const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function CreditNoteListPage() {
    const navigate = useNavigate();
    const { hasRole } = useAuth();
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [seriesOptions, setSeriesOptions] = useState([]);
    
    const { filters, setFilter, resetFilters } = useFilterPersistence('credit-notes', {
        search: '',
        status: '',
        seriesFilter: '',
    });
    
    const { search, status, seriesFilter } = filters;

    const load = useCallback(() => {
        setLoading(true);
        getCreditDebitNotes({ 
            search, 
            status: status || undefined,
            seriesId: seriesFilter || undefined,
            noteType: 'Credit Note',
            limit: 100 
        })
            .then(data => setNotes(data.notes || []))
            .catch(() => toast.error('Failed to load credit notes'))
            .finally(() => setLoading(false));
    }, [search, status, seriesFilter]);

    useEffect(() => {
        getInvoiceSeries()
            .then(data => setSeriesOptions(data.filter(s => s.documentType === 'Credit Note') || []))
            .catch(() => { });
    }, []);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    const handleCancel = (e, note) => {
        e.stopPropagation();
        if (note.status === 'Cancelled') return;
        const reason = window.prompt("Enter reason for cancellation:");
        if (!reason) return;

        cancelCreditDebitNote(note._id, { reason })
            .then(() => { toast.success('Note cancelled.'); load(); })
            .catch(e => toast.error(e.response?.data?.message || 'Cancellation failed'));
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📜 Credit Notes</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Sales returns and GST liability reductions</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => navigate('/voucher-entry/credit-notes/new')}
                        style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                        + New Credit Note
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input placeholder="Search note / customer..." value={search} onChange={e => setFilter('search', e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: 260 }} />
                <select value={seriesFilter} onChange={e => setFilter('seriesFilter', e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Series</option>
                    {seriesOptions.map(s => <option key={s._id} value={s._id}>{s.seriesName}</option>)}
                </select>
                <select value={status} onChange={e => setFilter('status', e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Status</option>
                    {['Draft', 'Final', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>

                <button onClick={resetFilters}
                    style={{ 
                        padding: '7px 14px', borderRadius: 7, background: '#f1f5f9', color: '#64748b', 
                        border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        marginLeft: 'auto'
                    }}>
                    Reset Filters
                </button>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {loading ? (
                    <TableSkeleton rows={10} cols={8} />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                {['Note No', 'Series', 'Date', 'Customer', 'Original Inv', 'Grand Total', 'Status', 'Actions'].map(h => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {notes.length === 0 ? (
                                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No credit notes found.</td></tr>
                            ) : notes.map((note) => {
                            return (
                                <tr key={note._id} style={{ cursor: 'pointer' }}
                                    onClick={() => navigate(`/voucher-entry/credit-notes/${note._id}`)}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ ...td, color: '#2563eb', fontWeight: 700 }}>
                                        {note.noteNumber}
                                    </td>
                                    <td style={{ ...td, fontWeight: 600, color: '#475569' }}>
                                        {note.seriesId?.seriesName || '—'}
                                    </td>
                                    <td style={td}>{fmt(note.noteDate)}</td>
                                    <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{note.customerName}</td>
                                    <td style={{ ...td, color: '#64748b' }}>{note.originalInvoiceNumber || '—'}</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(note.grandTotal || 0).toLocaleString('en-IN')}</td>
                                    <td style={td}>
                                        {(() => {
                                            const sc = STATUS_COLORS[note.status] || STATUS_COLORS['Draft'];
                                            return <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{note.status}</span>
                                        })()}
                                    </td>
                                    <td style={td} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => navigate(`/voucher-entry/credit-notes/${note._id}`)}
                                                style={{ padding: '5px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                View
                                            </button>
                                            {note.status === 'Final' && (
                                                <button onClick={(e) => handleCancel(e, note)}
                                                    style={{ padding: '5px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                                                    🗑
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
