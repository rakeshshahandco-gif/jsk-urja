import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leadApi } from '@/services/leadApi';
import ConvertFromWhatsAppModal from '../components/ConvertFromWhatsAppModal';

const STATUS = ['new', 'contacted', 'qualified', 'quotation', 'negotiation', 'won', 'lost', 'hold'];
const SOURCE = ['whatsapp', 'manual', 'call', 'email', 'visit', 'other'];

export default function LeadListPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [source, setSource] = useState('');
    const [showConvert, setShowConvert] = useState(false);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const params = { limit: 200 };
            if (search) params.search = search;
            if (status) params.status = status;
            if (source) params.source = source;
            const data = await leadApi.list(params);
            setRows(data?.results || []);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load leads');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Leads / Inquiries</h2>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Convert WhatsApp chats into leads. Share catalog and datasheet links per lead.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => setShowConvert(true)}
                        style={{ background: '#16a34a', color: 'white', padding: '8px 14px', border: 'none', borderRadius: 6 }}
                    >
                        + Convert WhatsApp Chat
                    </button>
                    <button
                        onClick={() => navigate('/crm/leads/new')}
                        style={{ background: '#1e3a8a', color: 'white', padding: '8px 14px', border: 'none', borderRadius: 6 }}
                    >
                        + Manual Lead
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                    placeholder="Search name / mobile / message / notes"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                    style={{ flex: 1, minWidth: 240, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }}
                />
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8 }}>
                    <option value="">All status</option>
                    {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={source} onChange={(e) => setSource(e.target.value)} style={{ padding: 8 }}>
                    <option value="">All sources</option>
                    {SOURCE.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={load} style={{ padding: '8px 14px' }}>Search</button>
            </div>

            {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

            <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ background: '#f1f5f9' }}>
                        <tr>
                            <th style={th}>Customer</th>
                            <th style={th}>Mobile</th>
                            <th style={th}>Source</th>
                            <th style={th}>Status</th>
                            <th style={th}>Products</th>
                            <th style={th}>Assigned To</th>
                            <th style={th}>Next Follow-up</th>
                            <th style={th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center' }}>Loading...</td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                                No leads yet. Click "+ Convert WhatsApp Chat" to add one.
                            </td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={td}>{r.customerName || r.customerId?.customerName || '-'}</td>
                                <td style={td}>{r.customerMobile || '-'}</td>
                                <td style={td}>{r.source}</td>
                                <td style={td}><Badge value={r.status} /></td>
                                <td style={td}>{(r.products || []).length}</td>
                                <td style={td}>{r.assignedTo?.name || '-'}</td>
                                <td style={td}>
                                    {r.nextFollowUpDate ? new Date(r.nextFollowUpDate).toLocaleDateString() : '-'}
                                </td>
                                <td style={td}>
                                    <button onClick={() => navigate(`/crm/leads/${r._id}`)}>Open</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConvertFromWhatsAppModal
                open={showConvert}
                onClose={() => setShowConvert(false)}
                onCreated={(lead) => {
                    setShowConvert(false);
                    navigate(`/crm/leads/${lead._id}`);
                }}
            />
        </div>
    );
}

const th = { textAlign: 'left', padding: 10 };
const td = { padding: 8 };

function Badge({ value }) {
    const colors = {
        new: '#0ea5e9', contacted: '#0284c7', qualified: '#6366f1',
        quotation: '#a855f7', negotiation: '#f59e0b',
        won: '#16a34a', lost: '#dc2626', hold: '#64748b',
    };
    const c = colors[value] || '#475569';
    return (
        <span style={{ background: c + '20', color: c, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
            {value}
        </span>
    );
}
