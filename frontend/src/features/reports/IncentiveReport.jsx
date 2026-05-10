import React, { useState, useEffect } from 'react';
import { getIncentiveReport } from '@/services/salesApi';
import { getUsers } from '@/services/userApi';
import { getDistributors } from '@/services/distributorApi';
import { Search, Filter, Download, ArrowUpRight, CheckCircle2, Clock, AlertCircle, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const StatCard = ({ title, value, icon: Icon, color, subValue }) => (
    <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{title}</span>
            <div style={{ padding: '8px', borderRadius: '12px', background: `${color}10`, color: color }}>
                <Icon size={20} />
            </div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>{value}</div>
        {subValue && <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>{subValue}</div>}
    </div>
);

const IncentiveReport = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ results: [], summary: {} });
    const [salespeople, setSalespeople] = useState([]);
    const [distributors, setDistributors] = useState([]);
    const [filters, setFilters] = useState({
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0],
        salespersonId: '',
        distributorId: '',
        status: ''
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getIncentiveReport(filters);
            setData(res);
        } catch (error) {
            toast.error('Failed to load report data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filters]);

    useEffect(() => {
        getUsers({ role: 'sales' }).then(res => setSalespeople(res.users || res.data || [])).catch(() => {});
        getDistributors().then(res => setDistributors(res.results || res || [])).catch(() => {});
    }, []);

    const exportToExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(data.results.map(r => ({
            'Invoice No': r.invoiceNumber,
            'Date': new Date(r.invoiceDate).toLocaleDateString(),
            'Customer': r.customerName,
            'Taxable Amt': r.taxableAmount,
            'Source': r.referralSource,
            'Beneficiary': r.beneficiary,
            'Incentive Type': r.incentiveType,
            'Value': r.incentiveValue,
            'Incentive Amt': r.incentiveAmount,
            'Status': r.status,
            'Paid Amt': r.paidAmount,
            'Paid Date': r.paidDate ? new Date(r.paidDate).toLocaleDateString() : ''
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Incentives');
        XLSX.writeFile(workbook, `Incentive_Report_${filters.dateFrom}_to_${filters.dateTo}.xlsx`);
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Inter', sans-serif", color: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Incentive & Referral Analysis</h1>
                    <p style={{ color: '#64748b', marginTop: '4px', fontSize: '14px' }}>Track and manage payouts for internal sales staff and external partners.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={exportToExcel}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', color: '#475569', fontWeight: 600, fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        <Download size={18} /> Export Excel
                    </button>
                    <button 
                        onClick={fetchData}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#0d9488', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(13,148,136,0.2)' }}
                    >
                        <Filter size={18} /> Refresh Report
                    </button>
                </div>
            </div>

            {/* Stats Dashboard */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                <StatCard 
                    title="Total Incentive Pool" 
                    value={`₹${(data.summary?.totalIncentive || 0).toLocaleString('en-IN')}`} 
                    icon={IndianRupee} 
                    color="#0d9488"
                    subValue={`Across ${(data.results?.length || 0)} transactions`}
                />
                <StatCard 
                    title="Pending Payouts" 
                    value={`₹${((data.summary?.totalIncentive || 0) - (data.summary?.paidAmount || 0)).toLocaleString('en-IN')}`} 
                    icon={Clock} 
                    color="#f59e0b"
                    subValue={`${data.summary?.pendingCount || 0} documents awaiting approval`}
                />
                <StatCard 
                    title="Disbursed Incentives" 
                    value={`₹${(data.summary?.paidAmount || 0).toLocaleString('en-IN')}`} 
                    icon={CheckCircle2} 
                    color="#10b981"
                />
                <StatCard 
                    title="Gross Sales (Tracked)" 
                    value={`₹${(data.summary?.totalTaxable || 0).toLocaleString('en-IN')}`} 
                    icon={ArrowUpRight} 
                    color="#6366f1"
                />
            </div>

            {/* Filters Bar */}
            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>From Date</label>
                    <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }} />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>To Date</label>
                    <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }} />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Salesperson</label>
                    <select value={filters.salespersonId} onChange={e => setFilters(p => ({ ...p, salespersonId: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}>
                        <option value="">All Staff</option>
                        {salespeople.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Distributor</label>
                    <select value={filters.distributorId} onChange={e => setFilters(p => ({ ...p, distributorId: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}>
                        <option value="">All Partners</option>
                        {distributors.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Status</label>
                    <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}>
                        <option value="">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Paid">Paid</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                </div>
            </div>

            {/* Main Table */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Invoice</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Beneficiary</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Sales Amt</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Incentive</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Calculation</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                            <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Calculating report data...</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No incentive records found for selected period.</td></tr>
                        ) : (
                            data.results.map((r, idx) => (
                                <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: 700, color: '#0d9488' }}>{r.invoiceNumber}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{new Date(r.invoiceDate).toLocaleDateString()}</div>
                                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>{r.customerName}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: 600 }}>{r.beneficiary}</div>
                                        <div style={{ fontSize: '10px', padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', display: 'inline-block', marginTop: '4px', color: '#64748b' }}>{r.referralSource}</div>
                                    </td>
                                    <td style={{ padding: '16px', fontWeight: 600 }}>₹{r.taxableAmount?.toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>₹{r.incentiveAmount?.toLocaleString('en-IN')}</div>
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '12px', color: '#64748b' }}>
                                        {r.incentiveType === 'Percentage of sales' 
                                            ? `${r.incentiveValue}% of Sales` 
                                            : `Fixed ₹${r.incentiveValue}`}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ 
                                            padding: '4px 10px', 
                                            borderRadius: '20px', 
                                            fontSize: '11px', 
                                            fontWeight: 700, 
                                            display: 'inline-block',
                                            background: r.status === 'Paid' ? '#ecfdf5' : r.status === 'Approved' ? '#eff6ff' : '#fff7ed',
                                            color: r.status === 'Paid' ? '#059669' : r.status === 'Approved' ? '#2563eb' : '#d97706',
                                            border: `1px solid ${r.status === 'Paid' ? '#10b981' : r.status === 'Approved' ? '#3b82f6' : '#f59e0b'}30`
                                        }}>
                                            {r.status}
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button 
                                            style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#475569' }}
                                            onClick={() => toast.error('Management UI coming soon')}
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default IncentiveReport;
