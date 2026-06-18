import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import { getTextileProductionDashboard, listTextileProductionOrders } from '@/services/textileProductionWorkflowApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const th = { padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 700 };
const td = { padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 };

export default function TextileProductionDashboardPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [dashboard, setDashboard] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isTextile || !selectedCompany?._id) return setLoading(false);
        Promise.all([
            getTextileProductionDashboard({ companyId: selectedCompany._id }),
            listTextileProductionOrders({ companyId: selectedCompany._id }),
        ])
            .then(([d, o]) => { setDashboard(d); setOrders(o); })
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [isTextile, selectedCompany?._id]);

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;
    if (loading) return <BrandedLoader size={80} />;

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Textile Production Workflow</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Stage-wise production — issue, receive, skip, complete</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PROCESS_ROUTES)} style={{ padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Process Routes</button>
                    <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_NEW)} style={{ padding: '9px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>+ New Production Order</button>
                </div>
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Active Orders</h2>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto', marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Order No', 'Design', 'Qty', 'Current Stage', 'Next Stage', 'Status', 'Vendor', 'Days', ''].map((h) => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {dashboard.map((r) => (
                            <tr key={r.orderId}>
                                <td style={td}><strong>{r.orderNo}</strong></td>
                                <td style={td}>{r.designNo || '—'}</td>
                                <td style={td}>{r.qty} {r.qtyUom}</td>
                                <td style={td}>{r.currentStage || '—'}</td>
                                <td style={td}>{r.nextStage || '—'}</td>
                                <td style={td}>{r.status}</td>
                                <td style={td}>{r.vendor || '—'}</td>
                                <td style={td}>{r.pendingDays}</td>
                                <td style={td}>
                                    <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(r.orderId))} style={{ padding: '4px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Open</button>
                                </td>
                            </tr>
                        ))}
                        {dashboard.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: '#94a3b8' }}>No active orders</td></tr>}
                    </tbody>
                </table>
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>All Production Orders</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orders.map((o) => (
                    <div key={o._id} onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(o._id))} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, cursor: 'pointer' }}>
                        <strong>{o.orderNo}</strong> · {o.routeName} · {o.currentProcessName || o.status} · {o.qty} {o.qtyUom}
                    </div>
                ))}
                {orders.length === 0 && <div style={{ color: '#94a3b8', padding: 20 }}>No production orders yet</div>}
            </div>
        </div>
    );
}
