import { useNavigate } from 'react-router-dom';
import { BarChart, PieChart, FileText, Download, Users, TrendingUp, Clock, AlertCircle, Calculator, Calendar } from 'lucide-react';

const HRReportsPage = () => {
    const navigate = useNavigate();
    
    const reports = [
        { title: 'Daily Attendance', desc: 'Detailed punch-in and status log', icon: Clock, color: '#3b82f6', path: '/hr/reports/daily' },
        { title: 'Monthly Summary', desc: 'Summary of attendance and late marks', icon: BarChart, color: '#059669', path: '/hr/reports/monthly-summary' },
        { title: 'Salary Working', desc: 'Final payable days for payroll', icon: Calculator, color: '#0f172a', path: '/hr/reports/salary-working' },
        { title: 'Late Coming', desc: 'List of all late arrivals', icon: AlertCircle, color: '#dc2626', path: '/hr/reports/late-coming' },
        { title: 'Missing Checkout', desc: 'Records with missing punch-out', icon: Clock, color: '#d97706', path: '/hr/reports/missing-punch' },
        { title: 'Employee Directory', desc: 'Full list of employees with all details', icon: Users, color: '#7c3aed', path: '/hr/employees' },
    ];

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>HR Reports</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Generate and view detailed attendance and payroll reports</p>
                </div>
                <button 
                    onClick={() => navigate('/hr/settings')}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', color: '#475569', cursor: 'pointer' }}
                >
                    Attendance Settings
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                {reports.map((report, i) => (
                    <div key={i} 
                        onClick={() => navigate(report.path)}
                        style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', gap: '16px', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = report.color; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ width: '48px', height: '48px', background: `${report.color}15`, color: report.color, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <report.icon size={24} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>{report.title}</div>
                            <div style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 16px' }}>{report.desc}</div>
                            <div style={{ color: report.color, fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                View Report &rarr;
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '40px', padding: '24px', background: '#fff', borderRadius: '20px', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
                    Select a report to view and analyze attendance data. You can download individual reports within each page.
                </p>
            </div>
        </div>
    );
};

export default HRReportsPage;
