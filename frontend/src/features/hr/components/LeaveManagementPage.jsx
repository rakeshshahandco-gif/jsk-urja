import React from 'react';
import { FileText, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';

const LeaveManagementPage = () => {
    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>Leave Management</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Approve, track, and manage employee time-off requests</p>
                </div>
                <button style={{ height: '40px', padding: '0 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}>
                    <Plus size={18} /> Apply Leave
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                {[
                    { label: 'Pending Requests', value: '3', color: '#dc2626', icon: Clock },
                    { label: 'Approved this Month', value: '12', color: '#059669', icon: CheckCircle },
                    { label: 'Upcoming Leaves', value: '5', color: '#2563eb', icon: Calendar }
                ].map((stat, i) => (
                    <div key={i} style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>{stat.label}</div>
                            <div style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', marginTop: '4px' }}>{stat.value}</div>
                        </div>
                        <div style={{ width: '48px', height: '48px', background: `${stat.color}15`, color: stat.color, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <stat.icon size={24} />
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', margin: 0 }}>Recent Leave Requests</h3>
                </div>
                <div style={{ padding: '100px 40px', textAlign: 'center' }}>
                    <div style={{ width: '80px', height: '80px', background: '#fef2f2', borderRadius: '24px', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                        <FileText size={40} />
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>Leave Management System</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>
                        The automated leave approval workflow is being integrated with our payroll engine. Request tracking will be available soon.
                    </p>
                </div>
            </div>
        </div>
    );
};

// Re-importing Calendar icon because it's used in the map
import { Calendar } from 'lucide-react';

export default LeaveManagementPage;
