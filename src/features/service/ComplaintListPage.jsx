import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Plus, Eye, Search, Filter } from 'lucide-react';
import { getComplaints } from '@/services/serviceApi';
import { useToast } from '@/components/ui/Toast';

const STATUS_COLORS = {
    'Open': { bg: '#fee2e2', color: '#991b1b' },
    'Under Review': { bg: '#fef3c7', color: '#92400e' },
    'Approved': { bg: '#d1fae5', color: '#065f46' },
    'Replacement Sent': { bg: '#dbeafe', color: '#1e40af' },
    'Waiting Faulty Return': { bg: '#ede9fe', color: '#5b21b6' },
    'Faulty Partially Received': { bg: '#fce7f3', color: '#9d174d' },
    'Faulty Fully Received': { bg: '#d1fae5', color: '#065f46' },
    'In QC': { bg: '#e0f2fe', color: '#0369a1' },
    'Repair In Process': { bg: '#fef9c3', color: '#713f12' },
    'Closed': { bg: '#f0fdf4', color: '#166534' },
    'Closed with Scrap': { bg: '#f3f4f6', color: '#374151' },
    'Cancelled': { bg: '#f3f4f6', color: '#6b7280' },
};

const StatusBadge = ({ status }) => {
    const style = STATUS_COLORS[status] || { bg: '#f3f4f6', color: '#374151' };
    return (
        <span style={{ background: style.bg, color: style.color, padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {status}
        </span>
    );
};

const daysSince = (date) => Math.floor((Date.now() - new Date(date)) / 86400000);

const ComplaintListPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const res = await getComplaints({ search, status: statusFilter, limit: 100 });
            setData(res.data || []);
        } catch { addToast('Failed to load complaints', 'error'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [search, statusFilter]);

    return (
        <div style={{ padding: '12px 16px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={18} color="#dc2626" />
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Customer Complaints</span>
                    <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{data.length}</span>
                </div>
                <button onClick={() => navigate('/service/complaints/new')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> New Complaint
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, padding: '0 10px', flex: 1, maxWidth: 280 }}>
                    <Search size={13} color="#9ca3af" />
                    <input placeholder="Search complaint / customer..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', fontSize: 12, flex: 1, height: 32, background: 'transparent' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, background: '#fff', cursor: 'pointer' }}>
                    <option value="">All Status</option>
                    {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                            {['Complaint No', 'Date', 'Customer', 'Items (1st)', 'Faulty Qty', 'Dispatched', 'Received', 'Pending', 'Status', 'Age', ''].map(h => (
                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No complaints found. <button onClick={() => navigate('/service/complaints/new')} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Create one →</button></td></tr>
                        ) : data.map((c, i) => {
                            const firstItem = c.items?.[0];
                            const totalFaulty = c.items?.reduce((s, it) => s + it.qtyFaultyReported, 0) || 0;
                            const totalDispatched = c.items?.reduce((s, it) => s + (it.dispatchedQty || 0), 0) || 0;
                            const totalReceived = c.items?.reduce((s, it) => s + (it.faultyReceivedQty || 0), 0) || 0;
                            const totalPending = c.items?.reduce((s, it) => s + (it.pendingReturnQty || 0), 0) || 0;
                            return (
                                <tr key={c._id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{c.complaintNo}</td>
                                    <td style={{ padding: '8px 10px', color: '#374151' }}>{new Date(c.date).toLocaleDateString('en-IN')}</td>
                                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#111827', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customerName}</td>
                                    <td style={{ padding: '8px 10px', color: '#374151', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstItem?.itemName || '—'}</td>
                                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#dc2626', textAlign: 'center' }}>{totalFaulty}</td>
                                    <td style={{ padding: '8px 10px', color: '#1d4ed8', textAlign: 'center' }}>{totalDispatched}</td>
                                    <td style={{ padding: '8px 10px', color: '#059669', textAlign: 'center' }}>{totalReceived}</td>
                                    <td style={{ padding: '8px 10px', fontWeight: totalPending > 0 ? 700 : 400, color: totalPending > 0 ? '#d97706' : '#6b7280', textAlign: 'center' }}>{totalPending}</td>
                                    <td style={{ padding: '8px 10px' }}><StatusBadge status={c.status} /></td>
                                    <td style={{ padding: '8px 10px', color: daysSince(c.date) > 30 ? '#dc2626' : '#6b7280', fontWeight: daysSince(c.date) > 30 ? 700 : 400 }}>{daysSince(c.date)}d</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <button onClick={() => navigate(`/service/complaints/${c._id}`)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, cursor: 'pointer', color: '#374151' }}>
                                            <Eye size={12} /> View
                                        </button>
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

export default ComplaintListPage;
