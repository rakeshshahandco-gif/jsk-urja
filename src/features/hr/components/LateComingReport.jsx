import React, { useState, useEffect } from 'react';
import { Search, Calendar, FileText, User, Filter, ArrowDownToLine, Clock, AlertCircle } from 'lucide-react';
import api from '../../../services/api';
import moment from 'moment';

const LateComingReport = () => {
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
            const response = await api.get('/hr/reports/late-coming', {
                params: { month, year, employee: selectedEmployee }
            });
            setReportData(response.data.data);
        } catch (error) {
            console.error('Failed to fetch late coming report:', error);
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
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Late Coming Report</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>List of all late arrivals beyond the grace period</p>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Employee</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Date</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>In Time</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Shift Time</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Grace</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#dc2626' }}>Delay Minutes</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading report data...</td>
                            </tr>
                        ) : reportData.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No late coming records found.</td>
                            </tr>
                        ) : reportData.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{row.employeeName}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{row.employeeCode}</div>
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#475569' }}>
                                    {moment.utc(row.date).format('DD MMM YYYY')}
                                </td>

                                <td style={{ padding: '16px', fontSize: '14px', color: '#1e293b', fontWeight: '700' }}>
                                    {row.inTime}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#64748b' }}>
                                    {row.shiftTime}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#64748b' }}>
                                    {row.graceTime} min
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ color: '#dc2626', fontWeight: '800', fontSize: '14px' }}>
                                        {row.delayMinutes} min
                                    </span>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '6px' }}>
                                        LATE
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

export default LateComingReport;
