import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getCustomers, getConversationHistory } from '@/services/customerApi';
import { Search, Phone, MessageSquare, User, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import styles from './CustomerMasterReport.module.scss';

// Local debounce utility
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const ConversationHistoryReport = () => {
    const { addToast } = useToast();

    // -- State: Customer List --
    const [customers, setCustomers] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // -- State: History Data --
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // -- State: Filters --
    const [filters, setFilters] = useState({
        fromDate: '',
        toDate: '',
        mode: 'All',
        search: ''
    });

    // 1. Fetch Customers (Debounced Search)
    const fetchCustomers = useCallback(async (search = '') => {
        setLoadingCustomers(true);
        try {
            const params = { limit: 50, page: 1, sortBy: 'customerName:asc' };
            if (search) params.search = search;
            const response = await getCustomers(params);
            setCustomers(response.results || []);
        } catch (error) {
            console.error(error);
            addToast('Failed to load customers', 'error');
        } finally {
            setLoadingCustomers(false);
        }
    }, [addToast]);

    useEffect(() => { fetchCustomers(); }, []);

    const debouncedCustomerSearch = useCallback(
        debounce((val) => fetchCustomers(val), 400),
        [fetchCustomers]
    );

    const handleCustomerSearchChange = (e) => {
        const val = e.target.value;
        setCustomerSearch(val);
        debouncedCustomerSearch(val);
    };

    // 2. Fetch History when Customer or Filters change
    useEffect(() => {
        if (!selectedCustomer) { setHistory([]); return; }

        const fetchHistory = async () => {
            setLoadingHistory(true);
            try {
                const params = {};
                if (filters.fromDate) params.fromDate = filters.fromDate;
                if (filters.toDate)   params.toDate   = filters.toDate;
                if (filters.mode && filters.mode !== 'All') params.mode = filters.mode;
                if (filters.search)   params.search   = filters.search;
                const data = await getConversationHistory(selectedCustomer._id, params);
                setHistory(data || []);
            } catch (error) {
                console.error(error);
                addToast('Failed to load history', 'error');
            } finally {
                setLoadingHistory(false);
            }
        };
        fetchHistory();
    }, [selectedCustomer, filters, addToast]);

    const handleReset = () => setFilters({ fromDate: '', toDate: '', mode: 'All', search: '' });

    // ── INLINE PANEL STYLES (two-panel layout inside container) ──────────────
    const panelWrap  = { display: 'flex', gap: 16, height: 'calc(100vh - 160px)' };
    const leftPanel  = { width: 280, minWidth: 240, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
    const rightPanel = { flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' };

    return (
        <div className={styles.container}>

            {/* ── Page Header ─────────────────────────────────── */}
            <div className={styles.header}>
                <h1 className={styles.title}>
                    Conversation History
                    <span className={styles.subtitle}> — View complete interaction history for any customer</span>
                </h1>
            </div>

            {/* ── Compact Filter Bar ──────────────────────────── */}
            <div className={styles.filterBar}>
                {/* From Date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>From:</label>
                    <input
                        type="date"
                        className={styles.select}
                        value={filters.fromDate}
                        onChange={e => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                    />
                </div>

                {/* To Date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>To:</label>
                    <input
                        type="date"
                        className={styles.select}
                        value={filters.toDate}
                        onChange={e => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                    />
                </div>

                {/* Mode */}
                <select
                    className={styles.select}
                    value={filters.mode}
                    onChange={e => setFilters(prev => ({ ...prev, mode: e.target.value }))}
                >
                    <option value="All">All Modes</option>
                    <option value="call">Call</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="visit">Visit</option>
                </select>

                {/* Search in content */}
                <div className={styles.searchWrap} style={{ flex: 1, minWidth: 180 }}>
                    <Search className={styles.searchIcon} size={14} />
                    <input
                        className={styles.searchInput}
                        placeholder="Search discussions..."
                        value={filters.search}
                        onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    />
                </div>

                {/* Reset */}
                <button
                    onClick={handleReset}
                    title="Reset filters"
                    style={{ height: 32, padding: '0 12px', fontSize: '0.8125rem', fontWeight: 500, color: '#6b7280', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                >
                    <RefreshCw size={13} /> Reset
                </button>
            </div>

            {/* ── Two-panel layout ────────────────────────────── */}
            <div style={panelWrap}>

                {/* LEFT: Customer List */}
                <div style={leftPanel}>
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customers</div>
                        <div style={{ position: 'relative' }}>
                            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                            <input
                                placeholder="Search customer..."
                                value={customerSearch}
                                onChange={handleCustomerSearchChange}
                                style={{ width: '100%', height: 30, paddingLeft: 26, paddingRight: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.8rem', outline: 'none', color: '#374151', background: '#fff', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {loadingCustomers ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
                            </div>
                        ) : (
                            <>
                                {customers.map(c => {
                                    const isSelected = selectedCustomer?._id === c._id;
                                    return (
                                        <div
                                            key={c._id}
                                            onClick={() => setSelectedCustomer(c)}
                                            style={{
                                                padding: '10px 14px',
                                                cursor: 'pointer',
                                                borderBottom: '1px solid #f3f4f6',
                                                borderRight: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                                                background: isSelected ? '#eff6ff' : 'transparent',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f9fafb'; }}
                                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{c.company || c.customerName}</div>
                                            {c.company && c.customerName && c.company !== c.customerName && (
                                                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <User size={10} />{c.customerName}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {customers.length === 0 && (
                                    <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>No customers found</div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT: History Detail */}
                <div style={rightPanel}>
                    {!selectedCustomer ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                            <MessageCircle size={52} style={{ opacity: 0.15, marginBottom: 14 }} />
                            <p style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 4px' }}>Select a customer</p>
                            <p style={{ fontSize: '0.8rem', margin: 0 }}>Pick a customer from the list to view conversation history</p>
                        </div>
                    ) : (
                        <>
                            {/* Detail Header */}
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                                    {selectedCustomer.company || selectedCustomer.customerName}
                                </div>
                                {selectedCustomer.company && selectedCustomer.customerName && selectedCustomer.company !== selectedCustomer.customerName && (
                                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                                        {selectedCustomer.customerName}
                                    </div>
                                )}
                            </div>

                            {/* History List */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
                                {loadingHistory ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                                        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
                                    </div>
                                ) : history.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                        <MessageCircle size={32} style={{ opacity: 0.2, marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                                        <p style={{ margin: 0, fontSize: '0.875rem' }}>No conversation history found for the selected filters.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {history.map((item) => {
                                            const isWhatsApp = item.mode === 'whatsapp';
                                            return (
                                                <div
                                                    key={item._id}
                                                    style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                                                >
                                                    {/* Card Header */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <div style={{
                                                                width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                background: isWhatsApp ? '#dcfce7' : '#dbeafe',
                                                                color: isWhatsApp ? '#16a34a' : '#2563eb',
                                                                flexShrink: 0
                                                            }}>
                                                                {isWhatsApp ? <MessageSquare size={16} /> : <Phone size={16} />}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>
                                                                    {format(new Date(item.conversationDate), 'dd MMMM yyyy')}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                                    <span style={{
                                                                        fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
                                                                        background: isWhatsApp ? '#dcfce7' : '#dbeafe',
                                                                        color: isWhatsApp ? '#15803d' : '#1d4ed8',
                                                                        border: isWhatsApp ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
                                                                    }}>
                                                                        {item.mode}
                                                                    </span>
                                                                    {item.isFollowup && (
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 6px', background: '#fef3c7', color: '#d97706', borderRadius: 4, border: '1px solid #fde68a' }}>
                                                                            From Follow-up
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                                            {format(new Date(item.createdAt || item.conversationDate), 'hh:mm a')}
                                                        </span>
                                                    </div>

                                                    {/* Discussion */}
                                                    <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: item.outcome ? 10 : 0, paddingLeft: 44 }}>
                                                        {item.discussionDetails}
                                                    </div>

                                                    {/* Outcome */}
                                                    {item.outcome && (
                                                        <div style={{ marginLeft: 44, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px' }}>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Outcome / Next Steps</div>
                                                            <div style={{ fontSize: '0.8rem', color: '#374151' }}>{item.outcome}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer count */}
                            {!loadingHistory && history.length > 0 && (
                                <div style={{ padding: '8px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'right' }}>
                                    {history.length} conversation{history.length !== 1 ? 's' : ''}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConversationHistoryReport;
