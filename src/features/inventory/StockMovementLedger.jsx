import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../config/api';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVal = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TABS = [
    { key: 'raw', label: '🧱 Raw Material', color: '#3b82f6' },
    { key: 'fg', label: '📦 Finished Goods', color: '#8b5cf6' },
    { key: 'consumable', label: '🛠 Consumables', color: '#f59e0b' },
    { key: 'ledger', label: '📋 Stock Ledger', color: '#6366f1' },
];

const TH = (right) => ({ 
    padding: '10px 12px', 
    textAlign: right ? 'right' : 'left', 
    fontWeight: 800, 
    whiteSpace: 'nowrap', 
    borderBottom: '2px solid #e2e8f0', 
    fontSize: 10, 
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#475569'
});

const TD = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b' };
const TDR = { ...TD, textAlign: 'right' };

// ─── LEDGER TABLE ROW COMPONENT ──────────────────────────────────────────────
function LedgerRow({ row, i }) {
    const isIn = row.inQty > 0;
    const isOut = row.outQty > 0;
    
    return (
        <tr style={{ 
            background: i % 2 === 0 ? '#fff' : '#f8fafc',
            borderBottom: '1px solid #f1f5f9',
            transition: 'all 0.1s'
        }}>
            <td style={{ ...TD, color: '#94a3b8', width: 30 }}>{i + 1}</td>
            <td style={{ ...TD, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(row.date)}</td>
            <td style={TD}>
                <div style={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>{row.voucherType}</div>
            </td>
            <td style={TD}>
                <div style={{ fontSize: 11, color: '#1e293b', fontWeight: 600 }}>{row.referenceNo}</div>
            </td>
            <td style={TD}>
                {row.partyName ? (
                    <div>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.partyName}</div>
                        {row.partyCode && <div style={{ fontSize: 10, color: '#94a3b8' }}>{row.partyCode}</div>}
                    </div>
                ) : <span style={{ color: '#cbd5e1' }}>—</span>}
            </td>
            
            {/* Inward Section */}
            <td style={{ ...TDR, color: '#16a34a', fontWeight: 700, background: isIn ? '#f0fdf4' : 'transparent' }}>{isIn ? fmt(row.inQty) : '—'}</td>
            <td style={{ ...TDR, color: '#16a34a', background: isIn ? '#f0fdf4' : 'transparent' }}>{isIn ? '₹'+fmt(row.rate) : '—'}</td>
            <td style={{ ...TDR, color: '#16a34a', fontWeight: 800, background: isIn ? '#f0fdf4' : 'transparent' }}>{isIn ? fmtVal(row.amount) : '—'}</td>

            {/* Outward Section */}
            <td style={{ ...TDR, color: '#dc2626', fontWeight: 700, background: isOut ? '#fef2f2' : 'transparent' }}>{isOut ? fmt(row.outQty) : '—'}</td>
            <td style={{ ...TDR, color: '#dc2626', background: isOut ? '#fef2f2' : 'transparent' }}>{isOut ? '₹'+fmt(row.rate) : '—'}</td>
            <td style={{ ...TDR, color: '#dc2626', fontWeight: 800, background: isOut ? '#fef2f2' : 'transparent' }}>{isOut ? fmtVal(row.amount) : '—'}</td>

            <td style={{ ...TDR, fontWeight: 900, color: '#1e293b', fontSize: 14 }}>{fmt(row.runningStock)}</td>
            <td style={{ ...TD, color: '#64748b', fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.remarks || '—'}</td>
        </tr>
    );
}

// ─── COMPREHENSIVE STOCK LEDGER VIEW ─────────────────────────────────────────
function ComprehensiveLedger({ initialItemId = '', accentColor = '#6366f1' }) {
    const [items, setItems] = useState([]);
    const [selectedItemId, setSelectedItemId] = useState(initialItemId);
    const [data, setData] = useState({ summary: {}, rows: [] });
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0],
        search: '',
        includeCancelled: false,
        partyId: ''
    });
    const [rebuildLogs, setRebuildLogs] = useState(null);
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [parties, setParties] = useState([]);

    useEffect(() => {
        api.get('/items', { limit: 1000 }).then(res => setItems(res.data?.items || []));
        api.get('/customers', { limit: 1000 }).then(res => {
            const custs = (res.data?.customers || []).map(c => ({ _id: c._id, name: c.customerName, type: 'Customer' }));
            api.get('/suppliers', { limit: 1000 }).then(res2 => {
                const supps = (res2.data?.suppliers || []).map(s => ({ _id: s._id, name: s.supplierName, type: 'Supplier' }));
                setParties([...custs, ...supps]);
            });
        });
    }, []);

    const fetchLedger = useCallback(async (id) => {
        const targetId = id || selectedItemId;
        if (!targetId) return;
        setLoading(true);
        try {
            const params = { 
                ...filters, 
                itemId: targetId,
                includeCancelled: filters.includeCancelled ? 'true' : 'false'
            };
            const res = await api.get('/stock/movement-ledger', { params });
            setData(res.data || { summary: {}, rows: [] });
        } catch (e) {
            console.error('Failed to fetch ledger:', e);
        } finally {
            setLoading(false);
        }
    }, [selectedItemId, filters]);

    const handleRebuild = async () => {
        if (!selectedItemId) return;
        if (!window.confirm('This will purge and re-sync all ledger entries for this item from source documents. Continue?')) return;
        
        setIsRebuilding(true);
        try {
            const res = await api.post('/stock/rebuild-ledger', { itemId: selectedItemId });
            setRebuildLogs(res.data?.data?.logs || []);
            fetchLedger();
            alert('Ledger rebuild complete!');
        } catch (e) {
            alert('Rebuild failed: ' + (e.response?.data?.message || e.message));
        } finally {
            setIsRebuilding(false);
        }
    };

    useEffect(() => {
        if (selectedItemId) fetchLedger();
    }, [selectedItemId]);

    const { summary, rows } = data;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header & Controls */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Select Item</label>
                        <select 
                            value={selectedItemId} 
                            onChange={e => setSelectedItemId(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}
                        >
                            <option value="">-- Search and Select Item --</option>
                            {items.map(i => (
                                <option key={i._id} value={i._id}>[{i.itemCode}] {i.itemName}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>From</label>
                            <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))} style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>To</label>
                            <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))} style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }} />
                        </div>
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Filter Party</label>
                        <select 
                            value={filters.partyId} 
                            onChange={e => setFilters(p => ({ ...p, partyId: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                        >
                            <option value="">-- All Parties --</option>
                            {parties.map(p => <option key={p._id} value={p._id}>{p.name} ({p.type})</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
                        <input 
                            type="checkbox" 
                            id="inc_cancel"
                            checked={filters.includeCancelled} 
                            onChange={e => setFilters(p => ({ ...p, includeCancelled: e.target.checked }))} 
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                        <label htmlFor="inc_cancel" style={{ fontSize: 13, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>Show Cancelled</label>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button 
                            onClick={() => fetchLedger()}
                            style={{ padding: '10px 24px', background: accentColor, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14, transition: 'all 0.2s' }}
                        >
                            🔍 Refresh
                        </button>
                        <button 
                            onClick={handleRebuild}
                            disabled={isRebuilding || !selectedItemId}
                            style={{ padding: '10px 24px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14, opacity: (isRebuilding || !selectedItemId) ? 0.5 : 1 }}
                        >
                            {isRebuilding ? '⚙️ Rebuilding...' : '🛠 Rebuild Ledger'}
                        </button>
                    </div>
                </div>
            </div>

            {loading ? <BrandedLoader size={120} /> : !selectedItemId ? (
                <div style={{ padding: 100, textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Please select an item to view its movement history</div>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                        {[
                            { label: 'Opening Balance', qty: summary.openingQty, val: summary.openingValue, color: '#64748b', bg: '#f8fafc' },
                            { label: 'Total Inward (+)', qty: summary.totalInQty, val: summary.totalInValue, color: '#10b981', bg: '#f0fdf4' },
                            { label: 'Total Outward (-)', qty: summary.totalOutQty, val: summary.totalOutValue, color: '#ef4444', bg: '#fef2f2' },
                            { label: 'Closing Balance', qty: summary.closingQty, val: summary.closingValue, color: accentColor, bg: `${accentColor}11` },
                        ].map(s => (
                            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                                <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{fmt(s.qty)} <span style={{ fontSize: 12, fontWeight: 600 }}>Qty</span></div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: s.color, opacity: 0.8 }}>{fmtVal(s.val)}</div>
                            </div>
                        ))}
                    </div>

                    {/* Ledger Table */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th rowSpan={2} style={TH()}>#</th>
                                        <th rowSpan={2} style={TH()}>Date</th>
                                        <th rowSpan={2} style={TH()}>Voucher Type</th>
                                        <th rowSpan={2} style={TH()}>Reference No.</th>
                                        <th rowSpan={2} style={TH()}>Party Details</th>
                                        <th colSpan={3} style={{ ...TH(true), textAlign: 'center', background: '#f0fdf4', color: '#16a34a', borderBottom: '1px solid #dcfce7' }}>Inward Movement</th>
                                        <th colSpan={3} style={{ ...TH(true), textAlign: 'center', background: '#fef2f2', color: '#dc2626', borderBottom: '1px solid #fee2e2' }}>Outward Movement</th>
                                        <th rowSpan={2} style={{ ...TH(true), background: '#f1f5f9' }}>Balance</th>
                                        <th rowSpan={2} style={TH()}>Remarks</th>
                                    </tr>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ ...TH(true), background: '#f0fdf4', color: '#16a34a' }}>Qty</th>
                                        <th style={{ ...TH(true), background: '#f0fdf4', color: '#16a34a' }}>Rate</th>
                                        <th style={{ ...TH(true), background: '#f0fdf4', color: '#16a34a' }}>Value</th>
                                        <th style={{ ...TH(true), background: '#fef2f2', color: '#dc2626' }}>Qty</th>
                                        <th style={{ ...TH(true), background: '#fef2f2', color: '#dc2626' }}>Rate</th>
                                        <th style={{ ...TH(true), background: '#fef2f2', color: '#dc2626' }}>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                                        <td colSpan={5} style={{ ...TD, textAlign: 'right', fontSize: 11, color: '#64748b' }}>OPENING BALANCE</td>
                                        <td colSpan={3} style={TDR}></td>
                                        <td colSpan={3} style={TDR}></td>
                                        <td style={{ ...TDR, fontSize: 14 }}>{fmt(summary.openingQty)}</td>
                                        <td style={TD}></td>
                                    </tr>
                                    {rows.map((r, i) => <LedgerRow key={r._id || i} row={r} i={i} />)}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#1e293b', color: '#fff' }}>
                                        <td colSpan={5} style={{ padding: '12px', textAlign: 'right', fontWeight: 800, fontSize: 11 }}>PERIOD TOTALS</td>
                                        <td style={{ ...TDR, background: '#1e293b', color: '#4ade80', fontWeight: 900 }}>{fmt(summary.totalInQty)}</td>
                                        <td style={{ background: '#1e293b' }}></td>
                                        <td style={{ ...TDR, background: '#1e293b', color: '#4ade80', fontWeight: 900 }}>{fmtVal(summary.totalInValue)}</td>
                                        <td style={{ ...TDR, background: '#1e293b', color: '#f87171', fontWeight: 900 }}>{fmt(summary.totalOutQty)}</td>
                                        <td style={{ background: '#1e293b' }}></td>
                                        <td style={{ ...TDR, background: '#1e293b', color: '#f87171', fontWeight: 900 }}>{fmtVal(summary.totalOutValue)}</td>
                                        <td style={{ ...TDR, background: '#1e293b', color: '#a5b4fc', fontWeight: 900, fontSize: 15 }}>{fmt(summary.closingQty)}</td>
                                        <td style={{ background: '#1e293b' }}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── STOCK SUMMARY COMPONENT (FOR RAW, FG, CONSUMABLES) ──────────────────────
function StockSummaryList({ category, accentColor, onSelectItem }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const endpoint = category === 'FINISHED_GOOD' ? '/stock/finished-goods-report' : '/stock/raw-material-report';
            const params = { itemCategory: category };
            const res = await api.get(endpoint, { params });
            // Filter by category client-side if the API returns mixed results (for Consumables)
            let data = res.data || [];
            if (category === 'CONSUMABLE') {
                // If special endpoint for consumables doesn't exist, we use raw-material endpoint but filter
                data = data.filter(r => r.itemType === 'CONSUMABLE' || r.itemCategory === 'CONSUMABLE');
            }
            setRows(data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [category]);

    useEffect(() => { fetchReport(); }, [category]);

    const filtered = useMemo(() => {
        const s = search.toLowerCase();
        return rows.filter(r => (r.itemCode || '').toLowerCase().includes(s) || (r.itemName || '').toLowerCase().includes(s));
    }, [rows, search]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <input 
                    placeholder={`Search ${category.replace('_',' ')}...`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                />
                <button onClick={fetchReport} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>↻ Refresh</button>
            </div>

            {loading ? <BrandedLoader size={100} /> : (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: `${accentColor}10` }}>
                                <th style={TH()}>#</th>
                                <th style={TH()}>Item Code</th>
                                <th style={TH()}>Item Name</th>
                                <th style={{ ...TH(true) }}>Opening</th>
                                <th style={{ ...TH(true) }}>Inward</th>
                                <th style={{ ...TH(true) }}>Outward</th>
                                <th style={{ ...TH(true) }}>Closing</th>
                                <th style={{ ...TH(true) }}>Value (₹)</th>
                                <th style={TH()}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r, i) => (
                                <tr key={r.itemId || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ ...TD, color: '#94a3b8' }}>{i + 1}</td>
                                    <td style={{ ...TD, fontWeight: 800, color: accentColor, fontFamily: 'monospace' }}>{r.itemCode}</td>
                                    <td style={{ ...TD, fontWeight: 600 }}>{r.itemName}</td>
                                    <td style={TDR}>{fmt(r.openingQty)}</td>
                                    <td style={{ ...TDR, color: '#16a34a', fontWeight: 700 }}>+{fmt(r.purchaseQty || r.productionQty || 0)}</td>
                                    <td style={{ ...TDR, color: '#dc2626', fontWeight: 700 }}>-{fmt(r.consumedQty || r.salesQty || 0)}</td>
                                    <td style={{ ...TDR, fontWeight: 900 }}>{fmt(r.closingQty)}</td>
                                    <td style={{ ...TDR, fontWeight: 700 }}>{fmtVal(r.stockValue)}</td>
                                    <td style={TD}>
                                        <button 
                                            onClick={() => onSelectItem(r._id || r.itemId)}
                                            style={{ padding: '4px 10px', background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}44`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 800 }}
                                        >
                                            View Ledger
                                        </button>
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

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function StockMovementLedger() {
    const [tab, setTab] = useState(() => localStorage.getItem('inv_active_tab') || 'raw');
    const [selectedItemId, setSelectedItemId] = useState(null);

    useEffect(() => {
        localStorage.setItem('inv_active_tab', tab);
    }, [tab]);

    const handleSelectFromList = (id) => {
        setSelectedItemId(id);
        setTab('ledger');
    };

    return (
        <div style={{ fontFamily: 'Inter, sans-serif', background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header Section */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '20px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Stock Movement Ledger</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Real-time inventory tracking with quantity and value analysis</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ textAlign: 'right', paddingRight: 15, borderRight: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Financial Year</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>2024-25</div>
                    </div>
                    <button style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        📥 Export PDF
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 30px', display: 'flex', gap: 5 }}>
                {TABS.map(t => (
                    <button 
                        key={t.key} 
                        onClick={() => setTab(t.key)}
                        style={{ 
                            padding: '16px 24px', 
                            border: 'none', 
                            borderBottom: tab === t.key ? `3px solid ${t.color}` : '3px solid transparent', 
                            background: 'none', 
                            cursor: 'pointer', 
                            fontWeight: tab === t.key ? 900 : 600, 
                            color: tab === t.key ? t.color : '#64748b', 
                            fontSize: 14,
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div style={{ padding: '25px 30px' }}>
                {tab === 'raw' && <StockSummaryList category="RAW_MATERIAL" accentColor="#3b82f6" onSelectItem={handleSelectFromList} />}
                {tab === 'fg' && <StockSummaryList category="FINISHED_GOOD" accentColor="#8b5cf6" onSelectItem={handleSelectFromList} />}
                {tab === 'consumable' && <StockSummaryList category="CONSUMABLE" accentColor="#f59e0b" onSelectItem={handleSelectFromList} />}
                {tab === 'ledger' && <ComprehensiveLedger initialItemId={selectedItemId} accentColor="#6366f1" />}
            </div>
        </div>
    );
}
