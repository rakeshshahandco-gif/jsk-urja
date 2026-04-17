import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api';

const fmt = (n) => Number(n || 0).toFixed(2);
const fmtVal = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

const TYPE_LABELS = {
    GRN: 'Purchase (GRN)', WO_CONSUMPTION: 'Production Consumption', WO_OUTPUT: 'Production Output',
    COMPONENT_REPLACEMENT: 'Component Replacement', PROD_REJECTION: 'Production Rejection',
    OPENING: 'Opening Balance', ADJUSTMENT: 'Adjustment', RETURN: 'Return',
    SALES_INVOICE: 'Sales Invoice', SALES_INVOICE_CANCEL: 'Sales Return',
    REPLACEMENT_DISPATCH: 'Replacement Dispatch', FAULTY_RECEIPT: 'Faulty Receipt',
    REPAIR_INWARD: 'Repair Inward', SCRAP_ENTRY: 'Scrap', PROD_FAILURE: 'Production Failure',
    REWORK_CONSUMPTION: 'Rework Consumption', REWORK_QC_PASS: 'Rework Output',
    MODEL_CONVERSION: 'Model Conversion / Rework',
};

const TABS = [
    { key: 'raw', label: '🧱 Raw Material', color: '#3b82f6' },
    { key: 'fg', label: '📦 Finished Goods', color: '#8b5cf6' },
    { key: 'ledger', label: '📋 Movement Ledger', color: '#6366f1' },
];

const TH = (right) => ({ padding: '9px 11px', textAlign: right ? 'right' : 'left', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '2px solid currentColor', fontSize: 11, textTransform: 'uppercase' });
const TD = { padding: '7px 11px', fontSize: 13, borderBottom: '1px solid #f1f5f9' };
const TDR = { ...TD, textAlign: 'right' };

// ─── FULL PAGE ITEM DETAIL ────────────────────────────────────────────────────
function ItemDetailPage({ item, accentColor, onBack }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filter, setFilter] = useState('all'); // all | in | out

    const fetchLedger = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (dateFrom) params.dateFrom = dateFrom;
            if (dateTo) params.dateTo = dateTo;
            const res = await api.get(`/stock/ledger/${item.itemId}`, params);
            setRows(res.data?.rows || []);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [item.itemId, dateFrom, dateTo]);

    useEffect(() => { fetchLedger(); }, [item.itemId]);

    const displayed = rows.filter(r => {
        if (filter === 'in') return r.inQty > 0;
        if (filter === 'out') return r.outQty > 0;
        return true;
    });

    const totalIn = displayed.reduce((s, r) => s + (r.inQty || 0), 0);
    const totalOut = displayed.reduce((s, r) => s + (r.outQty || 0), 0);
    const totalAmt = displayed.reduce((s, r) => s + Number(r.amount || 0), 0);

    // Group by type for summary
    const byType = {};
    rows.forEach(r => {
        const label = TYPE_LABELS[r.transactionType] || r.transactionType;
        if (!byType[label]) byType[label] = { in: 0, out: 0 };
        byType[label].in += r.inQty || 0;
        byType[label].out += r.outQty || 0;
    });

    return (
        <div style={{ fontFamily: 'Inter, sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Top bar */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: `1px solid ${accentColor}`, color: accentColor, background: `${accentColor}10`, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    ← Back to List
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: accentColor }}>{item.itemCode}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{item.itemName}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{item.uom}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Full stock ledger — all inward & outward entries</p>
                </div>
                {/* Current stock badge */}
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Current Stock</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: accentColor }}>{fmt(item.currentStock)} <span style={{ fontSize: 12, color: '#94a3b8' }}>{item.uom}</span></div>
                </div>
            </div>

            <div style={{ padding: 20 }}>
                {/* Summary tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
                    {[
                        { label: 'Total Inward', value: fmt(rows.reduce((s,r)=>s+(r.inQty||0),0)), color: '#10b981', bg: '#f0fdf4', icon: '↑' },
                        { label: 'Total Outward', value: fmt(rows.reduce((s,r)=>s+(r.outQty||0),0)), color: '#ef4444', bg: '#fef2f2', icon: '↓' },
                        { label: 'Closing Balance', value: fmt(rows[rows.length-1]?.balance || item.currentStock || 0), color: accentColor, bg: `${accentColor}11`, icon: '⚖' },
                        { label: 'Stock Value', value: fmtVal(item.stockValue || 0), color: '#0d9488', bg: '#f0fdfa', icon: '₹' },
                        { label: 'Total Transactions', value: rows.length, color: '#6366f1', bg: '#eef2ff', icon: '#' },
                    ].map(t => (
                        <div key={t.label} style={{ background: t.bg, border: `1px solid ${t.color}22`, borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: 18, marginBottom: 3 }}>{t.icon}</div>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: t.color, letterSpacing: 0.5 }}>{t.label}</div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: t.color }}>{t.value}</div>
                        </div>
                    ))}
                </div>

                {/* Type-wise summary bar */}
                {Object.keys(byType).length > 0 && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 10 }}>Transaction Type Summary</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {Object.entries(byType).map(([type, vals]) => (
                                <div key={type} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: '#374151' }}>{type}</span>
                                    {vals.in > 0 && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>↑ {fmt(vals.in)}</span>}
                                    {vals.out > 0 && <span style={{ marginLeft: 6, color: '#ef4444', fontWeight: 700 }}>↓ {fmt(vals.out)}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Filter:</div>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                    <span style={{ color: '#94a3b8' }}>to</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                    <button onClick={fetchLedger} style={{ padding: '6px 14px', background: accentColor, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Apply</button>
                    <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeout(fetchLedger, 0); }} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Reset</button>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        {[['all','All'], ['in','↑ Inward Only'], ['out','↓ Outward Only']].map(([k, label]) => (
                            <button key={k} onClick={() => setFilter(k)}
                                style={{ padding: '5px 12px', border: `1px solid ${filter===k ? accentColor : '#e2e8f0'}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: filter===k ? 800 : 500, background: filter===k ? `${accentColor}15` : '#fff', color: filter===k ? accentColor : '#64748b' }}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Summary strip */}
                {displayed.length > 0 && (
                    <div style={{ display: 'flex', gap: 20, padding: '8px 14px', background: '#1e293b', borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: 700 }}>
                        <span style={{ color: '#10b981' }}>↑ Total In: {fmt(totalIn)}</span>
                        <span style={{ color: '#f87171' }}>↓ Total Out: {fmt(totalOut)}</span>
                        <span style={{ color: '#a5b4fc' }}>💰 Total: {fmtVal(totalAmt)}</span>
                        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{displayed.length} entries</span>
                    </div>
                )}

                {/* Main transaction table */}
                {loading ? (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading transactions...</div>
                ) : displayed.length === 0 ? (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                        {rows.length === 0 ? 'No transactions found for this item' : 'No transactions match the selected filter'}
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', borderRadius: '0 0 10px 10px', border: '1px solid #e2e8f0', borderTop: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: `${accentColor}18` }}>
                                    <th style={{ ...TH(), color: accentColor, borderColor: `${accentColor}44` }}>#</th>
                                    <th style={{ ...TH(), color: accentColor, borderColor: `${accentColor}44` }}>Date</th>
                                    <th style={{ ...TH(), color: accentColor, borderColor: `${accentColor}44` }}>Entry Type</th>
                                    <th style={{ ...TH(), color: accentColor, borderColor: `${accentColor}44` }}>Reference No.</th>
                                    <th style={{ ...TH(true), color: '#10b981', borderColor: `${accentColor}44` }}>Inward Qty ↑</th>
                                    <th style={{ ...TH(true), color: '#ef4444', borderColor: `${accentColor}44` }}>Outward Qty ↓</th>
                                    <th style={{ ...TH(true), color: accentColor, borderColor: `${accentColor}44` }}>Balance</th>
                                    <th style={{ ...TH(true), color: accentColor, borderColor: `${accentColor}44` }}>Rate (₹)</th>
                                    <th style={{ ...TH(true), color: accentColor, borderColor: `${accentColor}44` }}>Amount (₹)</th>
                                    <th style={{ ...TH(), color: accentColor, borderColor: `${accentColor}44` }}>Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayed.map((r, i) => {
                                    const isIn = r.inQty > 0;
                                    return (
                                        <tr key={i} style={{ background: isIn ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fff7ed', borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ ...TD, color: '#94a3b8', width: 36 }}>{i + 1}</td>
                                            <td style={{ ...TD, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(r.date)}</td>
                                            <td style={TD}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isIn ? '#dcfce7' : '#fee2e2', color: isIn ? '#15803d' : '#dc2626' }}>
                                                    {isIn ? '↑' : '↓'} {TYPE_LABELS[r.transactionType] || r.transactionType}
                                                </span>
                                            </td>
                                            <td style={{ ...TD, fontFamily: 'monospace', color: accentColor, fontWeight: 600 }}>{r.referenceNo || '—'}</td>
                                            <td style={{ ...TDR, color: '#16a34a', fontWeight: 800, fontSize: 14 }}>{isIn ? fmt(r.inQty) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                            <td style={{ ...TDR, color: '#dc2626', fontWeight: 800, fontSize: 14 }}>{r.outQty > 0 ? fmt(r.outQty) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                            <td style={{ ...TDR, fontWeight: 800, color: '#1e293b', fontSize: 14 }}>{fmt(r.balance)}</td>
                                            <td style={{ ...TDR, color: '#64748b' }}>₹{fmt(r.rate)}</td>
                                            <td style={{ ...TDR, fontWeight: 600 }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</td>
                                            <td style={{ ...TD, color: '#94a3b8', fontSize: 12, maxWidth: 200 }}>{r.remarks || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#1e293b', color: '#fff' }}>
                                    <td colSpan={4} style={{ padding: '11px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>TOTALS ({displayed.length} entries)</td>
                                    <td style={{ ...TDR, fontWeight: 900, color: '#4ade80', fontSize: 15, background: '#1e293b' }}>{fmt(totalIn)}</td>
                                    <td style={{ ...TDR, fontWeight: 900, color: '#f87171', fontSize: 15, background: '#1e293b' }}>{fmt(totalOut)}</td>
                                    <td style={{ ...TDR, fontWeight: 900, color: '#a5b4fc', fontSize: 15, background: '#1e293b' }}>{fmt(displayed[displayed.length-1]?.balance || 0)}</td>
                                    <td style={{ background: '#1e293b' }}></td>
                                    <td style={{ ...TDR, fontWeight: 800, color: '#a5b4fc', background: '#1e293b' }}>₹{totalAmt.toLocaleString('en-IN')}</td>
                                    <td style={{ background: '#1e293b' }}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── RAW MATERIAL LIST ────────────────────────────────────────────────────────
function RawMaterialSection({ onSelectItem }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem('inv_raw_filters');
        return saved ? JSON.parse(saved) : { dateFrom: '', dateTo: '', search: '' };
    });
 
    useEffect(() => {
        localStorage.setItem('inv_raw_filters', JSON.stringify(filters));
    }, [filters]);

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
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [filters]);

    const filteredRows = React.useMemo(() => {
        const s = filters.search.toLowerCase();
        return rows.filter(r => 
            !s || 
            (r.itemCode || '').toLowerCase().includes(s) || 
            (r.itemName || '').toLowerCase().includes(s)
        );
    }, [rows, filters.search]);

    const summary = React.useMemo(() => ({
        totalItems: filteredRows.length,
        totalValue: filteredRows.reduce((s, r) => s + (r.stockValue || 0), 0),
        belowReorder: filteredRows.filter(r => r.belowReorder).length
    }), [filteredRows]);

    useEffect(() => { fetchReport(); }, []);

    return (
        <div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                    { label: 'Total Items', value: summary.totalItems, color: '#3b82f6', bg: '#eff6ff' },
                    { label: 'Total Stock Value', value: fmtVal(summary.totalValue), color: '#10b981', bg: '#f0fdf4' },
                    { label: 'Below Reorder', value: summary.belowReorder, color: '#ef4444', bg: '#fef2f2' },
                ].map(c => (
                    <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}33`, borderRadius: 10, padding: '12px 20px', minWidth: 150 }}>
                        <div style={{ fontSize: 11, color: c.color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 20 }}>👆</span> Click any item to open its full ledger
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', alignItems: 'center' }}>
                <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                <span style={{ color: '#94a3b8', fontSize: 12 }}>to</span>
                <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                <input placeholder="Search item..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minWidth: 180 }} />
                <button onClick={fetchReport} style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Apply</button>
                <button onClick={() => setFilters({ dateFrom: '', dateTo: '', search: '' })} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Reset</button>
            </div>

            {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading...</div> : (
                <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#dbeafe', color: '#1e40af' }}>
                                {['#', 'Item Code', 'Item Name', 'UOM', 'Opening', '↑ Purchase', '↓ Consumed', '↑ Returned', '↓ Replacement', '↓ Rejection', 'Misc Adj.', 'Closing', 'Current Stock', 'Value (₹)', 'Status'].map((h, i) => (
                                    <th key={h} style={{ ...TH(['Opening','↑ Purchase','↓ Consumed', '↑ Returned','↓ Replacement','↓ Rejection', 'Misc Adj.', 'Closing','Current Stock','Value (₹)'].includes(h)), color: '#1e40af', borderColor: '#93c5fd' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No raw material items found</td></tr>
                            ) : filteredRows.map((r, i) => (
                                <tr key={r.itemId} onClick={() => onSelectItem(r, '#3b82f6')}
                                    style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.1s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.transform = 'scale(1.001)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f8fafc'; e.currentTarget.style.transform = ''; }}>
                                    <td style={{ ...TD, color: '#94a3b8' }}>{i + 1}</td>
                                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: '#3b82f6' }}>{r.itemCode}</td>
                                    <td style={{ ...TD }}><span style={{ fontWeight: 600 }}>{r.itemName}</span><span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8' }}>→ click to view ledger</span></td>
                                    <td style={{ ...TD, color: '#64748b' }}>{r.uom}</td>
                                    <td style={TDR}>{fmt(r.openingQty)}</td>
                                    <td style={{ ...TDR, color: '#10b981', fontWeight: 700 }}>+{fmt(r.purchaseQty)}</td>
                                    <td style={{ ...TDR, color: '#f59e0b' }}>-{fmt(r.consumedQty)}</td>
                                    <td style={{ ...TDR, color: '#10b981' }}>+{fmt(r.returnedQty)}</td>
                                    <td style={{ ...TDR, color: '#f59e0b' }}>-{fmt(r.replacementQty)}</td>
                                    <td style={{ ...TDR, color: '#ef4444' }}>-{fmt(r.rejectionQty)}</td>
                                    <td style={{ ...TDR, color: '#64748b', fontSize: 11 }}>{r.adjustmentIn > 0 ? `+${fmt(r.adjustmentIn)}` : r.adjustmentOut > 0 ? `-${fmt(r.adjustmentOut)}` : '0.00'}</td>
                                    <td style={{ ...TDR, fontWeight: 700 }}>{fmt(r.closingQty)}</td>
                                    <td style={{ ...TDR, fontWeight: 700, color: r.belowReorder ? '#ef4444' : '#1e293b' }}>{fmt(r.currentStock)}</td>
                                    <td style={TDR}>₹{Number(r.stockValue || 0).toLocaleString('en-IN')}</td>
                                    <td style={TD}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: r.belowReorder ? '#fee2e2' : '#dcfce7', color: r.belowReorder ? '#dc2626' : '#16a34a' }}>{r.belowReorder ? '⚠ Low' : '✓ OK'}</span></td>
                                </tr>
                            ))}
                        </tbody>
                                 <tr style={{ background: '#1e293b', color: '#fff' }}>
                                    <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>TOTALS</td>
                                    <td style={{ ...TDR, background: '#1e293b' }}>{fmt(filteredRows.reduce((s,r)=>s+(r.openingQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#4ade80', background: '#1e293b', fontWeight: 700 }}>+{fmt(filteredRows.reduce((s,r)=>s+(r.purchaseQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#fde68a', background: '#1e293b' }}>-{fmt(filteredRows.reduce((s,r)=>s+(r.consumedQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#4ade80', background: '#1e293b' }}>+{fmt(filteredRows.reduce((s,r)=>s+(r.returnedQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#fde68a', background: '#1e293b' }}>-{fmt(filteredRows.reduce((s,r)=>s+(r.replacementQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#fca5a5', background: '#1e293b' }}>-{fmt(filteredRows.reduce((s,r)=>s+(r.rejectionQty||0),0))}</td>
                                    <td style={{ ...TDR, fontWeight: 800, background: '#1e293b' }}>{fmt(filteredRows.reduce((s,r)=>s+(r.closingQty||0),0))}</td>
                                    <td style={{ ...TDR, fontWeight: 800, background: '#1e293b' }}>{fmt(filteredRows.reduce((s,r)=>s+(r.currentStock||0),0))}</td>
                                    <td style={{ ...TDR, fontWeight: 800, color: '#4ade80', background: '#1e293b' }}>{fmtVal(summary.totalValue)}</td>
                                    <td style={{ background: '#1e293b' }}></td>
                                </tr>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── FINISHED GOODS LIST ──────────────────────────────────────────────────────
function FinishedGoodsSection({ onSelectItem }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem('inv_fg_filters');
        return saved ? JSON.parse(saved) : { dateFrom: '', dateTo: '', search: '' };
    });
 
    useEffect(() => {
        localStorage.setItem('inv_fg_filters', JSON.stringify(filters));
    }, [filters]);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters.dateTo) params.dateTo = filters.dateTo;
            if (filters.search) params.search = filters.search;
            const res = await api.get('/stock/finished-goods-report', params);
            const data = res.data || [];
            setRows(data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [filters]);

    const filteredRows = React.useMemo(() => {
        const s = (filters.search || '').toLowerCase();
        return rows.filter(r => 
            !s || 
            (r.itemCode || '').toLowerCase().includes(s) || 
            (r.itemName || '').toLowerCase().includes(s)
        );
    }, [rows, filters.search]);

    const summary = React.useMemo(() => ({
        totalItems: filteredRows.length,
        totalValue: filteredRows.reduce((s, r) => s + (r.stockValue || 0), 0),
        belowReorder: filteredRows.filter(r => r.belowReorder).length
    }), [filteredRows]);

    useEffect(() => { fetchReport(); }, []);

    return (
        <div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                    { label: 'Total FG Items', value: summary.totalItems, color: '#8b5cf6', bg: '#f5f3ff' },
                    { label: 'Total Stock Value', value: '₹' + Number(summary.totalValue).toLocaleString('en-IN'), color: '#10b981', bg: '#f0fdf4' },
                    { label: 'Below Reorder', value: summary.belowReorder, color: '#ef4444', bg: '#fef2f2' },
                ].map(c => (
                    <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}33`, borderRadius: 10, padding: '12px 20px', minWidth: 150 }}>
                        <div style={{ fontSize: 11, color: c.color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 20 }}>👆</span> Click any item to open its full ledger
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', alignItems: 'center' }}>
                <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                <span style={{ color: '#94a3b8', fontSize: 12 }}>to</span>
                <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                <input placeholder="Search item..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minWidth: 180 }} />
                <button onClick={fetchReport} style={{ padding: '6px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Apply</button>
                <button onClick={() => setFilters({ dateFrom: '', dateTo: '', search: '' })} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Reset</button>
            </div>

            {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading...</div> : (
                <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#ede9fe', color: '#5b21b6' }}>
                                {['#', 'Item Code', 'Item Name', 'UOM', 'Opening', '↑ Production', '↑ Conv. In', '↓ Sales', '↓ Replacement', '↓ Conv. Out', 'Closing', 'Current Stock', 'Value (₹)', 'Status'].map(h => (
                                    <th key={h} style={{ ...TH(['Opening','↑ Production', '↑ Conv. In','↓ Sales','↓ Replacement', '↓ Conv. Out','Closing','Current Stock','Value (₹)'].includes(h)), color: '#5b21b6', borderColor: '#c4b5fd' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No finished goods items found</td></tr>
                            ) : filteredRows.map((r, i) => (
                                <tr key={r.itemId} onClick={() => onSelectItem(r, '#8b5cf6')}
                                    style={{ background: i % 2 === 0 ? '#fff' : '#faf5ff', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#faf5ff'; }}>
                                    <td style={{ ...TD, color: '#94a3b8' }}>{i + 1}</td>
                                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: '#8b5cf6' }}>{r.itemCode}</td>
                                    <td style={TD}><span style={{ fontWeight: 600 }}>{r.itemName}</span><span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8' }}>→ click to view ledger</span></td>
                                    <td style={{ ...TD, color: '#64748b' }}>{r.uom}</td>
                                    <td style={TDR}>{fmt(r.openingQty)}</td>
                                    <td style={{ ...TDR, color: '#10b981', fontWeight: 700 }}>+{fmt(r.productionQty)}</td>
                                    <td style={{ ...TDR, color: '#10b981' }}>+{fmt(r.conversionIn)}</td>
                                    <td style={{ ...TDR, color: '#f59e0b' }}>-{fmt(r.salesQty)}</td>
                                    <td style={{ ...TDR, color: '#ef4444' }}>-{fmt(r.replacementDispatch)}</td>
                                    <td style={{ ...TDR, color: '#ef4444' }}>-{fmt(r.conversionOut)}</td>
                                    <td style={{ ...TDR, fontWeight: 700 }}>{fmt(r.closingQty)}</td>
                                    <td style={{ ...TDR, fontWeight: 700, color: r.belowReorder ? '#ef4444' : '#1e293b' }}>{fmt(r.currentStock)}</td>
                                    <td style={TDR}>₹{Number(r.stockValue || 0).toLocaleString('en-IN')}</td>
                                    <td style={TD}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: r.belowReorder ? '#fee2e2' : '#dcfce7', color: r.belowReorder ? '#dc2626' : '#16a34a' }}>{r.belowReorder ? '⚠ Low' : '✓ OK'}</span></td>
                                </tr>
                            ))}
                        </tbody>
                                 <tr style={{ background: '#1e293b', color: '#fff' }}>
                                    <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>TOTALS</td>
                                    <td style={{ ...TDR, background: '#1e293b' }}>{fmt(filteredRows.reduce((s,r)=>s+(r.openingQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#4ade80', background: '#1e293b', fontWeight: 700 }}>+{fmt(filteredRows.reduce((s,r)=>s+(r.productionQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#4ade80', background: '#1e293b' }}>+{fmt(filteredRows.reduce((s,r)=>s+(r.conversionIn||0),0))}</td>
                                    <td style={{ ...TDR, color: '#fde68a', background: '#1e293b' }}>-{fmt(filteredRows.reduce((s,r)=>s+(r.salesQty||0),0))}</td>
                                    <td style={{ ...TDR, color: '#fca5a5', background: '#1e293b' }}>-{fmt(filteredRows.reduce((s,r)=>s+(r.replacementDispatch||0),0))}</td>
                                    <td style={{ ...TDR, color: '#fca5a5', background: '#1e293b' }}>-{fmt(filteredRows.reduce((s,r)=>s+(r.conversionOut||0),0))}</td>
                                    <td style={{ ...TDR, fontWeight: 800, background: '#1e293b' }}>{fmt(filteredRows.reduce((s,r)=>s+(r.closingQty||0),0))}</td>
                                    <td style={{ ...TDR, fontWeight: 800, background: '#1e293b' }}>{fmt(filteredRows.reduce((s,r)=>s+(r.currentStock||0),0))}</td>
                                    <td style={{ ...TDR, fontWeight: 800, color: '#a78bfa', background: '#1e293b' }}>₹{Number(summary.totalValue).toLocaleString('en-IN')}</td>
                                    <td style={{ background: '#1e293b' }}></td>
                                </tr>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── MOVEMENT LEDGER SECTION ─────────────────────────────────────────────────
function LedgerSection() {
    const [items, setItems] = useState([]);
    const [selectedItemId, setSelectedItemId] = useState(() => localStorage.getItem('inv_ledger_itemId') || '');
    const [rows, setRows] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem('inv_ledger_filters');
        return saved ? JSON.parse(saved) : { dateFrom: '', dateTo: '' };
    });
    const [search, setSearch] = useState(() => localStorage.getItem('inv_ledger_search') || '');
 
    useEffect(() => {
        localStorage.setItem('inv_ledger_itemId', selectedItemId);
        localStorage.setItem('inv_ledger_filters', JSON.stringify(filters));
        localStorage.setItem('inv_ledger_search', search);
    }, [selectedItemId, filters, search]);
 
    useEffect(() => {
        if (selectedItemId) fetchLedger(selectedItemId);
    }, []);

    useEffect(() => {
        api.get('/items', { limit: 500 }).then(res => setItems((res.data?.items || res.data || []).filter(Boolean)));
    }, []);

    const filtered = items.filter(i => !search || `${i.itemCode} ${i.itemName}`.toLowerCase().includes(search.toLowerCase()));

    const fetchLedger = async (itemId) => {
        if (!itemId) return;
        setLoading(true);
        try {
            const params = {};
            if (filters.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters.dateTo) params.dateTo = filters.dateTo;
            const res = await api.get(`/stock/ledger/${itemId}`, params);
            const d = res.data;
            setRows(d?.rows || []);
            setSelectedItem(d?.item || null);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const totalIn = rows.reduce((s, r) => s + (r.inQty || 0), 0);
    const totalOut = rows.reduce((s, r) => s + (r.outQty || 0), 0);

    return (
        <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 260px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>Select Item</div>
                    <input placeholder="Search item by code or name..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, marginBottom: 6, boxSizing: 'border-box' }} />
                    <select value={selectedItemId} onChange={e => { setSelectedItemId(e.target.value); fetchLedger(e.target.value); }} size={7}
                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: 4 }}>
                        <option value="">-- Select Item --</option>
                        {filtered.map(i => <option key={i._id} value={i._id}>{i.itemCode} — {i.itemName}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 22 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                        <span style={{ color: '#94a3b8' }}>to</span>
                        <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                        <button onClick={() => fetchLedger(selectedItemId)} style={{ padding: '6px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Go</button>
                    </div>
                    {selectedItem && (
                        <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                            <strong style={{ color: '#4f46e5' }}>{selectedItem.itemCode}</strong> — {selectedItem.itemName} ({selectedItem.uom}) &nbsp;|&nbsp;
                            Current Stock: <strong style={{ color: '#6366f1' }}>{fmt(selectedItem.currentStock)}</strong>
                        </div>
                    )}
                    {rows.length > 0 && (
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, fontWeight: 700 }}>
                            <span style={{ color: '#10b981' }}>↑ Total In: {fmt(totalIn)}</span>
                            <span style={{ color: '#ef4444' }}>↓ Total Out: {fmt(totalOut)}</span>
                        </div>
                    )}
                </div>
            </div>

            {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading...</div>
                : rows.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        {selectedItemId ? 'No transactions found' : 'Select an item to view ledger'}
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#eef2ff' }}>
                                    {['Date', 'Entry Type', 'Reference No.', 'Inward Qty ↑', 'Outward Qty ↓', 'Balance', 'Rate (₹)', 'Amount (₹)', 'Remarks'].map(h => (
                                        <th key={h} style={{ ...TH(['Inward Qty ↑','Outward Qty ↓','Balance','Rate (₹)','Amount (₹)'].includes(h)), color: '#3730a3', borderColor: '#c7d2fe' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => {
                                    const isIn = r.inQty > 0;
                                    return (
                                        <tr key={i} style={{ background: isIn ? '#f0fdf4' : '#fff7ed', borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                                            <td style={TD}><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: isIn ? '#dcfce7' : '#fee2e2', color: isIn ? '#15803d' : '#dc2626' }}>{isIn ? '↑ ' : '↓ '}{TYPE_LABELS[r.transactionType] || r.transactionType}</span></td>
                                            <td style={{ ...TD, fontFamily: 'monospace', color: '#6366f1' }}>{r.referenceNo || '—'}</td>
                                            <td style={{ ...TDR, color: '#16a34a', fontWeight: 700 }}>{isIn ? fmt(r.inQty) : '—'}</td>
                                            <td style={{ ...TDR, color: '#dc2626', fontWeight: 700 }}>{r.outQty > 0 ? fmt(r.outQty) : '—'}</td>
                                            <td style={{ ...TDR, fontWeight: 800 }}>{fmt(r.balance)}</td>
                                            <td style={{ ...TDR, color: '#64748b' }}>₹{fmt(r.rate)}</td>
                                            <td style={{ ...TDR }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</td>
                                            <td style={{ ...TD, color: '#94a3b8', fontSize: 11 }}>{r.remarks || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#1e293b', color: '#fff' }}>
                                    <td colSpan={3} style={{ padding: '10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>TOTALS</td>
                                    <td style={{ ...TDR, fontWeight: 900, color: '#4ade80', background: '#1e293b' }}>{fmt(totalIn)}</td>
                                    <td style={{ ...TDR, fontWeight: 900, color: '#f87171', background: '#1e293b' }}>{fmt(totalOut)}</td>
                                    <td style={{ ...TDR, fontWeight: 800, color: '#a5b4fc', background: '#1e293b' }}>{fmt(rows[rows.length-1]?.balance || 0)}</td>
                                    <td style={{ background: '#1e293b' }}></td>
                                    <td style={{ ...TDR, fontWeight: 700, color: '#a5b4fc', background: '#1e293b' }}>₹{rows.reduce((s,r)=>s+Number(r.amount||0),0).toLocaleString('en-IN')}</td>
                                    <td style={{ background: '#1e293b' }}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function StockMovementLedger() {
    const [tab, setTab] = useState(() => localStorage.getItem('inv_active_tab') || 'raw');
    const [detailItem, setDetailItem] = useState(null);     // { item, accentColor }
 
    useEffect(() => {
        localStorage.setItem('inv_active_tab', tab);
    }, [tab]);

    const handleSelectItem = (item, accentColor) => setDetailItem({ item, accentColor });
    const handleBack = () => setDetailItem(null);

    // Full-page detail view
    if (detailItem) {
        return <ItemDetailPage item={detailItem.item} accentColor={detailItem.accentColor} onBack={handleBack} />;
    }

    return (
        <div style={{ fontFamily: 'Inter, sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px' }}>
                <h2 style={{ margin: '0 0 3px', fontSize: 21, fontWeight: 800, color: '#1e293b' }}>Inventory Stock Reports</h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Raw Material · Finished Goods · Movement Ledger</p>
            </div>
            <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{ padding: '12px 22px', border: 'none', borderBottom: tab === t.key ? `3px solid ${t.color}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: tab === t.key ? 800 : 500, color: tab === t.key ? t.color : '#64748b', fontSize: 13.5, whiteSpace: 'nowrap' }}>
                        {t.label}
                    </button>
                ))}
            </div>
            <div style={{ padding: 24 }}>
                {tab === 'raw' && <RawMaterialSection onSelectItem={handleSelectItem} />}
                {tab === 'fg' && <FinishedGoodsSection onSelectItem={handleSelectItem} />}
                {tab === 'ledger' && <LedgerSection />}
            </div>
        </div>
    );
}
