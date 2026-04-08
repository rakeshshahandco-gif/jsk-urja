import React, { useState, useEffect } from 'react';
import { Search, Calendar, FileText, User, Filter, ArrowDownToLine, Clock, HelpCircle, CheckCircle, Calculator } from 'lucide-react';
import api from '../../../services/api';
import moment from 'moment';

const SalaryWorkingReport = () => {
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(moment().format('MM'));
    const [year, setYear] = useState(moment().format('YYYY'));
    const [employees, setEmployees] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [departments, setDepartments] = useState([]);
    const [selectedDept, setSelectedDept] = useState('');

    useEffect(() => {
        fetchInitialData();
        fetchReport();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [empRes, deptRes] = await Promise.all([
                api.get('/hr/employees'),
                api.get('/hr/departments')
            ]);
            setEmployees(empRes.data.data);
            setDepartments(deptRes.data.data);
        } catch (error) {
            console.error('Failed to fetch filter data:', error);
        }
    };

    const fetchReport = async () => {
        setLoading(true);
        try {
            const response = await api.get('/hr/reports/salary-working', {
                params: { month, year, employee: selectedEmployee, department: selectedDept }
            });
            setReportData(response.data.data);

        } catch (error) {
            console.error('Failed to fetch salary report:', error);
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
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Salary Working Report</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Final payable days calculation for payroll generation</p>
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
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Department</label>
                    <select 
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    >
                        <option value="">All Departments</option>
                        {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
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
                    style={{ height: '40px', padding: '0 24px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Search size={18} /> Calculate Salary
                </button>
            </div>


            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Employee</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Month Days</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Present</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Half Day</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Sun / Hol</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Absent</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>Payable Days</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Basis</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Calculating salary basis...</td>
                            </tr>
                        ) : reportData.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No records found.</td>
                            </tr>
                        ) : reportData.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{row.employee}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{row.employeeCode} | {row.department}</div>
                                </td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#475569' }}>{row.totalDays}</td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#16a34a' }}>{row.present}</td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#d97706' }}>{row.halfDay}</td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>{row.sundays + row.holidays}</td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>{row.absent}</td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ 
                                        padding: '6px 14px', 
                                        borderRadius: '10px', 
                                        fontSize: '16px', 
                                        fontWeight: '900', 
                                        background: '#0f172a',
                                        color: '#fff',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                    }}>
                                        {row.totalPayableDays}
                                    </span>
                                </td>
                                <td style={{ padding: '16px', fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                                    {row.salaryWorkingBasis}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SalaryWorkingReport;
