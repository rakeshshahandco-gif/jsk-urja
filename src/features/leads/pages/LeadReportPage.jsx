import React, { useEffect, useState } from 'react';
import { leadApi } from '@/services/leadApi';
import { useCompany } from '@/contexts/CompanyContext';

const STATUS = ['', 'new', 'contacted', 'qualified', 'quotation', 'negotiation', 'won', 'lost', 'hold'];
const SOURCE = ['', 'whatsapp', 'manual', 'call', 'email', 'visit', 'other'];

export default function LeadReportPage() {
    const { selectedCompany, loading: companyLoading } = useCompany();
    const companyId = selectedCompany?._id || selectedCompany?.id;
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [meta, setMeta] = useState({ canFilterUsers: false, users: [] });
    const [filters, setFilters] = useState({
        dateFrom: '',
        dateTo: '',
        status: '',
        source: '',
        createdByUserId: '',
        ownerUserId: '',
        scope: '',
    });

    useEffect(() => {
        leadApi.visibilityMeta().then(setMeta).catch(() => {});
    }, []);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await leadApi.report({ ...filters, limit: 500 });
            setRows(data?.results || []);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (companyLoading || !companyId) return;
        load();
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [companyId, companyLoading]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const blob = await leadApi.exportReportExcel(filters);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Lead_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.response?.data?.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    const setF = (k, v) => setFilters((s) => ({ ...s, [k]: v }));

    return (
        <div style={{ padding: 24 }}>
            <h2 style={{ margin: '0 0 8px' }}>Lead Report</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
                User-wise lead listing with created-by and owner. Export respects your visibility permissions.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <input type="date" value={filters.dateFrom} onChange={(e) => setF('dateFrom', e.target.value)} style={inp} />
                <input type="date" value={filters.dateTo} onChange={(e) => setF('dateTo', e.target.value)} style={inp} />
                <select value={filters.status} onChange={(e) => setF('status', e.target.value)} style={inp}>
                    {STATUS.map((s) => <option key={s || 'all'} value={s}>{s || 'All status'}</option>)}
                </select>
                <select value={filters.source} onChange={(e) => setF('source', e.target.value)} style={inp}>
                    {SOURCE.map((s) => <option key={s || 'all'} value={s}>{s || 'All sources'}</option>)}
                </select>
                <select value={filters.scope} onChange={(e) => setF('scope', e.target.value)} style={inp}>
                    <option value="">Default scope</option>
                    <option value="my">My Leads</option>
                    <option value="all">All Leads</option>
                </select>
                {meta.canFilterUsers && (
                    <>
                        <select value={filters.createdByUserId} onChange={(e) => setF('createdByUserId', e.target.value)} style={inp}>
                            <option value="">Created by (all)</option>
                            {meta.users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                        </select>
                        <select value={filters.ownerUserId} onChange={(e) => setF('ownerUserId', e.target.value)} style={inp}>
                            <option value="">Owner (all)</option>
                            <option value="unassigned">Unassigned</option>
                            {meta.users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                        </select>
                    </>
                )}
                <button type="button" onClick={load}>Apply</button>
                <button type="button" onClick={handleExport} disabled={exporting}>
                    {exporting ? 'Exporting...' : 'Export Excel'}
                </button>
            </div>

            {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: '#f1f5f9' }}>
                        <tr>
                            {['Lead No.', 'Lead Date', 'Customer', 'Contact', 'Mobile', 'Source', 'Status', 'Created By', 'Owner', 'Follow-up', 'Created At'].map((h) => (
                                <th key={h} style={{ textAlign: 'left', padding: 8, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={11} style={{ padding: 16, textAlign: 'center' }}>Loading...</td></tr>}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={11} style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>No records</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={td}>{r.leadNo}</td>
                                <td style={td}>{r.leadDate ? new Date(r.leadDate).toLocaleDateString() : ''}</td>
                                <td style={td}>{r.customerName || r.companyName}</td>
                                <td style={td}>{r.contactPerson || '-'}</td>
                                <td style={td}>{r.mobile}</td>
                                <td style={td}>{r.source}</td>
                                <td style={td}>{r.status}</td>
                                <td style={td}>{r.createdByName}</td>
                                <td style={td}>{r.assignedToName || r.ownerName}</td>
                                <td style={td}>{r.followUpDate ? new Date(r.followUpDate).toLocaleDateString() : '-'}</td>
                                <td style={td}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const inp = { padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 };
const td = { padding: 8 };
