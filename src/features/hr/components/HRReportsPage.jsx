import React from 'react';
import { BarChart, PieChart, FileText, Download, Users, TrendingUp } from 'lucide-react';

const HRReportsPage = () => {
    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>HR Reports</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Generate and export detailed workforce and operational reports</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                {[
                    { title: 'Employee Directory', desc: 'Full list of employees with all details', icon: Users, color: '#2563eb' },
                    { title: 'Monthly Attendance', desc: 'Summary of attendance and late marks', icon: BarChart, color: '#059669' },
                    { title: 'Leave Summary', desc: 'Track pending and approved requests', icon: PieChart, color: '#dc2626' },
                    { title: 'Salary Register', desc: 'Detailed payroll reports by month', icon: FileText, color: '#d97706' },
                    { title: 'Trend Analysis', desc: 'Workforce growth and attrition metrics', icon: TrendingUp, color: '#7c3aed' }
                ].map((report, i) => (
                    <div key={i} style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', gap: '16px', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = report.color; e.currentTarget.style.transform = 'translateY(-4px)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <div style={{ width: '48px', height: '48px', background: `${report.color}15`, color: report.color, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <report.icon size={24} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>{report.title}</div>
                            <div style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 16px' }}>{report.desc}</div>
                            <button style={{ background: 'none', border: 'none', padding: 0, color: report.color, fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <Download size={14} /> Download Report
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '40px', padding: '24px', background: '#fff', borderRadius: '20px', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
                    Our reporting module is being integrated with high-performance analytics tools. More reports will follow soon.
                </p>
            </div>
        </div>
    );
};

export default HRReportsPage;
