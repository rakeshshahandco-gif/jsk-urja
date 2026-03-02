import React, { useState, useEffect } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';

const tile = (label, value, color, border) => ({
    label, value, color, border,
});

const tiles_config = [
    tile('Draft', 'Draft', '#64748b', '#334155'),
    tile('Released', 'Released', '#3b82f6', '#1d4ed8'),
    tile('In Process', 'In Process', '#f59e0b', '#d97706'),
    tile('WIP – Waiting Material', 'WIP – Waiting Material', '#ef4444', '#dc2626'),
    tile('On Hold', 'On Hold', '#a855f7', '#9333ea'),
    tile('Completed Today', 'Completed Today', '#10b981', '#059669'),
    tile('QC Pending', 'QC Pending', '#06b6d4', '#0891b2'),
    tile('Testing Pending', 'Testing Pending', '#f97316', '#ea580c'),
];

export default function ProductionDashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDashboardData = () => {
        setLoading(true);
        getDashboardStats()
            .then(setStats)
            .catch(e => setError(e.message || 'Failed to load stats'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // Auto refresh the dashboard data every 5 seconds
    useAutoRefresh(fetchDashboardData);

    const s = (key) => loading ? '...' : (stats[key] ?? '0');

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
                        🏭 Production Dashboard
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '14px' }}>
                        Real-time overview of all Work Orders
                    </p>
                </div>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.NEW_WO)}
                    style={{
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                        color: '#fff', border: 'none', borderRadius: '10px',
                        padding: '10px 20px', fontSize: '14px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                    }}
                >
                    + New Work Order
                </button>
            </div>

            {error && (
                <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: '10px', padding: '14px', marginBottom: '20px', color: '#fca5a5' }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Stat Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '36px' }}>
                {tiles_config.map(t => (
                    <div key={t.label}
                        onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS + (t.label !== 'Completed Today' && t.label !== 'QC Pending' && t.label !== 'Testing Pending' ? `?status=${encodeURIComponent(t.label)}` : ''))}
                        style={{
                            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                            border: `1px solid #1e293b`,
                            borderLeft: `4px solid ${t.color}`,
                            borderRadius: '12px',
                            padding: '20px',
                            cursor: 'pointer',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                    >
                        <div style={{ fontSize: '32px', fontWeight: 800, color: t.color }}>{s(t.label)}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 500 }}>{t.label}</div>
                    </div>
                ))}
            </div>

            {/* Quick Nav */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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
                background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
                padding: '18px 24px', cursor: 'pointer', minWidth: '200px',
                transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#334155'}
            onMouseLeave={e => e.currentTarget.style.background = '#1e293b'}
        >
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>{icon}</div>
            <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{title}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{sub}</div>
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
        <div style={{ marginTop: '32px', background: '#1e293b', borderRadius: '14px', padding: '24px', border: '1px solid #334155' }}>
            <h2 style={{ margin: '0 0 18px', fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>Production Flow</h2>
            <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap', alignItems: 'center' }}>
                {stages.map((s, i) => (
                    <React.Fragment key={s.seq}>
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: '6px', minWidth: '80px',
                        }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: s.isGate ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'linear-gradient(135deg,#1e40af,#0ea5e9)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '20px', boxShadow: s.isGate ? '0 0 12px rgba(124,58,237,0.5)' : 'none',
                            }}>
                                {s.icon}
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', fontWeight: 500 }}>{s.name}</div>
                        </div>
                        {i < stages.length - 1 && (
                            <div style={{ color: '#334155', fontSize: '18px', margin: '0 2px', paddingBottom: '18px' }}>→</div>
                        )}
                    </React.Fragment>
                ))}
            </div>
            <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b' }}>
                🔵 Assembly stages &nbsp;|&nbsp; 🟣 QC / Testing gates (mandatory pass to proceed)
            </div>
        </div>
    );
}
