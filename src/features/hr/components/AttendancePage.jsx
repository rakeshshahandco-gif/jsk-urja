import React, { useState, useEffect } from 'react';
import { Calendar, Filter, Download, UserCheck, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import api from '../../../services/api';
import toast from 'react-hot-toast';
import moment from 'moment';

const AttendancePage = () => {
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(moment().format('MM'));
    const [selectedYear, setSelectedYear] = useState(moment().format('YYYY'));

    useEffect(() => {
        fetchAttendance();
    }, [selectedMonth, selectedYear]);

    const fetchAttendance = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/hr/attendance?month=${selectedMonth}&year=${selectedYear}`);
            setAttendanceData(res.data.data);
        } catch (error) {
            console.error('Error fetching attendance:', error);
            toast.error('Failed to load attendance records');
        } finally {
            setLoading(false);
        }
    };

    const getStatusStyles = (status) => {
        switch(status) {
            case 'Present': return { bg: '#dcfce7', text: '#16a34a', icon: <CheckCircle size={14} /> };
            case 'Absent': return { bg: '#fee2e2', text: '#ef4444', icon: <XCircle size={14} /> };
            case 'Late': return { bg: '#ffedd5', text: '#f97316', icon: <Clock size={14} /> };
            case 'Half Day': return { bg: '#fef3c7', text: '#d97706', icon: <AlertCircle size={14} /> };
            case 'Holiday': return { bg: '#eff6ff', text: '#2563eb', icon: <Calendar size={14} /> };
            default: return { bg: '#f1f5f9', text: '#64748b', icon: <UserCheck size={14} /> };
        }
    };

    const handleExport = () => {
        if (!attendanceData.length) return toast.error('No data to export');
        
        const headers = ['Date', 'Employee Name', 'Employee Code', 'Department', 'Status', 'Check In', 'Check Out', 'Remarks'];
        const csvRows = [
            headers.join(','),
            ...attendanceData.map(row => [
                moment(row.date).format('YYYY-MM-DD'),
                `"${row.employee?.employeeName || 'Unknown'}"`,
                row.employee?.employeeCode || 'N/A',
                `"${row.employee?.department?.name || 'No Dept'}"`,
                row.status,
                row.checkIn || '',
                row.checkOut || '',
                `"${row.remarks || ''}"`
            ].join(','))
        ];
        
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Attendance_Report_${selectedMonth}_${selectedYear}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
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
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>Attendance Tracking</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Monitor daily punch-ins, late arrivals, and absent staff</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{ height: '40px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', outline: 'none' }}
                        >
                            {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                        </select>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(e.target.value)}
                            style={{ height: '40px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', outline: 'none' }}
                        >
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button 
                        onClick={handleExport}
                        style={{ height: '40px', padding: '0 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}
                    >
                        <Download size={16} /> Export Report
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #2563eb', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }}></div>
                        Loading records...
                        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : attendanceData.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                        <Calendar size={48} style={{ margin: '0 auto 16px', color: '#cbd5e1' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#475569' }}>No Attendance Data Found</h3>
                        <p style={{ fontSize: '14px', marginTop: '8px' }}>Select another period or import an Excel/CSV file.</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Employee</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Check In</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Check Out</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceData.map((record, idx) => {
                                const st = getStatusStyles(record.status);
                                return (
                                    <tr key={record._id || idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '16px 24px', fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>
                                            {moment(record.date).format('DD MMM YYYY')}
                                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400', marginTop: '2px' }}>{moment(record.date).format('dddd')}</div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{record.employee?.employeeName || 'Unknown'}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{record.employee?.employeeCode || 'N/A'} • {record.employee?.department?.name || 'No Dept'}</div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: st.bg, color: st.text, padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                                                {st.icon} {record.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 24px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
                                            {record.checkIn || '-'}
                                        </td>
                                        <td style={{ padding: '16px 24px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>
                                            {record.checkOut || '-'}
                                        </td>
                                        <td style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {record.remarks || '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default AttendancePage;
