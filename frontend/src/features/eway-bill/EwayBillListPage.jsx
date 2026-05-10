import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEwayBills, deleteEwayBill } from '@/services/ewayBillApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { Plus, Search, Filter, Trash2, ExternalLink, Calendar, Truck, Clock } from 'lucide-react';

const th = { padding: '12px 15px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '2px solid #f1f5f9', fontSize: 11, textTransform: 'uppercase', background: '#fff' };
const td = { padding: '12px 15px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b' };
const badge = (status) => {
    let bg = '#f1f5f9', co = '#64748b';
    if (status === 'EWB Generated') { bg = '#f0fdf4'; co = '#16a34a'; }
    if (status === 'Draft') { bg = '#fffbeb'; co = '#d97706'; }
    if (status === 'Ready for JSON Export') { bg = '#eff6ff'; co = '#2563eb'; }
    if (status === 'Cancelled') { bg = '#fef2f2'; co = '#dc2626'; }
    return { background: bg, color: co, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 };
};

export default function EwayBillListPage() {
    const navigate = useNavigate();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [filters, setFilters] = useState({
        status: '',
        fromDate: '',
        toDate: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getEwayBills(filters);
            setList(res.data.ewayBills || []);
            setTotal(res.data.total || 0);
        } catch (e) {
            toast.error('Failed to load E-Way Bills');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this draft?')) return;
        try {
            await deleteEwayBill(id);
            toast.success('Deleted successfully');
            load();
        } catch (e) {
            toast.error('Failed to delete');
        }
    };

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

    return (
        <div style={{ padding: '24px 30px', background: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>E-Way Bill Tracking</h1>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Manage Part A/B drafts and generated E-Way bills</div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, marginBottom: 20, display: 'flex', gap: 15, alignItems: 'flex-end', border: '1px solid #e2e8f0' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 5 }}>STATUS</label>
                    <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', width: '100%', fontSize: 13 }}>
                        <option value="">All Statuses</option>
                        <option value="Draft">Draft</option>
                        <option value="Ready for JSON Export">Ready for JSON Export</option>
                        <option value="EWB Generated">EWB Generated</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 5 }}>FROM DATE</label>
                    <input type="date" value={filters.fromDate} onChange={e => setFilters(p => ({ ...p, fromDate: e.target.value }))} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 5 }}>TO DATE</label>
                    <input type="date" value={filters.toDate} onChange={e => setFilters(p => ({ ...p, toDate: e.target.value }))} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                </div>
                <button onClick={() => setFilters({ status: '', fromDate: '', toDate: '' })} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Reset</button>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading records...</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={th}>Invoice Info</th>
                                <th style={th}>Consignee</th>
                                <th style={th}>Transporter</th>
                                <th style={th}>EWB Number</th>
                                <th style={th}>Validity</th>
                                <th style={th}>Status</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.length === 0 ? <tr><td colSpan="7" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No E-Way Bill records found</td></tr> : list.map(item => (
                                <tr key={item._id} style={{ background: '#fff' }}>
                                    <td style={td}>
                                        <div style={{ fontWeight: 700 }}>{item.partA.docNo}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmtDate(item.partA.docDate)}</div>
                                    </td>
                                    <td style={td}>
                                        <div style={{ fontWeight: 600 }}>{item.partA.toTrdName}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.partA.toGstin || 'URP'}</div>
                                    </td>
                                    <td style={td}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Truck size={14} color="#94a3b8" />
                                            <span>{item.partB.transName || '—'}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 20 }}>{item.partB.vehicleNo || 'Vehicle Pending'}</div>
                                    </td>
                                    <td style={td}>
                                        {item.ewayBillNo ? (
                                            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#0d9488' }}>{item.ewayBillNo}</div>
                                        ) : <span style={{ color: '#94a3b8' }}>Not Generated</span>}
                                    </td>
                                    <td style={td}>
                                        {item.validUntil ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Clock size={14} color="#f59e0b" />
                                                <span style={{ fontWeight: 600 }}>{fmtDate(item.validUntil)}</span>
                                            </div>
                                        ) : '—'}
                                    </td>
                                    <td style={td}>
                                        <span style={badge(item.status)}>{item.status}</span>
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button onClick={() => navigate(PATHS.EWAY_BILL.DRAFT(item._id))} style={{ padding: '6px 12px', background: '#f0fdfa', border: '1px solid #0d9488', borderRadius: 6, color: '#0d9488', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <ExternalLink size={14} /> Open
                                            </button>
                                            <button onClick={() => handleDelete(item._id)} style={{ padding: 6, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 6, color: '#dc2626', cursor: 'pointer' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
