import React, { useState, useEffect } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Search, Filter, Phone, MessageSquare, Calendar, Download, AlertCircle, Loader2, User, Building, CheckCircle } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { format } from 'date-fns';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { apiClient as api } from '@/lib/apiClient';
import { getCustomers } from '@/services/customerApi';
import { closeReminder } from '@/services/reminderApi';

// Internal Service wrappers
const getFollowupDashboardList = async (params) => {
    const { data } = await api.get('/reports/followup-dashboard', { params });
    return data;
};

const getFollowupDashboardDetail = async (customerId) => {
    const { data } = await api.get(`/reports/followup-dashboard/${customerId}`);
    return data;
};

const parseBlobError = async (error) => {
    const data = error?.response?.data;
    if (data instanceof Blob) {
        try {
            const text = await data.text();
            const json = JSON.parse(text);
            return json?.message || json?.error || text || 'Export failed';
        } catch {
            return 'Export failed';
        }
    }
    return error?.response?.data?.message || error?.message || 'Export failed';
};

const toTelHref = (mobile) => {
    const digits = String(mobile || '').replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : null;
};

const getCustomerMobiles = (customerOrTask) => {
    if (!customerOrTask) return [];
    if (Array.isArray(customerOrTask.mobiles) && customerOrTask.mobiles.length) {
        return customerOrTask.mobiles.filter(Boolean);
    }
    const persons = customerOrTask.contactPersons || [];
    const fromPersons = persons.flatMap((p) => [p?.mobile, p?.mobile2, p?.mobile3].filter(Boolean));
    if (fromPersons.length) return [...new Set(fromPersons)];
    const primary = customerOrTask.primaryContact?.mobile;
    return primary ? [primary] : [];
};

const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
};

const exportFollowupDashboardList = async (format, filters) => {
    const response = await api.get('/reports/followup-dashboard/export', {
        params: { ...filters, format },
        responseType: 'blob'
    });
    return response.data;
};

const exportFollowupProductChats = async (format, filters) => {
    const response = await api.get('/reports/followup-dashboard/export-product-chats', {
        params: { ...filters, format },
        responseType: 'blob'
    });
    return response.data;
};

const exportFollowupDashboardDetail = async (format, customerId) => {
    const response = await api.get(`/reports/followup-dashboard/${customerId}/export`, {
        params: { format },
        responseType: 'blob'
    });
    return response.data;
};


const FollowupDashboardReport = () => {
    const { addToast } = useToast();

    // Left Panel State
    const [tasks, setTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [filters, setFilters] = useState({
        q: '',
        product: '',
        type: '',
        priority: '',
        due: 'ALL'
    });
    const [listMeta, setListMeta] = useState({ total: 0 });

    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Right Panel State
    const [customerData, setCustomerData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [historySearch, setHistorySearch] = useState('');

    // Fetch List
    const fetchTasks = async (silent = false) => {
        if (!silent) setLoadingTasks(true);
        try {
            const result = await getFollowupDashboardList({
                ...filters,
                limit: 500,
                page: 1,
            });
            setTasks(result.data || []);
            setListMeta(result.meta || { total: (result.data || []).length });
        } catch (error) {
            console.error(error);
            addToast('Failed to load tasks', 'error');
        } finally {
            setLoadingTasks(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [filters.due, filters.type, filters.priority]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchTasks();
    };

    // Fetch Detail
    useEffect(() => {
        if (!selectedCustomerId) {
            setCustomerData(null);
            return;
        }
        const fetchDetail = async () => {
            setLoadingDetail(true);
            try {
                const data = await getFollowupDashboardDetail(selectedCustomerId);
                // data = { customer, openFollowups, conversations }
                setCustomerData(data);
            } catch (error) {
                console.error(error);
                addToast('Failed to load customer history', 'error');
            } finally {
                setLoadingDetail(false);
            }
        };
        fetchDetail();
    }, [selectedCustomerId]);

    useGlobalSync('followup', () => {
        fetchTasks(true);
        if (selectedCustomerId) {
            getFollowupDashboardDetail(selectedCustomerId)
                .then(setCustomerData)
                .catch(err => console.error('Silent refresh failed', err));
        }
    });

    // Exports
    const handleExport = async (format) => {
        try {
            let blob;
            let filename;
            if (selectedCustomerId) {
                blob = await exportFollowupDashboardDetail(format, selectedCustomerId);
                filename = `customer_report_${selectedCustomerId}.${format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'doc'}`;
            } else {
                blob = await exportFollowupDashboardList(format, filters);
                // Global Excel includes product chats sheet when product filter is set
                const ext = format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'doc';
                const productTag = String(filters.product || '').trim().replace(/[^\w\-]+/g, '_').slice(0, 30);
                filename = productTag
                    ? `followup_${productTag}.${ext === 'pdf' ? 'xlsx' : ext}` // PDF may fall back to xlsx
                    : `followup_list.${ext}`;
                if (format === 'pdf' && blob?.type?.includes('sheet')) {
                    filename = productTag ? `followup_${productTag}.xlsx` : 'followup_list.xlsx';
                }
            }

            downloadBlob(blob, filename);
            addToast(
                filters.product && !selectedCustomerId
                    ? `Exported follow-ups + related "${filters.product}" chats`
                    : 'Export ready',
                'success'
            );
        } catch (error) {
            console.error(error);
            addToast(await parseBlobError(error), 'error');
        }
    };

    const handleExportProductChats = async () => {
        const product = String(filters.product || '').trim();
        if (!product) {
            addToast('Enter a product (e.g. DALI) first, then click Go', 'error');
            return;
        }
        try {
            const blob = await exportFollowupProductChats('excel', filters);
            const safe = product.replace(/[^\w\-]+/g, '_').slice(0, 40);
            downloadBlob(blob, `product-chats-${safe}.xlsx`);
            addToast(`Exported chats related to "${product}"`, 'success');
        } catch (error) {
            console.error(error);
            addToast(await parseBlobError(error), 'error');
        }
    };

    const handleCloseTask = async (id) => {
        if (!window.confirm('Are you sure you want to close this task?')) return;
        try {
            await closeReminder(id);
            addToast('Task closed successfully', 'success');
            // Refresh Both
            fetchTasks();
            if (selectedCustomerId) {
                const data = await getFollowupDashboardDetail(selectedCustomerId);
                setCustomerData(data);
            }
        } catch (error) {
            console.error(error);
            addToast('Failed to close task', 'error');
        }
    };

    // Filtered History (discussion + product fields)
    const filteredHistory = customerData?.conversations?.filter((c) => {
        const q = historySearch.toLowerCase().trim();
        if (!q) return true;
        const products = (c.interestedProducts || []).map((p) => String(p).toLowerCase()).join(' ');
        return (
            (c.discussionDetails || '').toLowerCase().includes(q) ||
            (c.outcome || '').toLowerCase().includes(q) ||
            (c.productNotes || '').toLowerCase().includes(q) ||
            products.includes(q)
        );
    }) || [];

    // ── STYLES ───────────────────────────────────────────────────────────────────
    const s = {
        container: { display: 'flex', gap: 20, padding: 20, height: 'calc(100vh - 90px)', background: '#f8fafc', fontFamily: "'Inter', sans-serif" },
        leftPanel: { width: '35%', minWidth: 350, maxWidth: 450, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
        rightPanel: { flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },

        header: { padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 },
        headerTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 },

        controlsRow: { display: 'flex', gap: 8, marginTop: 12 },
        select: { flex: 1, height: 32, fontSize: 12, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', outline: 'none', cursor: 'pointer', color: '#334155' },
        searchRow: { display: 'flex', gap: 8, marginTop: 10, position: 'relative' },
        input: { flex: 1, height: 34, fontSize: 12, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', color: '#1e293b' },
        iconBtn: { height: 34, width: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', color: '#475569' },

        listWrap: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
        taskCard: (active) => ({ padding: 12, borderRadius: 8, border: active ? '1.5px solid #3b82f6' : '1px solid #e2e8f0', background: active ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? '0 2px 4px rgba(59,130,246,0.1)' : 'none' }),
        taskHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
        taskPill: (priority) => ({ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, textTransform: 'uppercase', background: priority === 'High' ? '#fee2e2' : priority === 'Medium' ? '#fef3c7' : '#f1f5f9', color: priority === 'High' ? '#ef4444' : priority === 'Medium' ? '#d97706' : '#64748b' }),
        taskDate: (isOverdue) => ({ fontSize: 11, fontWeight: 600, color: isOverdue ? '#ef4444' : '#64748b' }),
        taskTitle: { margin: '0 0 6px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', wordBreak: 'break-word' },
        taskMetaRow: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#64748b', marginTop: 8 },
        taskMetaItem: { display: 'flex', alignItems: 'center', gap: 4 },

        emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center', padding: 40 },

        detailHeader: { padding: '24px 30px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
        detailTitle: { margin: '0 0 12px 0', fontSize: 22, fontWeight: 800, color: '#0f172a' },
        contactTags: { display: 'flex', flexWrap: 'wrap', gap: 8 },
        contactTag: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#f1f5f9', borderRadius: 6, fontSize: 12, color: '#475569', fontWeight: 500 },
        actionBtns: { display: 'flex', gap: 8 },
        btnOutlined: { padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#3b82f6', background: '#fff', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' },

        contentScroll: { flex: 1, overflowY: 'auto', padding: '24px 30px', background: '#f8fafc' },
        sectionCard: { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', marginBottom: 24, overflow: 'hidden' },
        sectionTitleRow: { padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#fdf8f6', display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 14, fontWeight: 700, color: '#9a3412' },

        table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
        th: { padding: '12px 16px', background: '#f1f5f9', color: '#475569', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 12 },
        td: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', color: '#1e293b', verticalAlign: 'top' },
        iconBtnGreen: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', border: 'none', cursor: 'pointer', transition: 'background 0.2s' },
    };

    return (
        <div style={s.container}>
            {/* LEFT PANEL: Filters & List */}
            <div style={s.leftPanel}>
                <div style={s.header}>
                    <h2 style={s.headerTitle}><Calendar size={18} color="#3b82f6" /> Follow-up Tasks</h2>
                    <div style={s.controlsRow}>
                        <select style={s.select} value={filters.due} onChange={(e) => setFilters({ ...filters, due: e.target.value })}>
                            <option value="ALL">All Follow-ups</option>
                            <option value="ALL_OPEN">All Open</option>
                            <option value="TODAY">Today</option>
                            <option value="OVERDUE">Overdue</option>
                            <option value="UPCOMING">Upcoming</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                        <select style={s.select} value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
                            <option value="">All Priority</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                    <form onSubmit={handleSearch} style={{ ...s.searchRow, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                            <input
                                style={s.input}
                                placeholder="Search customer / company / mobile..."
                                value={filters.q}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setFilters({ ...filters, q: val });
                                    if (val.length > 1) {
                                        getCustomers({ search: val, limit: 10 }).then(res => {
                                            setSuggestions(res.results || []);
                                            setShowSuggestions(true);
                                        }).catch(err => console.error(err));
                                    } else {
                                        setSuggestions([]);
                                        setShowSuggestions(false);
                                    }
                                }}
                                onFocus={() => { if (filters.q.length > 1) setShowSuggestions(true); }}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            />
                            <button type="submit" style={s.iconBtn} title="Search"><Search size={14} /></button>

                            {showSuggestions && suggestions.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 42, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: 4, maxHeight: 250, overflowY: 'auto' }}>
                                    {suggestions.map(customer => (
                                        <div
                                            key={customer._id || customer.id}
                                            style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                            onClick={() => {
                                                setFilters({ ...filters, q: customer.customerName || customer.company });
                                                setSelectedCustomerId(customer._id || customer.id);
                                                setSuggestions([]);
                                                setShowSuggestions(false);
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{customer.customerName}</div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{customer.company}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <input
                                style={{ ...s.input, flex: 1, minWidth: 140 }}
                                placeholder="Search product-wise (e.g. DALI)..."
                                value={filters.product}
                                onChange={(e) => setFilters({ ...filters, product: e.target.value })}
                            />
                            <button type="submit" style={{ ...s.iconBtn, width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 600 }}>Go</button>
                            {String(filters.product || '').trim() && (
                                <button
                                    type="button"
                                    style={{ ...s.iconBtn, width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
                                    onClick={handleExportProductChats}
                                    title={`Export all chats related to ${filters.product}`}
                                >
                                    <Download size={14} /> Export chats
                                </button>
                            )}
                        </div>
                    </form>
                    <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                        Showing {tasks.length} of {listMeta.total || tasks.length} follow-up{listMeta.total === 1 ? '' : 's'}
                    </div>
                </div>

                <div style={s.listWrap}>
                    {loadingTasks ? (
                        <div style={s.emptyState}><BrandedLoader size={60} /></div>
                    ) : tasks.length === 0 ? (
                        <div style={s.emptyState}>No follow-ups found.</div>
                    ) : (
                        tasks.map(task => {
                            const cid = task.customerId?._id || task.customerId;
                            const isSelected = String(selectedCustomerId) === String(cid);
                            const isOverdue = !task.isClosed && new Date(task.reminderDate) < new Date().setHours(0, 0, 0, 0);
                            return (
                                <div key={task._id} style={s.taskCard(isSelected)} onClick={() => setSelectedCustomerId(cid)}>
                                    <div style={s.taskHeader}>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <span style={s.taskPill(task.priority)}>{task.priority || 'Normal'}</span>
                                            {task.isClosed && (
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#e2e8f0', color: '#475569' }}>CLOSED</span>
                                            )}
                                        </div>
                                        <span style={s.taskDate(isOverdue)}>{format(new Date(task.reminderDate), 'dd MMM yy')}</span>
                                    </div>
                                    <h4 style={s.taskTitle}>{task.companyName || task.customerName || '—'}</h4>
                                    {task.customerName && task.companyName && task.customerName !== task.companyName && (
                                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{task.customerName}</div>
                                    )}
                                    {task.taskNote && (
                                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{task.taskNote}</div>
                                    )}
                                    {getCustomerMobiles(task).length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }} onClick={(e) => e.stopPropagation()}>
                                            {getCustomerMobiles(task).slice(0, 2).map((m) => (
                                                <a
                                                    key={m}
                                                    href={toTelHref(m)}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}
                                                    title={`Call ${m}`}
                                                >
                                                    <Phone size={11} /> {m}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                    <div style={s.taskMetaRow}>
                                        <div style={s.taskMetaItem}>
                                            {task.followUpType === 'WHATSAPP' ? <MessageSquare size={12} color="#16a34a" /> : <Phone size={12} color="#3b82f6" />}
                                            <span style={{ fontWeight: 600, color: '#475569' }}>{task.followUpType || 'CALL'}</span>
                                        </div>
                                        <div style={s.taskMetaItem} title={`Assigned to: ${task.creator?.name || task.createdBy?.name}`}>
                                            <User size={12} />
                                            <span>{task.creator?.name || task.createdBy?.name || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: Details & History */}
            <div style={s.rightPanel}>
                {!selectedCustomerId ? (
                    <div style={s.emptyState}>
                        <Building size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                        <p style={{ fontSize: 18, fontWeight: 600, color: '#64748b', margin: '0 0 8px 0' }}>Select a customer</p>
                        <p style={{ fontSize: 13, margin: '0 0 24px 0' }}>View open tasks and complete conversation history</p>
                        <div style={{ ...s.actionBtns, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 }}>
                            <button style={s.btnOutlined} onClick={() => handleExport('excel')}><Download size={14} /> Global Export (Excel)</button>
                            <button style={s.btnOutlined} onClick={() => handleExport('pdf')}><Download size={14} /> PDF</button>
                            {String(filters.product || '').trim() && (
                                <button
                                    style={{ ...s.btnOutlined, borderColor: '#2563eb', color: '#2563eb' }}
                                    onClick={handleExportProductChats}
                                    title={`Export all conversation/chat rows matching "${filters.product}"`}
                                >
                                    <Download size={14} /> Export {String(filters.product).trim()} Chats
                                </button>
                            )}
                        </div>
                    </div>
                ) : loadingDetail ? (
                    <div style={s.emptyState}><BrandedLoader size={120} /></div>
                ) : !customerData ? (
                    <div style={s.emptyState}>Failed to load data</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                        {/* 1. Detail Header */}
                        <div style={s.detailHeader}>
                            <div>
                                <h1 style={s.detailTitle}>{customerData.customer.company || customerData.customer.customerName}</h1>
                                <div style={s.contactTags}>
                                    <div style={s.contactTag}><User size={14} /> {customerData.customer.customerName}</div>
                                    {getCustomerMobiles(customerData.customer).map((m) => (
                                        <a
                                            key={m}
                                            href={toTelHref(m)}
                                            style={{ ...s.contactTag, color: '#2563eb', textDecoration: 'none', cursor: 'pointer', fontWeight: 700 }}
                                            title={`Call ${m}`}
                                        >
                                            <Phone size={14} /> {m}
                                        </a>
                                    ))}
                                    {customerData.customer.email && (
                                        <a
                                            href={`mailto:${customerData.customer.email}`}
                                            style={{ ...s.contactTag, color: '#2563eb', textDecoration: 'none' }}
                                        >
                                            <span style={{ color: '#94a3b8', fontWeight: 700 }}>@</span> {customerData.customer.email}
                                        </a>
                                    )}
                                </div>
                            </div>
                            <div style={s.actionBtns}>
                                <button style={s.btnOutlined} onClick={() => handleExport('excel')} title="Export Excel"><Download size={14} /> XL</button>
                                <button style={s.btnOutlined} onClick={() => handleExport('pdf')} title="Export PDF"><Download size={14} /> PDF</button>
                            </div>
                        </div>

                        {/* 2. Scrollable Content */}
                        <div style={s.contentScroll}>

                            {/* Open Tasks Section */}
                            {customerData.openFollowups?.length > 0 && (
                                <div style={s.sectionCard}>
                                    <h3 style={s.sectionTitleRow}><AlertCircle size={16} /> Open Follow-up Tasks</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={s.table}>
                                            <thead>
                                                <tr>
                                                    <th style={s.th}>Due Date</th>
                                                    <th style={s.th}>Type</th>
                                                    <th style={s.th}>Priority</th>
                                                    <th style={s.th}>What to Talk (Note)</th>
                                                    <th style={{ ...s.th, width: 60, textAlign: 'center' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {customerData.openFollowups.map(task => (
                                                    <tr key={task._id} style={{ transition: 'background 0.15s' }}>
                                                        <td style={s.td}>
                                                            <div style={{ fontWeight: 600 }}>{format(new Date(task.reminderDate), 'dd MMM yyyy')}</div>
                                                        </td>
                                                        <td style={s.td}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 12 }}>
                                                                {task.followUpType === 'WHATSAPP' ? <MessageSquare size={14} color="#16a34a" /> : <Phone size={14} color="#3b82f6" />}
                                                                {task.followUpType}
                                                            </div>
                                                        </td>
                                                        <td style={s.td}>
                                                            <span style={s.taskPill(task.priority)}>{task.priority}</span>
                                                        </td>
                                                        <td style={s.td}>{task.taskNote || '—'}</td>
                                                        <td style={{ ...s.td, textAlign: 'center', verticalAlign: 'middle' }}>
                                                            <button onClick={() => handleCloseTask(task._id)} style={s.iconBtnGreen} title="Mark as Done">
                                                                <CheckCircle size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Conversation History Section */}
                            <div style={s.sectionCard}>
                                <div style={{ ...s.sectionTitleRow, background: '#f8fafc', color: '#334155', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} /> Conversation History</div>
                                    <div style={{ position: 'relative', width: 250, display: 'flex', alignItems: 'center' }}>
                                        <Search size={14} style={{ position: 'absolute', left: 10, color: '#94a3b8' }} />
                                        <input
                                            type="text"
                                            placeholder="Search history / product (e.g. DALI)..."
                                            style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none' }}
                                            value={historySearch}
                                            onChange={(e) => setHistorySearch(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table style={s.table}>
                                        <thead>
                                            <tr>
                                                <th style={{ ...s.th, width: 120 }}>Date</th>
                                                <th style={s.th}>Discussion Details</th>
                                                <th style={{ ...s.th, width: '30%' }}>Outcome / Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredHistory.length > 0 ? filteredHistory.map(c => (
                                                <tr key={c._id}>
                                                    <td style={{ ...s.td, background: '#f8fafc' }}>
                                                        <div style={{ fontWeight: 700 }}>{format(new Date(c.conversationDate), 'dd-MM-yyyy')}</div>
                                                        <div style={{ marginTop: 6 }}>
                                                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', background: c.mode === 'whatsapp' ? '#dcfce7' : '#e0e7ff', color: c.mode === 'whatsapp' ? '#15803d' : '#4338ca', border: c.mode === 'whatsapp' ? '1px solid #bbf7d0' : '1px solid #c7d2fe' }}>
                                                                {c.mode}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ ...s.td, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.discussionDetails}</td>
                                                    <td style={{ ...s.td, color: '#64748b', whiteSpace: 'pre-wrap', fontSize: 12 }}>{c.outcome || '—'}</td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="3" style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                                        No conversation history found.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', textAlign: 'right' }}>
                                    Showing {filteredHistory.length} of {customerData.conversations?.length || 0} records
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FollowupDashboardReport;
