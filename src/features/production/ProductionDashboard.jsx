import React, { useState, useEffect } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '@/services/workOrderApi';
import { getCompanyWorkflowAssignment } from '@/services/companyWorkflowAssignmentApi';
import { PATHS } from '@/routes/paths';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getWorkOrderLabels, mapWorkflowPreviewToDisplayStages, JSK_WO_DEFAULT_STAGES } from '@/utils/textileWorkOrder';
import { BrandedLoader } from '@/components/ui';

const tiles_config = [
    { label: 'Draft', color: '#64748b', bg: '#f8fafc' },
    { label: 'Released', color: '#2563eb', bg: '#eff6ff' },
    { label: 'In Process', color: '#d97706', bg: '#fffbeb' },
    { label: 'WIP – Waiting Material', color: '#dc2626', bg: '#fef2f2' },
    { label: 'On Hold', color: '#9333ea', bg: '#faf5ff' },
    { label: 'Completed (Range)', color: '#16a34a', bg: '#f0fdf4', valueKey: 'Completed Today' },
    { label: 'Completed Total', color: '#059669', bg: '#ecfdf5', valueKey: 'Completed Total' },
    { label: 'QC Pending', color: '#0891b2', bg: '#ecfeff' },
    { label: 'Testing Pending', color: '#ea580c', bg: '#fff7ed' },
];

export default function ProductionDashboard() {
    const navigate = useNavigate();
    const { selectedFY } = useFinancialYear();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const labels = getWorkOrderLabels(isTextile);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [flowStages, setFlowStages] = useState(isTextile ? [] : JSK_WO_DEFAULT_STAGES);

    // Date Filters - Default to current month
    const [dates, setDates] = useState(() => {
        const d = new Date();
        const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
        const today = d.toISOString().split('T')[0];
        return { from: firstDay, to: today };
    });

    const fetchDashboardData = (silent = false) => {
        if (!silent) setLoading(true);
        getDashboardStats({ ...dates, financialYear: selectedFY })
            .then(setStats)
            .catch(e => setError(e.message || 'Failed to load stats'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { 
        if (selectedFY) fetchDashboardData(); 
    }, [dates.from, dates.to, selectedFY]);

    useEffect(() => {
        if (!isTextile || !selectedCompany?._id) {
            setFlowStages(JSK_WO_DEFAULT_STAGES);
            return;
        }
        getCompanyWorkflowAssignment(selectedCompany._id)
            .then((data) => setFlowStages(mapWorkflowPreviewToDisplayStages(data?.previewStages || [])))
            .catch(() => setFlowStages(mapWorkflowPreviewToDisplayStages([])));
    }, [isTextile, selectedCompany?._id]);
    
    useGlobalSync('workorder', () => { fetchDashboardData(true); });

    const s = (key) => stats[key] ?? '0';

    if (loading) return <BrandedLoader size={120} />;

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1e293b' }}>
                        {labels.dashboardTitle}
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                        {labels.dashboardSubtitle}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ display: 'flex', background: '#fff', padding: '4px 12px', borderRadius: 8, border: '1px solid #e5e7eb', gap: 8, alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>FROM</div>
                        <input type="date" value={dates.from} onChange={e => setDates(d => ({ ...d, from: e.target.value }))} style={{ border: 'none', fontSize: 13, outline: 'none', color: '#374151', padding: '4px 0' }} />
                        <div style={{ width: 1, background: '#e5e7eb', height: 16, margin: '0 4px' }} />
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>TO</div>
                        <input type="date" value={dates.to} onChange={e => setDates(d => ({ ...d, to: e.target.value }))} style={{ border: 'none', fontSize: 13, outline: 'none', color: '#374151', padding: '4px 0' }} />
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
                        {labels.newButton}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: 14, marginBottom: 20, color: '#dc2626', fontSize: 13 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Stat Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
                {tiles_config.map(t => {
                    const valueKey = t.valueKey || t.label;
                    
                    return (
                        <div key={t.label}
                            onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS + (
                                !t.valueKey && t.label !== 'QC Pending' && t.label !== 'Testing Pending'
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
                            <div style={{ fontSize: 32, fontWeight: 800, color: t.color }}>{s(valueKey)}</div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontWeight: 500 }}>{t.label}</div>
                        </div>
                    );
                })}
            </div>

            {/* Quick Nav */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <NavCard icon="📋" title={labels.titleShort} sub={isTextile ? 'View & manage job orders' : 'View & manage WOs'} path={PATHS.PRODUCTION.WORK_ORDERS} navigate={navigate} />
                <NavCard icon="➕" title={labels.newTitle} sub={isTextile ? 'Fabric + process route' : 'Start from BOM'} path={PATHS.PRODUCTION.NEW_WO} navigate={navigate} />
            </div>

            <ProcessFlowInfo stages={flowStages} isTextile={isTextile} labels={labels} />
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

function ProcessFlowInfo({ stages = [], isTextile, labels }) {
    return (
        <div style={{ marginTop: 28, background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{labels.flowTitle}</h2>
            <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                {stages.map((s, i) => (
                    <React.Fragment key={`${s.seq}-${s.name}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 80 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%',
                                background: s.isGate
                                    ? 'linear-gradient(135deg,#7c3aed,#4f46e5)'
                                    : (isTextile ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#2563eb,#0ea5e9)'),
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
                {labels.flowLegend}
            </div>
        </div>
    );
}
