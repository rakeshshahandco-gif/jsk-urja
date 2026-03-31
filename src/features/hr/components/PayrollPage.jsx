import React from 'react';
import { Briefcase, CreditCard, DollarSign, Calculator, Download, CheckCircle } from 'lucide-react';

const PayrollPage = () => {
    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>Payroll Processing</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Calculate salaries, generate payslips, and manage statutory deductions</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button style={{ height: '40px', padding: '0 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <Download size={16} /> Salary Group Template
                    </button>
                    <button style={{ height: '40px', padding: '0 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}>
                        <Calculator size={16} /> Run Payroll
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', padding: '60px 40px', borderRadius: '24px', border: '1px solid #f1f5f9', textAlign: 'center', marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginBottom: '40px' }}>
                    {[
                        { label: 'Basic Salary', icon: DollarSign, color: '#2563eb' },
                        { label: 'Tax Deductions', icon: CreditCard, color: '#dc2626' },
                        { label: 'Final Payout', icon: Briefcase, color: '#059669' }
                    ].map((step, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '64px', height: '64px', background: `${step.color}15`, color: step.color, borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <step.icon size={28} />
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{step.label}</div>
                        </div>
                    ))}
                </div>

                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', marginBottom: '12px' }}>Enterprise Payroll Engine</h3>
                <p style={{ fontSize: '15px', color: '#64748b', maxWidth: '450px', margin: '0 auto', lineHeight: '1.6' }}>
                    We are currently refining the salary computation engine for advanced tax compliance and multi-component salary structures. 
                    Your payroll processes will be available soon.
                </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '20px', border: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '32px', height: '32px', background: '#dcfce7', borderRadius: '50%', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={18} />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Data Syncing with Employee Master Is Ready</span>
                </div>
            </div>
        </div>
    );
};

export default PayrollPage;
