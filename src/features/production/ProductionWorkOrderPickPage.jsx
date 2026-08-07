import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getWorkOrders } from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { TableSkeleton } from '@/components/ui/BrandedLoading';

/** Shortcut hubs for Production Home forms that need a Work Order context. */
const HUB_BY_PATH = {
    '/production/consumption': {
        title: 'BOM Consumption',
        subtitle: 'Select a Work Order to open BOM & Material',
        tab: 1,
        emptyHint: 'Create or release a Work Order first, then return here.',
    },
    '/production/qc': {
        title: 'QC / Testing',
        subtitle: 'Select a Work Order to open QC & Testing gates',
        tab: 3,
        emptyHint: 'Create or release a Work Order first, then return here.',
    },
};

const ACTIVE_STATUSES = ['Draft', 'Released', 'In Process', 'WIP – Waiting Material', 'On Hold'];

export default function ProductionWorkOrderPickPage() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const hub = HUB_BY_PATH[pathname] || {
        title: 'Select Work Order',
        subtitle: 'Choose a Work Order to continue',
        tab: 0,
        emptyHint: 'No Work Orders found.',
    };

    const [wos, setWos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setLoading(true);
        getWorkOrders({ search: search || undefined })
            .then((d) => {
                const list = (d.workOrders || []).filter((w) =>
                    ACTIVE_STATUSES.includes(w.status)
                );
                setWos(list);
            })
            .catch((e) => toast.error(e.message || 'Failed to load Work Orders'))
            .finally(() => setLoading(false));
    }, [search]);

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{hub.title}</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{hub.subtitle}</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS)}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569' }}
                >
                    All Work Orders
                </button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <input
                    placeholder="Search WO No, product, supervisor…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                />
            </div>

            {loading ? (
                <TableSkeleton rows={6} />
            ) : wos.length === 0 ? (
                <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>No open Work Orders</div>
                    <div style={{ fontSize: 13 }}>{hub.emptyHint}</div>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.PRODUCTION.NEW_WO)}
                        style={{ marginTop: 16, background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, cursor: 'pointer' }}
                    >
                        + New Work Order
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                    {wos.map((wo) => (
                        <button
                            key={wo._id}
                            type="button"
                            onClick={() => navigate(`${PATHS.PRODUCTION.WO_DETAIL(wo._id)}?tab=${hub.tab}`)}
                            style={{
                                textAlign: 'left',
                                background: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: 12,
                                padding: '14px 18px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{wo.woNumber || wo.workOrderNo || 'WO'}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: 999 }}>{wo.status}</div>
                            </div>
                            <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
                                {wo.productName || wo.finishedItemName || wo.itemName || '—'}
                                {wo.targetQty != null ? ` · Qty ${wo.targetQty}` : ''}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
