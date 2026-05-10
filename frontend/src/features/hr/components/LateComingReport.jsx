import React, { useState, useEffect } from 'react';
import { Search, Calendar, FileText, User, Filter, ArrowDownToLine, Clock, AlertCircle, TrendingUp, TrendingDown, LogOut, LogIn } from 'lucide-react';
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
            console.error('Failed to fetch performance report:', error);
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

    // --- AGGREGATION LOGIC FOR PERFORMANCE MATRIX ---
    const employeeSummary = reportData.reduce((acc, row) => {
        const key = row.employeeCode;
        if (!acc[key]) {
            acc[key] = {
                name: row.employeeName,
                code: row.employeeCode,
                lateInDays: 0, lateInMins: 0,
                earlyInDays: 0, earlyInMins: 0,
                earlyOutDays: 0, earlyOutMins: 0,
                lateOutDays: 0, lateOutMins: 0
            };
        }
        if (row.isLateIn) { acc[key].lateInDays++; acc[key].lateInMins += (row.lateInMinutes || 0); }
        if (row.isEarlyIn) { acc[key].earlyInDays++; acc[key].earlyInMins += (row.earlyInMinutes || 0); }
        if (row.isEarlyOut) { acc[key].earlyOutDays++; acc[key].earlyOutMins += (row.earlyOutMinutes || 0); }
        if (row.isLateOut) { acc[key].lateOutDays++; acc[key].lateOutMins += (row.lateOutMinutes || 0); }
        return acc;
    }, {});

    const summaryList = Object.values(employeeSummary);

    return (
        <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Time Performance & Adherence</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Comprehensive analysis of arrival/departure punctuality</p>
                </div>
            </div>

            <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Month</label>
                    <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}>
                        {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Year</label>
                    <select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>Employee</label>
                    <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}>
                        <option value="">All Employees</option>
                        {employees.map(e => <option key={e._id} value={e._id}>{e.employeeName}</option>)}
                    </select>
                </div>
                <button onClick={fetchReport} style={{ height: '40px', padding: '0 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={18} /> Search
                </button>
            </div>

            {/* --- PERFORMANCE MATRIX (PER EMPLOYEE SUMMARY) --- */}
            {summaryList.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={20} color="#2563eb" /> Employee Performance Summary
                    </h3>
                    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '800', color: '#475569' }}>Staff</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '800', color: '#dc2626' }}>Late Count (Total Time)</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '800', color: '#16a34a' }}>Early Arrival</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '800', color: '#ea580c' }}>Early Exit</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '800', color: '#2563eb' }}>Late Exit (Stay)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaryList.map((emp, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ fontWeight: '700', color: '#111827', fontSize: '13px' }}>{emp.name}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{emp.code}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ color: '#dc2626', fontWeight: '800', fontSize: '14px' }}>{emp.lateInDays} Days</div>
                                            <div style={{ fontSize: '11px', color: '#ef4444' }}>{emp.lateInMins} mins total</div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ color: '#16a34a', fontWeight: '800', fontSize: '14px' }}>{emp.earlyInDays} Days</div>
                                            <div style={{ fontSize: '11px', color: '#22c55e' }}>{emp.earlyInMins} mins total</div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ color: '#ea580c', fontWeight: '800', fontSize: '14px' }}>{emp.earlyOutDays} Times</div>
                                            <div style={{ fontSize: '11px', color: '#f97316' }}>{emp.earlyOutMins} mins lost</div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ color: '#2563eb', fontWeight: '800', fontSize: '14px' }}>{emp.lateOutDays} Times</div>
                                            <div style={{ fontSize: '11px', color: '#3b82f6' }}>{emp.lateOutMins} mins stay</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- DETAILED RECORD LIST --- */}
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="#2563eb" /> Daily Adherence Records
            </h3>
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: '800', color: '#475569' }}>Employee</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: '800', color: '#475569' }}>Date</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: '800', color: '#475569' }}>In Time (Arrival)</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: '800', color: '#475569' }}>Out Time (Exit)</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: '800', color: '#475569' }}>Performance Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading record data...</td></tr>
                        ) : reportData.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No adherence deviations found.</td></tr>
                        ) : reportData.map((row, idx) => {
                            const formatTime = (t) => {
                                if (!t || !t.includes(':')) return t;
                                const m = t.match(/(\d{1,2}):(\d{1,2})/);
                                return m ? `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}` : t;
                            };

                            return (
                                <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: '700', color: '#1e293b' }}>{row.employeeName}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>{row.employeeCode}</div>
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '13px', color: '#475569' }}>
                                        {moment.utc(row.date).format('DD MMM YYYY')}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <LogIn size={14} color="#64748b" />
                                            <div style={{ fontWeight: '700', fontSize: '14px' }}>{formatTime(row.inTime)}</div>
                                            {row.isLateIn && <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>LATE {row.lateInMinutes}m</span>}
                                            {row.isEarlyIn && <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>EARLY {row.earlyInMinutes}m</span>}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '22px' }}>Shift Start: {row.shiftTime}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <LogOut size={14} color="#64748b" />
                                            <div style={{ fontWeight: '700', fontSize: '14px' }}>{formatTime(row.outTime)}</div>
                                            {row.isEarlyOut && <span style={{ background: '#fff7ed', color: '#ea580c', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>LEFT EARLY {row.earlyOutMinutes}m</span>}
                                            {row.isLateOut && <span style={{ background: '#eff6ff', color: '#2563eb', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>STAYED LATE {row.lateOutMinutes}m</span>}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '22px' }}>Shift End: {row.shiftEndTime}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b' }}>
                                            {row.status}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LateComingReport;
