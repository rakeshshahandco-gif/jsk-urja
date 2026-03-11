import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Eye,
    Wrench,
    History,
    AlertTriangle,
    CheckCircle,
    Trash2,
    Activity
} from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { getFailures, getJobCards } from '@/services/productionReworkApi';
import { format } from 'date-fns';
import { Button } from '@/components/ui';

const ProductionReworkDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState({
        totalFailures: 0,
        openFailures: 0,
        pendingRework: 0,
        totalRepaired: 0,
        totalScrap: 0
    });
    const [recentFailures, setRecentFailures] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const failures = await getFailures();
            const jobCards = await getJobCards();

            setRecentFailures(failures.slice(0, 5));

            const stats = {
                totalFailures: failures.length,
                openFailures: failures.filter(f => f.status === 'Open').length,
                pendingRework: jobCards.filter(j => j.status === 'Pending' || j.status === 'In Progress').length,
                totalRepaired: failures.reduce((acc, f) => acc + (f.qtyPassedAfterRetest || 0), 0),
                totalScrap: failures.reduce((acc, f) => acc + (f.qtyScrap || 0), 0)
            };
            setSummary(stats);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ title, value, color, icon: Icon, bg }) => (
        <div
            style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${color}`,
                borderRadius: 12,
                padding: '18px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
        >
            <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase' }}>{title}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b' }}>{value}</div>
            </div>
            <div style={{
                background: bg,
                padding: 10,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Icon size={24} color={color} />
            </div>
        </div>
    );

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1e293b' }}>
                        🛠️ Production Rework Dashboard
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                        Track failures, repairs and retesting
                    </p>
                </div>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.REWORK.NEW_FAILURE)}
                    style={{
                        background: '#0d9488', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 2px 8px rgba(13,148,136,0.3)',
                    }}
                >
                    <Plus size={16} /> New Failure Entry
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
                <StatCard title="Total Failures" value={summary.totalFailures} color="#2563eb" bg="#eff6ff" icon={Activity} />
                <StatCard title="Open Failures" value={summary.openFailures} color="#dc2626" bg="#fef2f2" icon={AlertTriangle} />
                <StatCard title="Under Repair" value={summary.pendingRework} color="#d97706" bg="#fffbeb" icon={Wrench} />
                <StatCard title="Repaired (Pass)" value={summary.totalRepaired} color="#16a34a" bg="#f0fdf4" icon={CheckCircle} />
                <StatCard title="Scrapped" value={summary.totalScrap} color="#64748b" bg="#f8fafc" icon={Trash2} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent Failure Entries</h3>
                        <button
                            onClick={() => navigate(PATHS.PRODUCTION.REWORK.FAILURES)}
                            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                            View All
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 20px', color: '#64748b', fontWeight: 600 }}>Date</th>
                                    <th style={{ padding: '12px 20px', color: '#64748b', fontWeight: 600 }}>Failure No</th>
                                    <th style={{ padding: '12px 20px', color: '#64748b', fontWeight: 600 }}>Product</th>
                                    <th style={{ padding: '12px 20px', color: '#64748b', fontWeight: 600 }}>Failed Qty</th>
                                    <th style={{ padding: '12px 20px', color: '#64748b', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: '12px 20px', textAlign: 'right' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentFailures.map((row) => (
                                    <tr key={row._id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px 20px' }}>{format(new Date(row.date), 'dd/MM/yy')}</td>
                                        <td style={{ padding: '12px 20px', fontWeight: 600 }}>{row.failureNo}</td>
                                        <td style={{ padding: '12px 20px' }}>
                                            <div style={{ fontWeight: 500 }}>{row.itemName}</div>
                                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{row.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '12px 20px' }}>{row.qtyFailed}</td>
                                        <td style={{ padding: '12px 20px' }}>
                                            <span style={{
                                                padding: '3px 10px',
                                                borderRadius: 20,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                background: row.status === 'Open' ? '#fef2f2' : '#f0fdf4',
                                                color: row.status === 'Open' ? '#dc2626' : '#16a34a'
                                            }}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => navigate(PATHS.PRODUCTION.REWORK.FAILURE_DETAILS(row._id))}
                                                style={{ background: '#f1f5f9', border: 'none', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#64748b' }}
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {recentFailures.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No failure records found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Quick Navigation</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <NavButton icon={<Plus size={18} />} title="New Failure Entry" path={PATHS.PRODUCTION.REWORK.NEW_FAILURE} navigate={navigate} />
                        <NavButton icon={<Wrench size={18} />} title="Rework Job Cards" path={PATHS.PRODUCTION.REWORK.JOB_CARDS} navigate={navigate} />
                        <NavButton icon={<History size={18} />} title="Material History" path={PATHS.PRODUCTION.REWORK.MATERIAL_ISSUES} navigate={navigate} />
                        <NavButton icon={<CheckCircle size={18} />} title="Retest Logs" path={PATHS.PRODUCTION.REWORK.RETESTS} navigate={navigate} />
                        <NavButton icon={<Trash2 size={18} />} title="Scrap Log" path={PATHS.PRODUCTION.REWORK.SCRAPS} navigate={navigate} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const NavButton = ({ icon, title, path, navigate }) => (
    <button
        onClick={() => navigate(path)}
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            padding: '12px 16px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
        onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
    >
        <span style={{ color: '#64748b' }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{title}</span>
    </button>
);

export default ProductionReworkDashboard;
