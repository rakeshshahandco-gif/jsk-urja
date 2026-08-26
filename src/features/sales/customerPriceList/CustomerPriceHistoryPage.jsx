import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { getCustomerPriceHistory, listCustomerPriceLists } from '@/services/customerPriceListApi';
import { getItems } from '@/services/itemApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import CustomerPartySearch from './CustomerPartySearch';
import toast from 'react-hot-toast';

const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 12, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };
const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

export default function CustomerPriceHistoryPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [items, setItems] = useState([]);
    const [customerId, setCustomerId] = useState(params.get('customerId') || '');
    const [customerLabel, setCustomerLabel] = useState('');
    const [itemId, setItemId] = useState(params.get('itemId') || '');
    const [hist, setHist] = useState(null);
    const [itemCustomers, setItemCustomers] = useState([]);

    useEffect(() => {
        getItems({ limit: 5000, active: true }).then((res) => {
            const list = res?.data || [];
            setItems(Array.isArray(list) ? list : []);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (!customerId && !itemId) { setHist(null); return; }
        getCustomerPriceHistory({ customerId: customerId || undefined, itemId: itemId || undefined })
            .then(setHist)
            .catch((e) => toast.error(e?.response?.data?.message || 'History failed'));
    }, [customerId, itemId]);

    useEffect(() => {
        if (!itemId) { setItemCustomers([]); return; }
        listCustomerPriceLists({ itemId, view: 'active', limit: 200 }).then((res) => {
            setItemCustomers(res.data?.rows || []);
        }).catch(() => setItemCustomers([]));
    }, [itemId]);

    return (
        <div style={{ padding: 24 }}>
            <button type="button" onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LISTS)} style={{ border: 0, background: 'none', color: '#0f766e', cursor: 'pointer', fontWeight: 700 }}>← Price Lists</button>
            <h1 style={{ margin: '8px 0 16px', fontSize: 22 }}>Price History</h1>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 800, marginBottom: 16 }}>
                <CustomerPartySearch
                    valueLabel={customerLabel}
                    onSelect={(c) => {
                        setCustomerId(c.id);
                        setCustomerLabel(c.company || c.name);
                    }}
                    placeholder="Filter by customer..."
                />
                <SearchableSelect
                    options={items.map((it) => ({ value: it._id, label: `${it.itemCode} — ${it.itemName}` }))}
                    value={itemId}
                    onChange={setItemId}
                    placeholder="Filter by item..."
                />
            </div>

            {customerId && itemId && hist && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                    <Card title="Last Quoted Price" value={inr(hist.lastQuotedPrice)} note="From Price List (not merged)" />
                    <Card title="Last Sales Order Price" value={inr(hist.lastSalesOrderPrice)} note="From Sales Order" />
                    <Card title="Last Invoice Price" value={inr(hist.lastInvoicePrice)} note="From Sales Invoice" />
                </div>
            )}

            {itemId && !!itemCustomers.length && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Customers with an active price for this item</div>
                    {itemCustomers.map((r) => (
                        <div key={r._id} style={{ padding: '6px 0', borderTop: '1px solid #f1f5f9', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{r.customerName} {r.customerCompany ? `· ${r.customerCompany}` : ''}</span>
                            <span>{r.priceListNo} {r.version}</span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {['Date', 'Price List', 'Customer', 'Product', 'Qty/Slab', 'Rate', 'Status'].map((h) => <th key={h} style={th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {!(hist?.rows || []).length && <tr><td style={td} colSpan={7}>Select a customer and/or item.</td></tr>}
                        {(hist?.rows || []).map((row, i) => (
                            <tr key={`${row.priceListId}-${i}`} style={{ cursor: 'pointer' }} onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_DETAIL(row.priceListId))}>
                                <td style={td}>{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '—'}</td>
                                <td style={td}>{row.priceListNo} {row.version}</td>
                                <td style={td}>{row.customerName}</td>
                                <td style={td}>{row.product}</td>
                                <td style={td}>{row.slab}</td>
                                <td style={td}>{inr(row.rate)}</td>
                                <td style={td}>{row.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Card({ title, value, note }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{title}</div>
            <div style={{ fontSize: 20, fontWeight: 800, margin: '6px 0' }}>{value}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{note}</div>
        </div>
    );
}
