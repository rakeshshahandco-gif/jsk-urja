import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { getPurchaseInvoices, deletePurchaseInvoice, restorePurchaseInvoice } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const PAY_COLORS = {
    'Unpaid': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Partially Paid': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Paid': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    'Cancelled': { color: '#6b7280', bg: '#f9fafb', border: '#e2e8f0' },
};
const STATUS_COLORS = {
    'Confirmed': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Cancelled': { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    'Draft': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
};

const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function PurchaseInvoiceListPage() {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [payFilter, setPayFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [viewMode, setViewMode] = useState('all'); // all, active, archived
    const { selectedFY } = useFinancialYear();

    const load = useCallback(() => {
        setLoading(true);
        getPurchaseInvoices({ search, paymentStatus: payFilter, status: statusFilter, view: viewMode, includeDeleted: true, limit: 100, financialYear: selectedFY })
            .then(d => setInvoices(d.invoices || []))
            .catch((err) => {
                console.error('[PurchaseInvoiceList] Error loading invoices:', err);
                toast.error('Failed to load invoices');
            })
            .finally(() => setLoading(false));
    }, [search, payFilter, statusFilter, viewMode, selectedFY]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    const handleDelete = (id) => {
        const reason = window.prompt('Enter reason for archiving this invoice:');
        if (!reason) return;
        deletePurchaseInvoice(id, reason)
            .then(() => { toast.success('Archived'); load(); })
            .catch(e => toast.error(e.response?.data?.message || 'Delete failed'));
    };

    const handleRestore = (id) => {
        restorePurchaseInvoice(id)
            .then(() => { toast.success('Restored'); load(); })
            .catch(e => toast.error(e.response?.data?.message || 'Restore failed'));
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>🧾 Purchase Invoices</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Validated financial records with complete audit trails</p>
                </div>
                <button onClick={() => navigate(PATHS.PURCHASE.NEW_INVOICE)}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New Invoice
                </button>
            </div>

            {/* Visibility Filters */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#e2e8f0', padding: 4, borderRadius: 10, width: 'fit-content' }}>
                <button onClick={() => setViewMode('all')}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === 'all' ? '#fff' : 'transparent', color: viewMode === 'all' ? '#0f172a' : '#64748b', transition: 'all 0.2s', boxShadow: viewMode === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    All Invoices
                </button>
                <button onClick={() => setViewMode('active')}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === 'active' ? '#fff' : 'transparent', color: viewMode === 'active' ? '#0f172a' : '#64748b', transition: 'all 0.2s', boxShadow: viewMode === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    Only Active
                </button>
                <button onClick={() => setViewMode('archived')}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === 'archived' ? '#fff' : 'transparent', color: viewMode === 'archived' ? '#dc2626' : '#64748b', transition: 'all 0.2s', boxShadow: viewMode === 'archived' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    Deleted
                </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input placeholder="Search invoice / supplier..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: 260 }} />
                <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Payment Status</option>
                    {['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Statuses</option>
                    {['Draft', 'Confirmed', 'Posted', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>

                {viewMode === 'archived' && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5' }}>
                        🛡️ ARCHIVE VIEW
                    </span>
                )}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['Invoice No', 'Date', 'Supplier', 'PO Ref', 'Grand Total', 'Status', 'Payment', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: 40 }}><BrandedLoader size={80} /></td></tr>
                        ) : invoices.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No {viewMode === 'archived' ? 'archived' : ''} invoices yet.</td></tr>
                        ) : invoices.map((inv) => {
                            const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS['Unpaid'];
                            const isDeleted = inv.isDeleted;
                            return (
                                <tr key={inv._id} style={{ cursor: 'pointer', opacity: isDeleted ? 0.8 : 1, background: isDeleted ? '#fcfcfc' : 'transparent' }}
                                    onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))}
                                    onMouseEnter={e => e.currentTarget.style.background = isDeleted ? '#fcfcfc' : '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = isDeleted ? '#fcfcfc' : 'transparent'}>
                                    <td style={{ ...td, color: isDeleted ? '#94a3b8' : '#2563eb', fontWeight: 700, textDecoration: isDeleted ? 'line-through' : 'none' }}>{inv.invoiceNumber}</td>
                                    <td style={td}>{fmt(inv.invoiceDate)}</td>
                                    <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{inv.supplierName}</td>
                                    <td style={{ ...td, color: '#64748b' }}>{inv.poNumber || inv.grnNumber || '—'}</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(inv.grandTotal || 0).toLocaleString('en-IN')}</td>
                                    <td style={td}>
                                        {(() => {
                                            const sc = STATUS_COLORS[inv.status] || STATUS_COLORS['Confirmed'];
                                            return <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{inv.status}</span>
                                        })()}
                                    </td>
                                    <td style={td}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border}`, width: 'fit-content' }}>
                                                {inv.paymentStatus}
                                            </span>
                                            {isDeleted && (
                                                <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '1px 8px', borderRadius: 4, border: '1px solid #fca5a5', width: 'fit-content' }}>
                                                    🗑 DELETED
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={td} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {!isDeleted ? (
                                                <>
                                                    <button onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))}
                                                        style={{ padding: '5px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                        View
                                                    </button>
                                                    {inv.status !== 'Cancelled' && inv.paymentStatus !== 'Paid' && (
                                                        <button onClick={() => navigate(PATHS.PURCHASE.EDIT_INVOICE(inv._id))}
                                                            style={{ padding: '5px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                            ✎
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleDelete(inv._id)}
                                                        style={{ padding: '5px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                        🗑
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => handleRestore(inv._id)}
                                                    style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                                    ♻ Restore
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
