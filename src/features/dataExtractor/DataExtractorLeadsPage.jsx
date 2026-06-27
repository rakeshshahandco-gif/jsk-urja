import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';

export default function DataExtractorLeadsPage() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [selected, setSelected] = useState(new Set());

    const load = () => {
        setLoading(true);
        dataExtractorApi.listRecords({ limit: 100, status: statusFilter || undefined })
            .then((data) => {
                setRecords(data?.results || []);
                setSelected(new Set());
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, [statusFilter]);

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === records.length) setSelected(new Set());
        else setSelected(new Set(records.map((r) => r._id)));
    };

    const onBulk = async (action, entityType) => {
        const ids = [...selected];
        if (!ids.length) {
            toast.error('Select at least one record');
            return;
        }
        if (action === 'delete' && !window.confirm(`Delete ${ids.length} draft(s)?`)) return;
        let reason = '';
        if (action === 'reject') reason = window.prompt('Rejection reason (optional):') || '';
        try {
            const result = await dataExtractorApi.bulkAction({ action, ids, reason, entityType });
            if (result.failed?.length) toast.error(`${result.success} ok, ${result.failed.length} failed`);
            else toast.success(`${result.success} record(s) updated`);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed');
        }
    };

    const onExport = async (format) => {
        try {
            const blob = await dataExtractorApi.exportRecords({ format, status: statusFilter || undefined });
            const mime = format === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv';
            const url = URL.createObjectURL(new Blob([blob], { type: mime }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `extracted-leads.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Export failed');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Extracted Leads</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                        <option value="">All statuses</option>
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="converted">Converted</option>
                        <option value="rejected">Rejected</option>
                    </select>
                    <button type="button" onClick={() => onExport('csv')} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer' }}>Export CSV</button>
                    <button type="button" onClick={() => onExport('xlsx')} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer' }}>Export Excel</button>
                </div>
            </div>
            {selected.size > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{selected.size} selected</span>
                    <button type="button" onClick={() => onBulk('approve')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Approve</button>
                    <button type="button" onClick={() => onBulk('reject')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Reject</button>
                    <button type="button" onClick={() => onBulk('delete')} style={{ padding: '6px 12px', fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}>Delete</button>
                    <button type="button" onClick={() => onBulk('convert', 'lead')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>→ Lead</button>
                    <button type="button" onClick={() => onBulk('convert', 'customer')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>→ Customer</button>
                    <button type="button" onClick={() => onBulk('convert', 'supplier')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>→ Supplier</button>
                </div>
            )}
            {loading ? <div>Loading…</div> : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: 8 }}>
                                    <input type="checkbox" checked={records.length > 0 && selected.size === records.length} onChange={toggleAll} />
                                </th>
                                <th style={{ padding: 8 }}>Company</th>
                                <th style={{ padding: 8 }}>Website</th>
                                <th style={{ padding: 8 }}>Email</th>
                                <th style={{ padding: 8 }}>Phone</th>
                                <th style={{ padding: 8 }}>City</th>
                                <th style={{ padding: 8 }}>Lead Score</th>
                                <th style={{ padding: 8 }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: 16, color: '#64748b' }}>No records</td></tr>
                            )}
                            {records.map((r) => (
                                <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8 }}>
                                        <input type="checkbox" checked={selected.has(r._id)} onChange={() => toggleSelect(r._id)} />
                                    </td>
                                    <td style={{ padding: 8 }}>{r.companyName || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.normalizedDomain || r.website || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.email || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.phone || r.mobile || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.city || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.leadScore ?? '—'}</td>
                                    <td style={{ padding: 8 }}>{r.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
