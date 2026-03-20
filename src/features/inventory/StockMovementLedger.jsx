import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';

const fmt = (n) => Number(n || 0).toFixed(2);

const TYPE_LABELS = {
    GRN: 'Purchase (GRN)', WO_CONSUMPTION: 'Production Consumption', WO_OUTPUT: 'Production Output',
    COMPONENT_REPLACEMENT: 'Component Replacement', PROD_REJECTION: 'Production Rejection',
    OPENING: 'Opening Balance', ADJUSTMENT: 'Adjustment', RETURN: 'Return',
    SALES_INVOICE: 'Sales Invoice', SALES_INVOICE_CANCEL: 'Sales Return',
    REPLACEMENT_DISPATCH: 'Replacement Dispatch', FAULTY_RECEIPT: 'Faulty Receipt',
    REPAIR_INWARD: 'Repair Inward', SCRAP_ENTRY: 'Scrap', PROD_FAILURE: 'Production Failure',
    REWORK_CONSUMPTION: 'Rework Consumption', REWORK_QC_PASS: 'Rework Output',
};

export default function StockMovementLedger() {
    const [items, setItems] = useState([]);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [rows, setRows] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
    const [search, setSearch] = useState('');

    useEffect(() => {
        api.get('/items', { params: { limit: 500 } }).then(res => {
            setItems((res.data?.data?.items || res.data?.data || []).filter(Boolean));
        });
    }, []);

    const filtered = items.filter(i => !search || `${i.itemCode} ${i.itemName}`.toLowerCase().includes(search.toLowerCase()));

    const fetchLedger = async (itemId) => {
        if (!itemId) return;
        setLoading(true);
        try {
            const params = {};
            if (filters.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters.dateTo) params.dateTo = filters.dateTo;
            const res = await api.get(`/stock/ledger/${itemId}`, { params });
            const d = res.data?.data;
            setRows(d?.rows || []);
            setSelectedItem(d?.item || null);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleItemSelect = (id) => {
        setSelectedItemId(id);
        fetchLedger(id);
    };

    return (
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Stock Movement Ledger</h2>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13 }}>Date-wise movement of any item — In / Out / Running Balance</p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 260px' }}>
                    <input placeholder="Search item by code or name..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, marginBottom: 6 }} />
                    <select value={selectedItemId} onChange={e => handleItemSelect(e.target.value)} size={7}
                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: 4 }}>
                        <option value="">-- Select Item --</option>
                        {filtered.map(i => (
                            <option key={i._id} value={i._id}>{i.itemCode} — {i.itemName}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 26 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))}
                            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                        <span style={{ color: '#94a3b8' }}>to</span>
                        <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))}
                            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                        <button onClick={() => fetchLedger(selectedItemId)}
                            style={{ padding: '6px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Go</button>
                    </div>
                    {selectedItem && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                            <strong>{selectedItem.itemCode}</strong> — {selectedItem.itemName} ({selectedItem.uom}) &nbsp;|&nbsp;
                            Current Stock: <strong style={{ color: '#3b82f6' }}>{fmt(selectedItem.currentStock)}</strong>
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading...</div>
            ) : rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    {selectedItemId ? 'No transactions found for selected filters' : 'Select an item to view ledger'}
                </div>
            ) : (
                <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#eef2ff' }}>
                                {['Date', 'Transaction Type', 'Reference No', 'In Qty', 'Out Qty', 'Balance', 'Rate', 'Amount', 'Remarks'].map(h => (
                                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>{new Date(r.date).toLocaleDateString('en-IN')}</td>
                                    <td style={{ padding: '7px 12px' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: r.inQty > 0 ? '#dcfce7' : '#fee2e2', color: r.inQty > 0 ? '#16a34a' : '#dc2626' }}>
                                            {TYPE_LABELS[r.transactionType] || r.transactionType}
                                        </span>
                                    </td>
                                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#6366f1' }}>{r.referenceNo}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{r.inQty > 0 ? fmt(r.inQty) : '-'}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{r.outQty > 0 ? fmt(r.outQty) : '-'}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt(r.balance)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#64748b' }}>₹{fmt(r.rate)}</td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#64748b' }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 12 }}>{r.remarks}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
