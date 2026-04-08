import React, { useState, useEffect } from 'react';
import { Search, Calendar, FileText, User, Filter, ArrowDownToLine, Clock, HelpCircle, CheckCircle, XCircle } from 'lucide-react';
import api from '../../../services/api';
import moment from 'moment';

const MonthlySummaryReport = () => {
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(moment().format('MM'));
    const [year, setYear] = useState(moment().format('YYYY'));
    const [employees, setEmployees] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState('');

    useEffect(() => {
        fetchInitialData();
        fetchReport();
    }, []);

    const fetchInitialData = async () => {
        try {
            const empRes = await api.get('/hr/employees');
            setEmployees(empRes.data.data);
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        }
    };

    const fetchReport = async () => {
        setLoading(true);
        try {
            const response = await api.get('/hr/reports/monthly-summary', {
                params: { month, year, employee: selectedEmployee }
            });
            setReportData(response.data.data);
        } catch (error) {
            console.error('Failed to fetch monthly summary:', error);
        } finally {
            setLoading(false);
        }
    };

    const months = [
        { val: '01', label: 'January' }, { val: '02', label: 'February' }, { val: '03', label: 'March' },
        { val: '04', label: 'April' }, { val: '05', label: 'May' }, { val: '06', label: 'June' },
        { val: '07', label: 'July' }, { val: '08', label: 'August' }, { val: '09', label: 'September' },
        { val: '10', label: 'October' }, { val: '11', label: 'November' }, { val: '12', label: 'December' }
    ];

    const currentYear = parseInt(moment().format('YYYY'));
    const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());

    return (
        <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Monthly Attendance Summary</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Monthly breakdown of attendance, leaves, and paid days for payroll</p>
                </div>
            </div>

            <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Month</label>
                    <select 
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    >
                        {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Year</label>
                    <select 
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Employee</label>
                    <select 
                        value={selectedEmployee}
                        onChange={(e) => setSelectedEmployee(e.target.value)}
                        style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    >
                        <option value="">All Employees</option>
                        {employees.map(e => <option key={e._id} value={e._id}>{e.employeeName}</option>)}
                    </select>
                </div>
                <button 
                    onClick={fetchReport}
                    style={{ height: '40px', padding: '0 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Search size={18} /> Search
                </button>
            </div>

            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Employee</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Month</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Total Days</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#16a34a' }}>Present</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#d97706' }}>Half Day</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#dc2626' }}>Absent</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#0ea5e9' }}>Sundays</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#0ea5e9' }}>Holidays</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#6366f1' }}>Paid Non-Working</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Late/Miss</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#f59e0b' }}>Salary Working Days</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading summary data...</td>
                            </tr>
                        ) : reportData.length === 0 ? (
                            <tr>
                                <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No summary found for selected month.</td>
                            </tr>
                        ) : reportData.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{row.employeeName}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{row.employeeCode}</div>
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#475569' }}>{row.month}</td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#475569' }}>{row.totalDays}</td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ fontWeight: '800', color: '#16a34a' }}>{row.present}</span>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ fontWeight: '800', color: '#d97706' }}>{row.halfDay}</span>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ fontWeight: '800', color: '#dc2626' }}>{row.absent}</span>
                                </td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#0ea5e9' }}>{row.sundays}</td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#0ea5e9' }}>{row.holidays}</td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#6366f1' }}>{row.paidNonWorkingDays}</td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '700' }}>
                                        <div style={{ color: '#b45309' }}>Late: {row.late}</div>
                                        <div style={{ color: '#b91c1c' }}>Miss: {row.missingCheckout}</div>
                                    </div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ 
                                        padding: '4px 12px', 
                                        borderRadius: '8px', 
                                        fontSize: '14px', 
                                        fontWeight: '900', 
                                        background: '#fff7ed',
                                        color: '#9a3412',
                                        border: '1px solid #ffedd5'
                                    }}>
                                        {row.salaryWorkingDays}
                                    </span>
                                </td>

                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MonthlySummaryReport;
