import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import * as XLSX from 'xlsx';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell,
    LineChart, Line, AreaChart, Area, PieChart, Pie
} from 'recharts';
import {
    Users, IndianRupee, FileText, AlertCircle, TrendingUp, Award, Clock,
    Download, ArrowLeft, ArrowRight, Activity, Calendar, Target,
    CreditCard, CheckCircle, Package, Search, ChevronRight
} from 'lucide-react';
import salesConversionApi from '@/services/salesConversionApi';

// ── Colour palette ────────────────────────────────────────────────────────────
const C = ['#2563EB', '#14B8A6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
const safe = (v, fallback = 0) => (isFinite(v) && !isNaN(v) ? v : fallback);
const pct = (v) => `${isFinite(v) && !isNaN(v) ? Number(v).toFixed(1) : 0}%`;

// ── Sub-components ────────────────────────────────────────────────────────────
const KPI = ({ title, value, sub, icon, color, highlight, pulse }) => (
    <div style={{
        background: highlight ? `linear-gradient(135deg, ${color}10, ${color}20)` : '#fff',
        border: `1px solid ${highlight ? `${color}40` : '#e2e8f0'}`,
        borderRadius: '12px', padding: '20px 24px', position: 'relative',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden'
    }}>
        {pulse && <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 0 2px #fca5a5', animation: 'pulse 2s infinite' }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: `${color}15`, color, padding: '12px', borderRadius: '10px' }}>{icon}</div>
            <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{value}</div>
                {sub && <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{sub}</div>}
            </div>
        </div>
    </div>
);

const Card = ({ title, icon, children, action }) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {icon && <span style={{ color: '#64748b' }}>{icon}</span>}
                {title}
            </h3>
            {action && <div>{action}</div>}
        </div>
        <div style={{ flex: 1 }}>{children}</div>
    </div>
);

const CustomTooltip = ({ active, payload, label, money }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            {label && <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ margin: '4px 0', fontSize: '13px', color: p.color || '#475569', fontWeight: 600 }}>
                    {p.name}: {money ? fmt(p.value) : safe(p.value).toLocaleString('en-IN')}
                </p>
            ))}
        </div>
    );
};

export const CustomerAnalysisTab = ({ globalFilters = { fromDate: moment().subtract(3, 'months').format('YYYY-MM-DD'), toDate: moment().format('YYYY-MM-DD') } }) => {
    const navigate = useNavigate();

    // Local State
    const [period, setPeriod] = useState('3M'); // 1W, 1M, 2M, 3M, 6M, 1Y, Custom
    const [viewBy, setViewBy] = useState('Monthly'); // Weekly or Monthly
    const [segmentFilter, setSegmentFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [loading, setLoading] = useState(true);
    const [overallData, setOverallData] = useState(null);
    const [customerPage, setCustomerPage] = useState(1);

    // Deep Dive State
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [deepDiveData, setDeepDiveData] = useState(null);

    // Sync period selection to dates
    const getDatesForPeriod = (p) => {
        const now = moment();
        if (p === '1W') return { from: moment().subtract(7, 'days').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
        if (p === '1M') return { from: moment().subtract(1, 'months').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
        if (p === '2M') return { from: moment().subtract(2, 'months').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
        if (p === '3M') return { from: moment().subtract(3, 'months').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
        if (p === '6M') return { from: moment().subtract(6, 'months').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
        if (p === '1Y') return { from: moment().subtract(1, 'years').format('YYYY-MM-DD'), to: now.format('YYYY-MM-DD') };
        return { from: globalFilters.fromDate, to: globalFilters.toDate }; // Custom uses global
    };

    const fetchOverallData = useCallback(async () => {
        setLoading(true);
        try {
            const { from, to } = getDatesForPeriod(period);
            const filters = { ...globalFilters, fromDate: from, toDate: to, page: customerPage, limit: 50 };
            if (period !== 'Custom') {
                delete filters.fy;
                delete filters.financialYear;
            }
            
            const res = await salesConversionApi.getCustomerWiseSales(filters);
            setOverallData(res?.data || null);
        } catch (e) {
            console.error('Failed to load overall customer analysis', e);
        } finally {
            setLoading(false);
        }
    }, [globalFilters, period, customerPage]);

    const fetchDeepDiveData = useCallback(async (customer) => {
        if (!customer?._id) return;
        setLoading(true);
        try {
            const { from, to } = getDatesForPeriod(period);
            const filters = { ...globalFilters, fromDate: from, toDate: to, viewBy };
            if (period !== 'Custom') {
                delete filters.fy;
                delete filters.financialYear;
            }
            
            const res = await salesConversionApi.getCustomerDeepDive(customer._id, filters);
            setDeepDiveData(res?.data || null);
        } catch (e) {
            console.error('Failed to load customer deep dive', e);
        } finally {
            setLoading(false);
        }
    }, [globalFilters, period, viewBy]);

    useEffect(() => {
        if (selectedCustomer) {
            fetchDeepDiveData(selectedCustomer);
        } else {
            fetchOverallData();
        }
    }, [fetchOverallData, fetchDeepDiveData, selectedCustomer]);

    // Handle deep dive open
    const openDeepDive = (customer) => {
        setSelectedCustomer(customer);
        setDeepDiveData(null);
    };

    const closeDeepDive = () => {
        setSelectedCustomer(null);
        setDeepDiveData(null);
    };

    // Export Logic
    const exportExcel = (type) => {
        let wb = XLSX.utils.book_new();
        
        if (type === 'overall') {
            const list = overallData?.results || [];
            const wsData = list.map(r => ({
                'Customer': r.customerName,
                'Segment': r.segment || r.classification,
                'Invoices': r.invoiceCount,
                'Total Sales (₹)': r.totalValue,
                'Paid (₹)': r.totalPaid,
                'Outstanding (₹)': r.outstanding,
                'Outstanding %': r.outstandingPct ? `${r.outstandingPct.toFixed(1)}%` : '0%',
                'Repeat Orders': r.repeatOrders || 0,
                'Avg Invoice Value (₹)': r.averageInvoiceValue || 0,
                'Payment Behaviour': r.paymentBehaviour || 'Unknown',
                'First Sale': r.firstInvoice ? moment(r.firstInvoice).format('DD-MM-YY') : '',
                'Last Sale': r.lastInvoice ? moment(r.lastInvoice).format('DD-MM-YY') : ''
            }));
            const ws = XLSX.utils.json_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, "Customer Analysis");
            XLSX.writeFile(wb, `Customer_Analysis_${moment().format('DDMMYY')}.xlsx`);
        } 
        else if (type === 'deepDive' && deepDiveData) {
            const basic = [deepDiveData.basicStats].map(r => ({
                'Customer': r.customerName,
                'Segment': r.segment,
                'Invoices': r.invoiceCount,
                'Total Sales': r.totalValue,
                'Paid': r.totalPaid,
                'Outstanding': r.outstanding,
                'Repeat Orders': r.repeatOrders,
                'Payment Behaviour': r.paymentBehaviour
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(basic), "Summary");

            const trend = (deepDiveData.salesTrend || []).map(r => ({ Period: r._id, Sales: r.sales }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trend), "Sales Trend");

            const products = (deepDiveData.productSales || []).map(r => ({ Product: r._id, Quantity: r.qty, Value: r.value, LastSale: moment(r.lastSale).format('DD-MM-YY') }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products), "Product Sales");

            XLSX.writeFile(wb, `DeepDive_${selectedCustomer.customerName.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
        }
    };

    // Filter overall results
    const filteredResults = (overallData?.results || []).filter(r => {
        if (segmentFilter && r.classification !== segmentFilter) return false;
        if (searchQuery && !r.customerName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const renderOverallSummary = () => {
        if (!overallData) return null;
        const totalSales = overallData.results.reduce((s, r) => s + (r.totalValue || 0), 0);
        const totalPaid = overallData.results.reduce((s, r) => s + (r.totalPaid || 0), 0);
        const outstanding = totalSales - totalPaid;
        const invoices = overallData.results.reduce((s, r) => s + (r.invoiceCount || 0), 0);
        const repeat = overallData.results.reduce((s, r) => s + (r.repeatOrders || 0), 0);

        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <KPI title="Total Sales" value={fmt(totalSales)} icon={<IndianRupee size={22} />} color="#2563EB" highlight />
                <KPI title="Total Paid" value={fmt(totalPaid)} icon={<CheckCircle size={22} />} color="#10B981" />
                <KPI title="Outstanding" value={fmt(outstanding)} icon={<AlertCircle size={22} />} color="#EF4444" pulse={outstanding > 0} />
                <KPI title="Invoice Count" value={invoices.toLocaleString()} icon={<FileText size={22} />} color="#8B5CF6" />
                <KPI title="Repeat Orders" value={repeat.toLocaleString()} icon={<TrendingUp size={22} />} color="#F59E0B" />
                <KPI title="Avg Invoice Value" value={fmt(invoices > 0 ? totalSales / invoices : 0)} icon={<Award size={22} />} color="#06B6D4" />
            </div>
        );
    };

    const renderDeepDiveSummary = () => {
        if (!deepDiveData?.basicStats) return null;
        const b = deepDiveData.basicStats;
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <KPI title="Customer Total Sales" value={fmt(b.totalValue)} icon={<IndianRupee size={22} />} color="#2563EB" highlight />
                <KPI title="Total Paid" value={fmt(b.totalPaid)} icon={<CheckCircle size={22} />} color="#10B981" />
                <KPI title="Outstanding" value={fmt(b.outstanding)} icon={<AlertCircle size={22} />} color="#EF4444" pulse={b.outstanding > 0} />
                <KPI title="Invoice Count" value={b.invoiceCount.toLocaleString()} icon={<FileText size={22} />} color="#8B5CF6" />
                <KPI title="Repeat Orders" value={safe(b.repeatOrders).toLocaleString()} icon={<TrendingUp size={22} />} color="#F59E0B" />
                <KPI title="Avg Invoice Value" value={fmt(b.averageInvoiceValue)} icon={<Award size={22} />} color="#06B6D4" />
            </div>
        );
    };

    const periodOptions = ['1W', '1M', '2M', '3M', '6M', '1Y', 'Custom'];

    return (
        <div style={{ padding: '0', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'Inter, sans-serif' }}>
            
            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: '#fff', padding: '16px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                        {periodOptions.map(p => (
                            <button key={p} onClick={() => setPeriod(p)} style={{
                                background: period === p ? '#fff' : 'transparent',
                                color: period === p ? '#0f172a' : '#64748b',
                                border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s'
                            }}>
                                {p}
                            </button>
                        ))}
                    </div>

                    <div style={{ height: '24px', width: '1px', background: '#cbd5e1' }} />

                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                        {['Weekly', 'Monthly'].map(v => (
                            <button key={v} onClick={() => setViewBy(v)} style={{
                                background: viewBy === v ? '#2563eb' : 'transparent',
                                color: viewBy === v ? '#fff' : '#64748b',
                                border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}>
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => exportExcel(selectedCustomer ? 'deepDive' : 'overall')} style={{
                        background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px',
                        fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <Download size={16} /> Export Excel
                    </button>
                </div>
            </div>

            {loading && <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: '30%', background: '#2563eb', animation: 'slideRight 1s infinite linear' }} /></div>}

            {!selectedCustomer ? (
                // ── OVERALL VIEW ────────────────────────────────────────────────────────
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {renderOverallSummary()}

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                        {/* Segment Breakdown */}
                        <Card title="Customer Segments" icon={<PieChart size={18} />}>
                            <div style={{ height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={overallData?.segmentSummary || []} dataKey="count" nameKey="_id" innerRadius={60} outerRadius={90} paddingAngle={4}>
                                            {(overallData?.segmentSummary || []).map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                        
                        <Card title="Insights" icon={<Activity size={18} />}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Top Segment</div>
                                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>
                                        {overallData?.segmentSummary?.sort((a,b)=>b.value-a.value)[0]?._id || 'N/A'}
                                    </div>
                                </div>
                                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>High Outstanding Customers</div>
                                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>
                                        {(overallData?.results || []).filter(r => r.outstanding > 10000).length} Customers
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <Card title="Customer Analysis Detailed List" icon={<Users size={18} />}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px' }}>
                                <Search size={16} color="#94a3b8" />
                                <input 
                                    type="text" 
                                    placeholder="Search customer name..." 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', fontSize: '14px' }} 
                                />
                            </div>
                            <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', background: '#fff', fontSize: '14px', fontWeight: 500 }}>
                                <option value="">All Segments</option>
                                <option value="Premium">Premium</option>
                                <option value="Standard">Standard</option>
                            </select>
                        </div>

                        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Customer Name</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Segment</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>Sales (₹)</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>Outstanding</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Repeat Orders</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Payment Behaviour</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredResults.map((r, i) => (
                                        <tr key={r._id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>{r.customerName}</td>
                                            <td style={{ padding: '12px 16px' }}><span style={{ padding: '4px 8px', borderRadius: '6px', background: '#dbeafe', color: '#1e40af', fontSize: '12px', fontWeight: 600 }}>{r.segment || r.classification}</span></td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(r.totalValue)}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: r.outstanding > 0 ? '#ef4444' : '#10b981' }}>{fmt(r.outstanding)}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>{r.repeatOrders || 0}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ 
                                                    padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                                                    background: r.paymentBehaviour === 'Good' ? '#dcfce7' : r.paymentBehaviour === 'Average' ? '#fef3c7' : '#fee2e2',
                                                    color: r.paymentBehaviour === 'Good' ? '#166534' : r.paymentBehaviour === 'Average' ? '#92400e' : '#991b1b'
                                                }}>
                                                    {r.paymentBehaviour || 'Unknown'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <button onClick={() => openDeepDive(r)} style={{
                                                    background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px',
                                                    fontSize: '12px', fontWeight: 600, color: '#3b82f6', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                }}>
                                                    <Activity size={14} /> View Graph
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredResults.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No customers match the current filters.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            ) : (
                // ── CUSTOMER DEEP DIVE VIEW ────────────────────────────────────────────────
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#fff', padding: '16px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <button onClick={closeDeepDive} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#64748b' }}>
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{selectedCustomer.customerName}</h2>
                            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>{deepDiveData?.basicStats?.segment || selectedCustomer.classification}</span>
                                <span>First Sale: {deepDiveData?.basicStats?.firstInvoice ? moment(deepDiveData.basicStats.firstInvoice).format('DD MMM YYYY') : 'N/A'}</span>
                                <span>Last Sale: {deepDiveData?.basicStats?.lastInvoice ? moment(deepDiveData.basicStats.lastInvoice).format('DD MMM YYYY') : 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    {renderDeepDiveSummary()}

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                        <Card title={`${viewBy} Sales Trend`} icon={<TrendingUp size={18} />}>
                            <div style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={deepDiveData?.salesTrend || []}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="_id" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip money />} />
                                        <Area type="monotone" dataKey="sales" name="Sales" stroke="#3b82f6" strokeWidth={3} fill="url(#colorSales)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <Card title="Paid vs Outstanding" icon={<CreditCard size={18} />}>
                            <div style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie 
                                            data={[
                                                { name: 'Paid', value: deepDiveData?.basicStats?.totalPaid || 0 },
                                                { name: 'Outstanding', value: deepDiveData?.basicStats?.outstanding || 0 }
                                            ]} 
                                            dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={4}
                                        >
                                            <Cell fill="#10B981" />
                                            <Cell fill="#EF4444" />
                                        </Pie>
                                        <Tooltip content={<CustomTooltip money />} />
                                        <Legend wrapperStyle={{ fontSize: 13, fontWeight: 600 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <Card title="Period Comparison (3M / 6M / 1Y)" icon={<Calendar size={18} />}>
                            <div style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[
                                        { name: 'Last 3M', Sales: deepDiveData?.periodComparison?.last3M || 0 },
                                        { name: 'Last 6M', Sales: deepDiveData?.periodComparison?.last6M || 0 },
                                        { name: 'Last 12M', Sales: deepDiveData?.periodComparison?.last12M || 0 }
                                    ]}>
                                        <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip money />} />
                                        <Bar dataKey="Sales" radius={[6,6,0,0]} barSize={50} fill="#8B5CF6" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <Card title="Repeat Order Trend" icon={<Activity size={18} />}>
                            <div style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={deepDiveData?.repeatTrend || []}>
                                        <XAxis dataKey="_id" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="repeatCount" name="Repeat Orders" fill="#F59E0B" radius={[4,4,0,0]} barSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </div>

                    {/* Product Wise Sales */}
                    <Card title="Product-wise Sales Mix" icon={<Package size={18} />}>
                        <div style={{ height: 380 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={(deepDiveData?.productSales || []).slice(0, 15)} layout="vertical" margin={{ left: 80 }}>
                                    <XAxis type="number" tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="_id" type="category" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip money />} />
                                    <Bar dataKey="value" name="Sales Value" radius={[0,6,6,0]} barSize={16}>
                                        {(deepDiveData?.productSales || []).map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
