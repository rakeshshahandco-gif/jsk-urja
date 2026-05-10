import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseComparisonReport, getSuppliers } from '@/services/purchaseApi';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui';
import styles from './CustomerMasterReport.module.scss';

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
const inr = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inp = {
    padding: '6px 10px',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    color: '#1e293b',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    height: 34,
};

const PO_STATUS_COLORS = {
    'Ordered': { color: '#2563eb', bg: '#dbeafe' },
    'Partially Received': { color: '#d97706', bg: '#fef3c7' },
    'Fully Received': { color: '#16a34a', bg: '#dcfce7' },
    'Direct GRN': { color: '#b45309', bg: '#fef9c3' },
    'Closed': { color: '#6b7280', bg: '#f3f4f6' },
};

export default function PurchaseComparisonReportPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        supplierId: '',
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0],
    });

    useEffect(() => {
        getSuppliers({ limit: 200 }).then(d => setSuppliers(d.suppliers || [])).catch(() => { });
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        const params = {};
        if (filters.supplierId) params.supplierId = filters.supplierId;
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;

        getPurchaseComparisonReport(params)
            .then(d => { setRows(d.rows || []); setSummary(d.summary || null); })
            .catch(() => toast.error('Failed to load report'))
            .finally(() => setLoading(false));
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    const summaryCards = summary ? [
        { label: 'Total PO Value', value: inr(summary.totalOrderedValue), color: '#2563eb', bg: '#eff6ff' },
        { label: 'Total Received Value', value: inr(summary.totalReceivedValue), color: '#16a34a', bg: '#f0fdf4' },
        { label: 'Total Invoiced Value', value: inr(summary.totalInvoicedValue), color: '#7c3aed', bg: '#f5f3ff' },
        { label: 'Pending (Unreceived)', value: inr(summary.totalPendingValue), color: '#ea580c', bg: '#fff7ed' },
    ] : [];

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>
                    Purchase Comparison Report
                    <span className={styles.subtitle}> — PO vs GRN vs Invoice: ordered, received, invoiced quantities &amp; rate differences</span>
                </h1>
            </div>
            <div style={{ maxWidth: 1400, margin: '0 auto' }}>

                {/* Filters */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Supplier</div>
                        <select value={filters.supplierId} onChange={e => setF('supplierId', e.target.value)} style={{ ...inp, minWidth: 200, cursor: 'pointer', appearance: 'none', paddingRight: 28, backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '1em' }}>
                            <option value="">All Suppliers</option>
                            {suppliers.map(s => <option key={s._id} value={s._id}>{s.supplierName}</option>)}
                        </select>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>From Date</div>
                        <input type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} style={inp} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>To Date</div>
                        <input type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} style={inp} />
                    </div>
                    <button onClick={load} disabled={loading} style={{ height: 34, padding: '0 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {loading ? <BrandedLoader size={20} inline /> : 'Apply Filters'}
                    </button>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                        {summaryCards.map(({ label, value, color, bg }) => (
                            <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 10, padding: '14px 18px' }}>
                                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
                                <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Table */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f9fafb' }}>
                                    {['PO / Date', 'Supplier', 'PO Status', 'Item', 'UOM',
                                        'Ordered Qty', 'Received Qty', 'Invoiced Qty', 'Pending Qty',
                                        'PO Rate', 'Inv Rate', 'Rate Diff'].map(h => (
                                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.025em' }}>{h}</th>
                                        ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={12} style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}><BrandedLoader size={80} /></td></tr>
                                ) : rows.length === 0 ? (
                                    <tr><td colSpan={12} style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
                                        No data found for the selected filters.
                                    </td></tr>
                                ) : rows.map((row, i) => {
                                    const sc = PO_STATUS_COLORS[row.poStatus] || { color: '#6b7280', bg: '#f3f4f6' };
                                    const rateDiffColor = row.rateDiff === null ? '#9ca3af' : row.rateDiff > 0 ? '#dc2626' : row.rateDiff < 0 ? '#16a34a' : '#6b7280';
                                    const pendingPct = row.orderedQty > 0 ? Math.round((row.pendingQty / row.orderedQty) * 100) : 0;
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s' }}
                                            onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ color: '#2563eb', fontWeight: 700, fontSize: 13 }}>{row.poNumber}</div>
                                                <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>{fmt(row.poDate)}</div>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{row.supplier}</div>
                                                <div style={{ color: '#9ca3af', fontSize: 11 }}>{row.supplierCode}</div>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{row.poStatus}</span>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{row.itemName}</div>
                                                <div style={{ color: '#9ca3af', fontSize: 11 }}>{row.itemCode}</div>
                                            </td>
                                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.uom}</td>
                                            <td style={{ padding: '10px 12px', color: '#2563eb', fontWeight: 700 }}>{row.orderedQty || '—'}</td>
                                            <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 700 }}>{row.receivedQty}</td>
                                            <td style={{ padding: '10px 12px', color: '#7c3aed', fontWeight: 700 }}>{row.invoicedQty}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {row.pendingQty > 0 ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fff7ed', color: '#ea580c', fontWeight: 700, fontSize: 11 }}>{row.pendingQty}</span>
                                                        {row.orderedQty > 0 && <span style={{ color: '#dc2626', fontSize: 10 }}>({pendingPct}%)</span>}
                                                    </span>
                                                ) : (
                                                    <span style={{ padding: '2px 8px', borderRadius: 10, background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: 11 }}>✓</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{inr(row.poRate)}</td>
                                            <td style={{ padding: '10px 12px', color: '#1e293b' }}>{row.invoiceRate !== null ? inr(row.invoiceRate) : '—'}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {row.rateDiff !== null ? (
                                                    <span style={{ color: rateDiffColor, fontWeight: 700 }}>
                                                        {row.rateDiff > 0 ? '+' : ''}{row.rateDiff.toFixed(2)}
                                                    </span>
                                                ) : <span style={{ color: '#9ca3af' }}>—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {rows.length > 0 && summary && (
                                <tfoot>
                                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e5e7eb' }}>
                                        <td colSpan={5} style={{ padding: '10px 12px', color: '#6b7280', fontWeight: 700, fontSize: 12 }}>
                                            TOTALS ({summary.totalRows} rows)
                                        </td>
                                        <td style={{ padding: '10px 12px', color: '#2563eb', fontWeight: 800 }}>{inr(summary.totalOrderedValue)}</td>
                                        <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 800 }}>{inr(summary.totalReceivedValue)}</td>
                                        <td style={{ padding: '10px 12px', color: '#7c3aed', fontWeight: 800 }}>{inr(summary.totalInvoicedValue)}</td>
                                        <td style={{ padding: '10px 12px', color: '#ea580c', fontWeight: 800 }}>{inr(summary.totalPendingValue)}</td>
                                        <td colSpan={3}></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Legend */}
                <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11, color: '#6b7280' }}>
                    <span>🔵 Ordered Qty</span>
                    <span>🟢 Received Qty (stock updated)</span>
                    <span>🟣 Invoiced Qty (billed)</span>
                    <span>🟠 Pending Qty = Ordered − Received</span>
                    <span style={{ color: '#dc2626' }}>Rate Diff (+) = Invoice higher than PO</span>
                    <span style={{ color: '#16a34a' }}>Rate Diff (−) = Invoice lower than PO</span>
                </div>
            </div>
        </div>
    );
}
