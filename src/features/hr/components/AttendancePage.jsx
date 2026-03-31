import React from 'react';
import { Calendar, Filter, Download, UserCheck } from 'lucide-react';

const AttendancePage = () => {
    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>Attendance Tracking</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Monitor daily punch-ins, late arrivals, and absent staff</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button style={{ height: '40px', padding: '0 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <Filter size={16} /> Filters
                    </button>
                    <button style={{ height: '40px', padding: '0 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}>
                        <Download size={16} /> Export Report
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #f1f5f9', padding: '80px 40px', textAlign: 'center' }}>
                <div style={{ width: '80px', height: '80px', background: '#eff6ff', borderRadius: '24px', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <Calendar size={40} />
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', marginBottom: '12px' }}>Daily Attendance View</h2>
                <p style={{ fontSize: '16px', color: '#64748b', maxWidth: '500px', margin: '0 auto 32px', lineHeight: '1.6' }}>
                    The high-performance attendance tracking interface is currently being optimized for biometric synchronization. 
                    Manage your workforce attendance records seamlessly here soon.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                    <div style={{ padding: '16px 24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Module Status</div>
                        <div style={{ fontSize: '16px', color: '#059669', fontWeight: '800', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <UserCheck size={18} /> Setting Up
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AttendancePage;
