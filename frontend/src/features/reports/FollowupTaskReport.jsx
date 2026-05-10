import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Search, Download, Calendar, ArrowRight, User } from 'lucide-react';
import { format } from 'date-fns';
import { BrandedLoader } from '@/components/ui';
import { apiClient as api } from '@/lib/apiClient';
import { getCustomers } from '@/services/customerApi';

// Styled Components / Classes
const tabClass = (active) => `px-6 py-3 font-bold text-sm transition-colors border-b-2 ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`;
const tableHeaderClass = "px-4 py-3 bg-gray-50 border border-gray-200 text-left text-xs font-bold text-gray-700 uppercase tracking-wider";
const tableCellClass = "px-4 py-3 border border-gray-200 text-sm align-top text-gray-800 whitespace-pre-wrap";

const FollowupTaskReport = () => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('ALL'); // ALL | SINGLE

    // ALL Filter State
    const [filters, setFilters] = useState({
        followUpType: 'ALL',
        fromDate: '',
        toDate: ''
    });

    // SINGLE State
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    // Data State
    const [data, setData] = useState([]); // For ALL tab
    const [singleData, setSingleData] = useState(null); // { customer, rows } For SINGLE tab
    const [loading, setLoading] = useState(false);

    // --- Actions ---

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/reports/followup-task-report', { params: filters });
            setData(res.data.data || []);
        } catch (error) {
            console.error(error);
            addToast('Failed to load report', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchSingleData = async () => {
        if (!selectedCustomer) {
            addToast('Please select a customer', 'error');
            return;
        }
        setLoading(true);
        try {
            const res = await api.get('/reports/followup-task-report', {
                params: {
                    mode: 'single',
                    customerId: selectedCustomer._id || selectedCustomer.id
                }
            });
            if (res.data.data) {
                setSingleData({
                    customer: res.data.data.customer,
                    rows: res.data.data.followups
                });
            }
        } catch (error) {
            console.error(error);
            addToast('Failed to load customer report', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load initial data for ALL
    useEffect(() => {
        if (activeTab === 'ALL') fetchAllData();
    }, [activeTab]);

    // Handle Customer Search
    const onSearchChange = (val) => {
        setCustomerSearch(val);
        if (val.length > 1) {
            getCustomers({ search: val, limit: 5 }).then(res => setSuggestions(res.results || []));
        } else {
            setSuggestions([]);
        }
    };

    const handleExport = async (format) => {
        try {
            const url = activeTab === 'ALL'
                ? `/reports/followup-task-report/export`
                : `/reports/followup-task-report/${selectedCustomer?._id || selectedCustomer?.id}/export`;

            const params = activeTab === 'ALL' ? { ...filters, format } : { format };

            if (activeTab === 'SINGLE' && !selectedCustomer) {
                addToast('Please select a customer first', 'error');
                return;
            }

            const res = await api.get(url, { params, responseType: 'blob' });

            // Download
            const blobUrl = window.URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', `followup_task_report_${activeTab}.${format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'doc'}`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

        } catch (error) {
            console.error(error);
            addToast('Export failed', 'error');
        }
    };

    // ── STYLES ───────────────────────────────────────────────────────────────────
    const s = {
        container: { display: 'flex', flexDirection: 'column', gap: 20, padding: 20, height: 'calc(100vh - 90px)', background: '#f8fafc', fontFamily: "'Inter', sans-serif" },
        headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 },
        tabs: { display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 4, gap: 4 },
        tab: (active) => ({ padding: '6px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s', background: active ? '#fff' : 'transparent', color: active ? '#2563eb' : '#64748b', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none' }),

        card: { flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
        filterBar: { padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },

        inputGroup: { display: 'flex', alignItems: 'center', gap: 8 },
        label: { fontSize: 12, fontWeight: 600, color: '#64748b' },
        input: { height: 34, fontSize: 13, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', color: '#1e293b', minWidth: 140 },
        select: { height: 34, fontSize: 13, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', color: '#1e293b', backgroundColor: '#fff', minWidth: 120, cursor: 'pointer' },

        btnPrimary: { height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#3b82f6', border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'background 0.2s' },
        btnOutlined: { height: 34, padding: '0 12px', fontSize: 13, fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' },

        tableContainer: { flex: 1, overflowY: 'auto' },
        table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
        th: { padding: '12px 20px', background: '#f1f5f9', color: '#475569', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 12, position: 'sticky', top: 0, zIndex: 10 },
        td: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', color: '#1e293b', verticalAlign: 'top', lineHeight: 1.5 },

        pill: (type) => ({
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', display: 'inline-block', marginTop: 6,
            background: type === 'whatsapp' ? '#dcfce7' : '#e0e7ff',
            color: type === 'whatsapp' ? '#15803d' : '#4338ca',
            border: type === 'whatsapp' ? '1px solid #bbf7d0' : '1px solid #c7d2fe'
        }),

        customerHeader: { padding: '12px 20px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 12 },
        customerTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: '#1e3a8a' },
        customerMeta: { fontSize: 12, color: '#3b82f6', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }
    };

    return (
        <div style={s.container}>
            {/* ── Line 1: Title + Tabs ── */}
            <div style={s.headerRow}>
                <h1 style={s.headerTitle}>
                    <Calendar size={20} color="#3b82f6" /> Follow-up Task Report
                </h1>
                <div style={s.tabs}>
                    <button style={s.tab(activeTab === 'ALL')} onClick={() => setActiveTab('ALL')}>For All Customers</button>
                    <button style={s.tab(activeTab === 'SINGLE')} onClick={() => setActiveTab('SINGLE')}>For Single Customer</button>
                </div>
            </div>

            {/* ── TAB CONTENT: ALL ── */}
            {activeTab === 'ALL' && (
                <div style={s.card}>
                    {/* Line 2: Filters + Export */}
                    <div style={s.filterBar}>
                        <div style={s.inputGroup}>
                            <span style={s.label}>From:</span>
                            <input type="date" value={filters.fromDate} onChange={e => setFilters({ ...filters, fromDate: e.target.value })} style={s.input} />
                        </div>
                        <div style={s.inputGroup}>
                            <span style={s.label}>To:</span>
                            <input type="date" value={filters.toDate} onChange={e => setFilters({ ...filters, toDate: e.target.value })} style={s.input} />
                        </div>
                        <select value={filters.followUpType} onChange={e => setFilters({ ...filters, followUpType: e.target.value })} style={s.select}>
                            <option value="ALL">All Interaction Types</option>
                            <option value="CALL">Call</option>
                            <option value="WHATSAPP">WhatsApp</option>
                        </select>
                        <button onClick={fetchAllData} style={s.btnPrimary}>Apply Filters</button>

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button onClick={() => handleExport('excel')} style={s.btnOutlined} title="Export Excel"><Download size={14} /> XL</button>
                            <button onClick={() => handleExport('pdf')} style={s.btnOutlined} title="Export PDF"><Download size={14} /> PDF</button>
                            <button onClick={() => handleExport('docx')} style={s.btnOutlined} title="Export Word"><Download size={14} /> Word</button>
                        </div>
                    </div>

                    {/* DATA TABLE */}
                    <div style={s.tableContainer}>
                        <table style={s.table}>
                            <thead>
                                <tr>
                                    <th style={s.th}>Company</th>
                                    <th style={{ ...s.th, width: 140 }}>Date</th>
                                    <th style={s.th}>Discussion Details</th>
                                    <th style={{ ...s.th, width: '30%' }}>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && <tr><td colSpan="4" style={{ padding: 40, textAlign: 'center' }}><BrandedLoader size={100} /></td></tr>}
                                {!loading && data.length === 0 && <tr><td colSpan="4" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No records found for the selected filters.</td></tr>}
                                {data.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                                        onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={() => row.customerId && navigate(`/followup/${row.customerId}`)}
                                        title="Click to open customer details"
                                    >
                                        <td style={{ ...s.td, fontWeight: 600, color: '#0f172a' }}>{row.companyName || row.customerName}</td>
                                        <td style={s.td}>
                                            <div style={{ fontWeight: 600 }}>{format(new Date(row.conversationDate), 'dd-MM-yyyy')}</div>
                                            {row.mode && <div style={s.pill(row.mode)}>{row.mode}</div>}
                                        </td>
                                        <td style={{ ...s.td, whiteSpace: 'pre-wrap' }}>{row.discussionDetails}</td>
                                        <td style={{ ...s.td, color: '#475569', whiteSpace: 'pre-wrap' }}>{row.outcomeRemarks || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── TAB CONTENT: SINGLE ── */}
            {activeTab === 'SINGLE' && (
                <div style={s.card}>
                    {/* Line 2: Search + buttons */}
                    <div style={s.filterBar}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ ...s.inputGroup, position: 'relative' }}>
                                <Search size={16} color="#64748b" style={{ position: 'absolute', left: 10 }} />
                                <input
                                    value={customerSearch}
                                    onChange={e => onSearchChange(e.target.value)}
                                    placeholder="Search customer by name or company..."
                                    style={{ ...s.input, width: 320, paddingLeft: 34 }}
                                />
                            </div>

                            {/* Auto-suggest dropdown */}
                            {suggestions.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: 4, zIndex: 50, maxHeight: 250, overflowY: 'auto' }}>
                                    {suggestions.map(c => (
                                        <div
                                            key={c._id || c.id}
                                            style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                            onClick={() => {
                                                setSelectedCustomer(c);
                                                setCustomerSearch(c.company || c.customerName);
                                                setSuggestions([]);
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.company || c.customerName}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                                {c.customerName && c.company && c.customerName !== c.company ? c.customerName + ' • ' : ''}
                                                {c.mobile || ''}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={fetchSingleData} disabled={!selectedCustomer} style={{ ...s.btnPrimary, opacity: selectedCustomer ? 1 : 0.5, cursor: selectedCustomer ? 'pointer' : 'not-allowed' }}>
                            View Report
                        </button>

                        {singleData && (
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                <button onClick={() => handleExport('excel')} style={s.btnOutlined} title="Export Excel"><Download size={14} /> XL</button>
                                <button onClick={() => handleExport('pdf')} style={s.btnOutlined} title="Export PDF"><Download size={14} /> PDF</button>
                                <button onClick={() => handleExport('docx')} style={s.btnOutlined} title="Export Word"><Download size={14} /> Word</button>
                            </div>
                        )}
                    </div>

                    {/* REPORT VIEW */}
                    {singleData ? (
                        <div style={s.tableContainer}>
                            <div style={s.customerHeader}>
                                <h3 style={s.customerTitle}>{singleData.customer.company || singleData.customer.customerName}</h3>
                                {singleData.customer.contactPersons?.[0]?.name && (
                                    <div style={s.customerMeta}>
                                        <User size={14} />
                                        {singleData.customer.contactPersons[0].name}
                                        {singleData.customer.contactPersons[0].mobile && ` • ${singleData.customer.contactPersons[0].mobile}`}
                                    </div>
                                )}
                            </div>
                            <table style={s.table}>
                                <thead>
                                    <tr>
                                        <th style={{ ...s.th, width: 140 }}>Date</th>
                                        <th style={s.th}>Discussion Details</th>
                                        <th style={{ ...s.th, width: '30%' }}>Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {singleData.rows.length === 0 && <tr><td colSpan="3" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No conversation history found.</td></tr>}
                                    {singleData.rows.map((row, idx) => (
                                        <tr key={idx} style={{ transition: 'background 0.15s' }} onMouseOver={e => e.currentTarget.style.background = '#f8fafc'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={s.td}>
                                                <div style={{ fontWeight: 600 }}>{format(new Date(row.conversationDate), 'dd-MM-yyyy')}</div>
                                                {row.mode && <div style={s.pill(row.mode)}>{row.mode}</div>}
                                            </td>
                                            <td style={{ ...s.td, whiteSpace: 'pre-wrap' }}>{row.discussionDetails}</td>
                                            <td style={{ ...s.td, color: '#475569', whiteSpace: 'pre-wrap' }}>{row.outcomeRemarks || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', background: '#f8fafc', fontSize: 13 }}>
                            {loading ? <BrandedLoader size={120} /> : 'Select a customer and click "View Report"'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FollowupTaskReport;
