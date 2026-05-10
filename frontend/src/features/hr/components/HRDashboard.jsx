import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Clock, Calendar, Briefcase, FileText, TrendingUp, UserPlus, LogIn } from 'lucide-react';
import { getEmployees, getShifts } from '@/services/hrApi';
import { useToast } from '@/components/ui/Toast';

const Card = ({ title, value, icon: Icon, color, onClick, subtitle }) => (
    <div 
        onClick={onClick}
        style={{ 
            background: '#fff', 
            padding: '24px', 
            borderRadius: '16px', 
            border: '1px solid #f1f5f9', 
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'transform 0.2s, box-shadow 0.2s',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}
        onMouseEnter={(e) => {
            if (onClick) {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
            }
        }}
        onMouseLeave={(e) => {
            if (onClick) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
            }
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ padding: '10px', background: `${color}15`, borderRadius: '12px', color: color }}>
                <Icon size={24} />
            </div>
            {subtitle && <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{subtitle}</span>}
        </div>
        <div>
            <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>{title}</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#1e293b', marginTop: '4px' }}>{value}</div>
        </div>
    </div>
);

const QuickAction = ({ label, icon: Icon, onClick, color }) => (
    <button 
        onClick={onClick}
        style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            padding: '12px 16px', 
            background: '#fff', 
            border: '1px solid #e2e8f0', 
            borderRadius: '12px', 
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            color: '#475569',
            transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = color;
            e.currentTarget.style.color = color;
            e.currentTarget.style.background = `${color}05`;
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.color = '#475569';
            e.currentTarget.style.background = '#fff';
        }}
    >
        <Icon size={18} />
        {label}
    </button>
);

const HRDashboard = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [stats, setStats] = useState({
        totalEmployees: 0,
        activeEmployees: 0,
        totalShifts: 0,
        pendingLeaves: 3, // Mocked for now
        presentToday: 0 // Mocked for now
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [empRes, shiftRes] = await Promise.all([
                    getEmployees({ status: 'Active' }),
                    getShifts()
                ]);
                
                // Get all employees for total count
                const allEmpRes = await getEmployees();

                setStats({
                    totalEmployees: allEmpRes.data?.length || 0,
                    activeEmployees: empRes.data?.length || 0,
                    totalShifts: shiftRes.data?.length || 0,
                    pendingLeaves: 3,
                    presentToday: Math.floor((empRes.data?.length || 0) * 0.9) // Simulating 90% attendance
                });
            } catch (err) {
                console.error('Dashboard load failed:', err);
                addToast('Failed to load dashboard data', 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [addToast]);

    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>Loading HR Dashboard...</div>;

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '30px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>HR Overview</h1>
                    <p style={{ fontSize: '15px', color: '#64748b', marginTop: '6px' }}>Real-time insights into your workforce and operations</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <QuickAction label="New Employee" icon={UserPlus} onClick={() => navigate('/hr/employees/new')} color="#2563eb" />
                    <QuickAction label="Import Attendance" icon={LogIn} onClick={() => navigate('/hr/attendance/import')} color="#059669" />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', marginBottom: '40px' }}>
                <Card 
                    title="Total Workforce" 
                    value={stats.totalEmployees} 
                    icon={Users} 
                    color="#2563eb" 
                    onClick={() => navigate('/hr/employees')}
                    subtitle="Primary Master"
                />
                <Card 
                    title="Attendance Today" 
                    value={stats.presentToday} 
                    icon={Calendar} 
                    color="#059669" 
                    onClick={() => navigate('/hr/attendance')}
                    subtitle="92% Coverage"
                />
                <Card 
                    title="Shift Configurations" 
                    value={stats.totalShifts} 
                    icon={Clock} 
                    color="#d97706" 
                    onClick={() => navigate('/hr/shifts')}
                    subtitle="Active Master"
                />
                <Card 
                    title="Pending Approvals" 
                    value={stats.pendingLeaves} 
                    icon={FileText} 
                    color="#dc2626" 
                    onClick={() => navigate('/hr/leaves')}
                    subtitle="Urgent Actions"
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '32px' }}>
                <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#1e293b' }}>Recent Activities</h3>
                        <button style={{ fontSize: '13px', color: '#2563eb', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                            { title: 'New Employee Onboarded', user: 'Rahul Sharma', time: '2 hours ago', icon: UserPlus, color: '#2563eb' },
                            { title: 'Attendance Log Imported', user: 'System', time: '5 hours ago', icon: LogIn, color: '#059669' },
                            { title: 'New Leave Request', user: 'Priya Verma', time: 'Yesterday', icon: FileText, color: '#dc2626' }
                        ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', gap: '16px', padding: '12px', borderRadius: '12px', background: '#f8fafc' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${item.color}15`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <item.icon size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>{item.title}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{item.user} • {item.time}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', padding: '24px', borderRadius: '16px', color: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <TrendingUp size={24} style={{ opacity: 0.8 }} />
                            <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '20px' }}>Q1 Report</span>
                        </div>
                        <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>Workforce Growth</h4>
                        <p style={{ fontSize: '13px', opacity: 0.8, margin: 0 }}>Increased by 12% since last month. Keep up the hiring momentum!</p>
                    </div>
                    
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>HR Quick Links</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <a href="/hr/payroll" style={{ fontSize: '14px', color: '#2563eb', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Briefcase size={16} /> Salary Working
                            </a>
                            <a href="/hr/reports" style={{ fontSize: '14px', color: '#2563eb', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={16} /> Monthly Reports
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HRDashboard;
