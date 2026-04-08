import React, { useState, useEffect } from 'react';
import { Search, Calendar, FileText, User, Filter, ArrowDownToLine, Clock, AlertCircle } from 'lucide-react';
import api from '../../../services/api';
import moment from 'moment';

const DailyAttendanceReport = () => {
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(moment().format('YYYY-MM-DD'));
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
            const response = await api.get('/hr/reports/daily', {
                params: { date, department: selectedDept, employee: selectedEmployee }
            });
            setReportData(response.data.data);
        } catch (error) {
            console.error('Failed to fetch daily report:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Daily Attendance Report</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Detailed punch-in and status log for the selected date</p>
                </div>
                <button 
                    onClick={() => console.log('Export logic')}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
                >
                    <ArrowDownToLine size={16} /> Export Excel
                </button>
            </div>

            <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Date</label>
                    <input 
                        type="date" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    />
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
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
                        {employees.map(e => <option key={e._id} value={e._id}>{e.employeeName} ({e.employeeCode})</option>)}
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
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Department</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Date</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>In Time</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Out Time</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Working Hrs</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Status</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Day Type</th>
                            <th style={{ padding: '16px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>Flags</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading report data...</td>
                            </tr>
                        ) : reportData.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No records found for the selected filter.</td>
                            </tr>
                        ) : reportData.map((row) => (
                            <tr key={row._id} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{row.employee?.employeeName || 'Unknown'}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{row.employee?.employeeCode || 'N/A'}</div>
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#475569' }}>
                                    {row.employee?.department?.name || 'N/A'}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#475569' }}>
                                    {moment.utc(row.date).format('DD MMM YYYY')}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>
                                    {row.inTime || '--:--'}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>
                                    {row.outTime || '--:--'}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: '#475569' }}>
                                    {row.workingHours ? `${row.workingHours.toFixed(2)} hrs` : '0.00 hrs'}
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ 
                                        padding: '4px 10px', 
                                        borderRadius: '6px', 
                                        fontSize: '11px', 
                                        fontWeight: '800', 
                                        background: row.status === 'Present' ? '#f0fdf4' : row.status === 'Absent' ? '#fef2f2' : '#fffbeb',
                                        color: row.status === 'Present' ? '#16a33a' : row.status === 'Absent' ? '#dc2626' : '#d97706'
                                    }}>
                                        {row.status}
                                    </span>
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                                    {row.isHalfDay ? 'Half Day' : (row.status === 'Present' ? 'Full Day' : '---')}
                                </td>

                                <td style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {row.isLate && <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px' }}>LATE</span>}
                                        {row.isMissingCheckout && <span style={{ background: '#ffedd5', color: '#9a3412', fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px' }}>MISSING OUT</span>}
                                        {row.isHalfDay && <span style={{ background: '#f0f9ff', color: '#075985', fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px' }}>HALF DAY</span>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DailyAttendanceReport;
