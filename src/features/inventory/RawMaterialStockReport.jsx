import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';

const fmt = (n) => Number(n || 0).toFixed(2);
const fmtVal = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });

export default function RawMaterialStockReport() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', search: '' });
    const [summary, setSummary] = useState({ totalValue: 0, belowReorder: 0, totalItems: 0 });

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters.dateTo) params.dateTo = filters.dateTo;
            if (filters.search) params.search = filters.search;
            const res = await api.get('/stock/raw-material-report', params);
            const data = res.data || [];
            setRows(data);
            setSummary({
                totalItems: data.length,
                totalValue: data.reduce((s, r) => s + (r.stockValue || 0), 0),
                belowReorder: data.filter(r => r.belowReorder).length,
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    return (
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Raw Material Stock Report</h2>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13 }}>Opening + Purchase − Consumed − Replacement − Rejection = Closing</p>

            {/* Summary Cards */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
                {[
                    { label: 'Total Items', value: summary.totalItems, color: '#3b82f6' },
                    { label: 'Total Stock Value', value: fmtVal(summary.totalValue), color: '#10b981' },
                    { label: 'Below Reorder Level', value: summary.belowReorder, color: '#ef4444' },
                ].map(c => (
                    <div key={c.label} style={{ background: '#fff', border: `1px solid #e2e8f0`, borderRadius: 10, padding: '14px 20px', minWidth: 160, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))}
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                <span style={{ alignSelf: 'center', color: '#94a3b8' }}>to</span>
                <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))}
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                <input placeholder="Search item..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minWidth: 180 }} />
                <button onClick={fetchReport} style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Search</button>
                <button onClick={() => setFilters({ dateFrom: '', dateTo: '', search: '' })}
                    style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Reset</button>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading...</div>
            ) : (
                <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                {['#', 'Item Code', 'Item Name', 'Type', 'UOM', 'Opening', 'Purchase (GRN)', 'Consumed', 'Replacement', 'Rejection', 'Closing', 'Current Stock', 'Value (₹)', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '9px 12px', textAlign: h === '#' ? 'center' : 'left', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No items found</td></tr>
                            ) : rows.map((r, i) => (
                                <tr key={r.itemId} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '7px 12px', textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6' }}>{r.itemCode}</td>
                                    <td style={{ padding: '7px 12px', fontWeight: 500 }}>{r.itemName}</td>
                                    <td style={{ padding: '7px 12px' }}>
                                        <span style={{ fontSize: 10, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#64748b', fontWeight: 600 }}>{r.itemType || '—'}</span>
                                    </td>
                                    <td style={{ padding: '7px 12px', color: '#64748b' }}>{r.uom}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right' }}>{fmt(r.openingQty)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>+{fmt(r.purchaseQty)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#f59e0b' }}>-{fmt(r.consumedQty)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#f59e0b' }}>-{fmt(r.replacementQty)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#ef4444' }}>-{fmt(r.rejectionQty)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt(r.closingQty)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: r.belowReorder ? '#ef4444' : '#1e293b' }}>{fmt(r.currentStock)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right' }}>₹{Number(r.stockValue || 0).toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: r.belowReorder ? '#fee2e2' : '#dcfce7', color: r.belowReorder ? '#dc2626' : '#16a34a' }}>
                                            {r.belowReorder ? 'Low Stock' : 'OK'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
