import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, Truck, Package, Wrench, Search,
    Filter, ArrowRight, Clipboard, Clock, CheckCircle
} from 'lucide-react';
import { getComplaints } from '@/services/serviceApi';
import { PATHS } from '@/routes/paths';

const ReplacementDashboard = () => {
    const navigate = useNavigate();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    useEffect(() => {
        setLoading(true);
        getComplaints({ limit: 100 })
            .then(res => {
                setComplaints(res.data || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const filtered = complaints.filter(c => {
        const matchesSearch = (c.complaintNo + c.customerName + (c.salesInvoiceNo || '')).toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const stats = {
        total: complaints.length,
        open: complaints.filter(c => ['Open', 'Waiting Faulty Return'].includes(c.status)).length,
        completed: complaints.filter(c => c.status === 'Closed').length,
        pendingReplacement: complaints.filter(c => c.status === 'Faulty Fully Received').length
    };

    return (
        <div style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Replacement Tracking Dashboard</h1>
                    <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '14px' }}>Monitor status of customer replacements from complaint to fulfillment.</p>
                </div>
                <button onClick={() => navigate('/service/complaints/new')}
                    style={{ padding: '10px 20px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={18} /> Book New Complaint
                </button>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={statCard('#eff6ff', '#1d4ed8')}>
                    <div style={statIcon}><AlertTriangle size={20} /></div>
                    <div><div style={statLabel}>Total Complaints</div><div style={statValue}>{stats.total}</div></div>
                </div>
                <div style={statCard('#fef2f2', '#dc2626')}>
                    <div style={statIcon}><Clock size={20} /></div>
                    <div><div style={statLabel}>Under Process</div><div style={statValue}>{stats.open}</div></div>
                </div>
                <div style={statCard('#fffbeb', '#d97706')}>
                    <div style={statIcon}><Package size={20} /></div>
                    <div><div style={statLabel}>Pending Replacement</div><div style={statValue}>{stats.pendingReplacement}</div></div>
                </div>
                <div style={statCard('#f0fdf4', '#166534')}>
                    <div style={statIcon}><CheckCircle size={20} /></div>
                    <div><div style={statLabel}>Closed / Resolved</div><div style={statValue}>{stats.completed}</div></div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                        placeholder="Search by Complaint #, Customer, or Invoice..."
                        style={filterInput}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={16} color="#64748b" />
                    <select style={filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option>All</option>
                        <option>Open</option>
                        <option>Waiting Faulty Return</option>
                        <option>Faulty Fully Received</option>
                        <option>Replacement Sent</option>
                        <option>Closed</option>
                    </select>
                </div>
            </div>

            {/* Dashboard Table */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={th}>Complaint Details</th>
                            <th style={th}>Replacement Method</th>
                            <th style={th}>Procurement (PO)</th>
                            <th style={th}>Receipt (GRN)</th>
                            <th style={th}>Dispatch (CHALLAN)</th>
                            <th style={th}>Status</th>
                            <th style={th}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading dashboard data...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No matching complaints found.</td></tr>
                        ) : filtered.map(c => (
                            <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={td}>
                                    <div style={{ fontWeight: 800, color: '#1e293b' }}>{c.complaintNo}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{c.customerName}</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Inv: {c.salesInvoiceNo || 'N/A'}</div>
                                </td>
                                <td style={td}>
                                    <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px', color: '#475569', fontWeight: 600 }}>
                                        {c.replacementType || 'Purchase Replace'}
                                    </span>
                                </td>
                                <td style={td}>
                                    {c.linkedPO ? (
                                        <div style={{ color: '#2563eb', fontWeight: 600 }}>{c.linkedPO.poNumber}</div>
                                    ) : (
                                        <button onClick={() => navigate(`/purchase/orders/new?complaintId=${c._id}&complaintNo=${c.complaintNo}`)}
                                            style={miniBtn('#dbeafe', '#1e40af')}>+ Link PO</button>
                                    )}
                                </td>
                                <td style={td}>
                                    {c.linkedGRN ? (
                                        <div style={{ color: '#059669', fontWeight: 600 }}>{c.linkedGRN.grnNumber}</div>
                                    ) : (
                                        <span style={{ color: '#94a3b8' }}>— No GRN —</span>
                                    )}
                                </td>
                                <td style={td}>
                                    {c.dispatches?.length > 0 ? (
                                        <div style={{ color: '#7c3aed', fontWeight: 600 }}>{c.dispatches[0].doNo}</div>
                                    ) : (
                                        <button onClick={() => navigate(`/service/replacement-dispatches/new?complaintId=${c._id}&complaintNo=${c.complaintNo}&customer=${c.customerName}`)}
                                            style={miniBtn('#ede9fe', '#5b21b6')}>+ Dispatch</button>
                                    )}
                                </td>
                                <td style={td}>
                                    <span style={statusBadge(c.status)}>{c.status}</span>
                                </td>
                                <td style={td}>
                                    <button onClick={() => navigate(`/service/complaints/${c._id}`)}
                                        style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                                        Details <ArrowRight size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// Styles
const statCard = (bg, color) => ({
    background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', gap: '16px', borderLeft: `5px solid ${color}`
});
const statIcon = { width: '40px', height: '40px', background: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' };
const statLabel = { fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' };
const statValue = { fontSize: '24px', fontWeight: 800, color: '#1e293b' };
const filterInput = { width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' };
const filterSelect = { padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', background: '#fff', color: '#475569' };
const th = { padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' };
const td = { padding: '12px 16px' };
const miniBtn = (bg, color) => ({ background: bg, color: color, border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' });
const statusBadge = (s) => {
    let color = '#475569', bg = '#f1f5f9';
    if (s === 'Open') { bg = '#fee2e2'; color = '#991b1b'; }
    if (s.includes('Waiting')) { bg = '#fffbeb'; color = '#92400e'; }
    if (s.includes('Replacement Sent')) { bg = '#dbeafe'; color = '#1e40af'; }
    if (s === 'Closed') { bg = '#d1fae5'; color = '#065f46'; }
    return { background: bg, color: color, padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' };
};

export default ReplacementDashboard;
