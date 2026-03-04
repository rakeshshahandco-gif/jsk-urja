import React, { useState, useEffect } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';

const tile = (label, value, color, bg) => ({ label, value, color, bg });

const tiles_config = [
    tile('Draft', 'Draft', '#64748b', '#f8fafc'),
    tile('Released', 'Released', '#2563eb', '#eff6ff'),
    tile('In Process', 'In Process', '#d97706', '#fffbeb'),
    tile('WIP – Waiting Material', 'WIP – Waiting Material', '#dc2626', '#fef2f2'),
    tile('On Hold', 'On Hold', '#9333ea', '#faf5ff'),
    tile('Completed Today', 'Completed Today', '#16a34a', '#f0fdf4'),
    tile('QC Pending', 'QC Pending', '#0891b2', '#ecfeff'),
    tile('Testing Pending', 'Testing Pending', '#ea580c', '#fff7ed'),
];

export default function ProductionDashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDashboardData = (silent = false) => {
        if (!silent) setLoading(true);
        getDashboardStats()
            .then(setStats)
            .catch(e => setError(e.message || 'Failed to load stats'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchDashboardData(); }, []);
    useGlobalSync('workorder', () => { fetchDashboardData(true); });

    const s = (key) => loading ? '...' : (stats[key] ?? '0');

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1e293b' }}>
                        🏭 Production Dashboard
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                        Real-time overview of all Work Orders
                    </p>
                </div>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.NEW_WO)}
                    style={{
                        background: '#0d9488', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 2px 8px rgba(13,148,136,0.3)',
                    }}
                >
                    + New Work Order
                </button>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: 14, marginBottom: 20, color: '#dc2626', fontSize: 13 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Stat Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
                {tiles_config.map(t => (
                    <div key={t.label}
                        onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS + (
                            t.label !== 'Completed Today' && t.label !== 'QC Pending' && t.label !== 'Testing Pending'
                                ? `?status=${encodeURIComponent(t.label)}` : ''
                        ))}
                        style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderLeft: `4px solid ${t.color}`,
                            borderRadius: 12,
                            padding: '18px 20px',
                            cursor: 'pointer',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
                    >
                        <div style={{ fontSize: 32, fontWeight: 800, color: t.color }}>{s(t.label)}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontWeight: 500 }}>{t.label}</div>
                    </div>
                ))}
            </div>

            {/* Quick Nav */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <NavCard icon="📋" title="All Work Orders" sub="View & manage WOs" path={PATHS.PRODUCTION.WORK_ORDERS} navigate={navigate} />
                <NavCard icon="➕" title="New Work Order" sub="Start from BOM" path={PATHS.PRODUCTION.NEW_WO} navigate={navigate} />
            </div>

            <ProcessFlowInfo />
        </div>
    );
}

function NavCard({ icon, title, sub, path, navigate }) {
    return (
        <div
            onClick={() => navigate(path)}
            style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                padding: '18px 24px', cursor: 'pointer', minWidth: 200,
                transition: 'box-shadow 0.15s, transform 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none'; }}
        >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
        </div>
    );
}

function ProcessFlowInfo() {
    const stages = [
        { seq: 1, name: 'PCB', icon: '🔲' },
        { seq: 2, name: 'SMD Pick & Place', icon: '🤖' },
        { seq: 3, name: 'TH Mounting', icon: '🔩' },
        { seq: 4, name: 'Wave Soldering', icon: '🌊' },
        { seq: 5, name: 'Touch Up', icon: '✏️' },
        { seq: 6, name: 'Wire Insert', icon: '🔌' },
        { seq: 7, name: '1st QC', icon: '🔍', isGate: true },
        { seq: 8, name: 'Dummy Load Testing', icon: '⚡', isGate: true },
        { seq: 9, name: 'Final QC', icon: '✅', isGate: true },
    ];
    return (
        <div style={{ marginTop: 28, background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Production Flow</h2>
            <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                {stages.map((s, i) => (
                    <React.Fragment key={s.seq}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 80 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%',
                                background: s.isGate ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'linear-gradient(135deg,#2563eb,#0ea5e9)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 20,
                                boxShadow: s.isGate ? '0 0 12px rgba(124,58,237,0.3)' : '0 2px 6px rgba(37,99,235,0.2)',
                            }}>
                                {s.icon}
                            </div>
                            <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', fontWeight: 500 }}>{s.name}</div>
                        </div>
                        {i < stages.length - 1 && (
                            <div style={{ color: '#d1d5db', fontSize: 18, margin: '0 2px', paddingBottom: 18 }}>→</div>
                        )}
                    </React.Fragment>
                ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
                🔵 Assembly stages &nbsp;|&nbsp; 🟣 QC / Testing gates (mandatory pass to proceed)
            </div>
        </div>
    );
}
