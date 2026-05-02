import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
    ResponsiveContainer, FunnelChart, Funnel, LabelList, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell,
    LineChart, Line, AreaChart, Area, PieChart, Pie,
} from 'recharts';
import {
    Users, Target, Package, ShoppingCart, FileText, IndianRupee,
    RefreshCcw, Download, Filter, TrendingUp, Award, Clock,
    AlertCircle, BarChart3, Zap, XCircle, BellRing, ArrowUpRight,
    ArrowRight, ChevronLeft, ChevronRight, Search, Calendar
} from 'lucide-react';
import salesConversionApi from '@/services/salesConversionApi';
import { getFinancialYears } from '@/services/financialYearApi';
import * as userApi from '@/services/userApi';
import s from './SalesConversionDashboard.module.scss';

// ── Colour palette ────────────────────────────────────────────────────────────
const C = ['#2563EB','#14B8A6','#22C55E','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4'];
const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
const pct = (v) => `${isFinite(v) && !isNaN(v) ? Number(v).toFixed(1) : 0}%`;
const safe = (v, fallback = 0) => (isFinite(v) && !isNaN(v) ? v : fallback);

// ── Sub-components ────────────────────────────────────────────────────────────
const KPI = ({ title, value, sub, icon, color, highlight, pulse, onClick }) => (
    <div className={`${s.kpiCard} ${highlight ? s.highlight : ''} ${pulse ? s.pulse : ''} ${onClick ? s.clickable : ''}`} onClick={onClick}>
        <div className={s.kpiTop}>
            <div className={`${s.iconWrap} ${s[color] || ''}`}>{icon}</div>
            {onClick && <ArrowUpRight size={14} className={s.arrow} />}
        </div>
        <div className={s.kpiVal}>{value}</div>
        <div className={s.kpiTitle}>{title}</div>
        {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
);

const Card = ({ title, icon, children, className = '' }) => (
    <div className={`${s.card} ${className}`}>
        <div className={s.cardHead}>
            <span className={s.cardIcon}>{icon}</span>
            <h3>{title}</h3>
        </div>
        <div className={s.cardBody}>{children}</div>
    </div>
);

const NoData = ({ label = 'No data available for selected filters' }) => (
    <div className={s.noData}>
        <BarChart3 size={40} style={{ color: '#94A3B8', marginBottom: 8 }} />
        <p>{label}</p>
    </div>
);

const CustomTooltip = ({ active, payload, label, money }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className={s.tooltip}>
            {label && <p className={s.ttLabel}>{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }}>
                    {p.name}: <strong>{money ? fmt(p.value) : safe(p.value, 0).toLocaleString('en-IN')}</strong>
                </p>
            ))}
        </div>
    );
};

// ── Funnel colour gradient ────────────────────────────────────────────────────
const FUNNEL_COLORS = ['#2563EB','#3B82F6','#14B8A6','#22C55E','#F59E0B','#EF4444','#8B5CF6','#EC4899'];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
const SalesConversionDashboard = () => {
    const navigate = useNavigate();

    const [tab, setTab] = useState('overview'); // overview | items | customers | payment | salesperson | samples

    // Filters
    const [filters, setFilters] = useState({
        fromDate:    moment().subtract(90, 'days').format('YYYY-MM-DD'),
        toDate:      moment().format('YYYY-MM-DD'),
        fy:          '',
        salesperson: '',
        customer:    '',
        item:        '',
        source:      '',
        customerType:'',
        paymentStatus:'',
    });
    const [fys,   setFys]   = useState([]);
    const [users, setUsers] = useState([]);

    // Data
    const [funnel,       setFunnel]       = useState(null);
    const [sampleConv,   setSampleConv]   = useState(null);
    const [nonConv,      setNonConv]      = useState(null);
    const [repeat,       setRepeat]       = useState(null);
    const [items,        setItems]        = useState(null);
    const [customers,    setCustomers]    = useState(null);
    const [spMatrix,     setSpMatrix]     = useState(null);
    const [payment,      setPayment]      = useState(null);

    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    // Pagination for tables
    const [nonConvPage,   setNonConvPage]   = useState(1);
    const [customerPage,  setCustomerPage]  = useState(1);

    // Load meta (FYs + users) once
    useEffect(() => {
        Promise.all([getFinancialYears(), userApi.getUsers({ role: 'sales' })])
            .then(([fyd, sud]) => {
                setFys(fyd?.data || []);
                setUsers(sud?.users || []);
            })
            .catch(() => {});
    }, []);

    // Load all analytics in parallel when filters change
    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const f = filters;
            const [fn, sc, nc, rb, iw, cw, sm, pa] = await Promise.all([
                salesConversionApi.getFunnel(f),
                salesConversionApi.getSampleConversion(f),
                salesConversionApi.getNonConvertedSamples({ ...f, page: nonConvPage, limit: 20 }),
                salesConversionApi.getRepeatBusiness(f),
                salesConversionApi.getItemWiseSales(f),
                salesConversionApi.getCustomerWiseSales({ ...f, page: customerPage, limit: 20 }),
                salesConversionApi.getSalespersonMatrix(f),
                salesConversionApi.getPaymentAnalysis(f),
            ]);
            setFunnel(fn?.data);
            setSampleConv(sc?.data);
            setNonConv(nc?.data);
            setRepeat(rb?.data);
            setItems(iw?.data);
            setCustomers(cw?.data);
            setSpMatrix(sm?.data);
            setPayment(pa?.data);
        } catch (err) {
            setError('Failed to load analytics. Please try refreshing.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filters, nonConvPage, customerPage]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const summary  = funnel?.summary  || {};
    const paySumm  = payment?.summary || {};

    const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

    // ── RENDER ─────────────────────────────────────────────────────────────────
    return (
        <div className={s.root}>
            {/* ── HEADER ── */}
            <div className={s.header}>
                <div>
                    <div className={s.breadcrumb}>Intelligence · Sales Funnel</div>
                    <h1>Sales Conversion Analysis</h1>
                    <p>Full Lead → Sample → Order → Invoice → Payment business intelligence</p>
                </div>
                <div className={s.headerActions}>
                    <button className={s.refreshBtn} onClick={fetchAll} disabled={loading}><RefreshCcw size={16} /></button>
                </div>
            </div>

            {/* ── FILTER BAR ── */}
            <div className={s.filterBar}>
                <div className={s.filterGroup}>
                    <Calendar size={13} />
                    <input type="date" value={filters.fromDate} onChange={e => setFilter('fromDate', e.target.value)} />
                    <span>–</span>
                    <input type="date" value={filters.toDate} onChange={e => setFilter('toDate', e.target.value)} />
                </div>
                <div className={s.filterGroup}>
                    <select
                        value={filters.fy}
                        onChange={e => {
                            const selectedId = e.target.value;
                            if (selectedId) {
                                const selectedFy = fys.find(f => f._id === selectedId);
                                setFilters(prev => ({
                                    ...prev,
                                    fy:       selectedId,
                                    fromDate: selectedFy ? moment(selectedFy.startDate).format('YYYY-MM-DD') : prev.fromDate,
                                    toDate:   moment().format('YYYY-MM-DD'),
                                }));
                            } else {
                                // 'All FY' selected — keep existing dates, just clear fy
                                setFilter('fy', '');
                            }
                        }}
                    >
                        <option value="">All FY</option>
                        {fys.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                    </select>
                </div>
                <div className={s.filterGroup}>
                    <Users size={13} />
                    <select value={filters.salesperson} onChange={e => setFilter('salesperson', e.target.value)}>
                        <option value="">All Salespersons</option>
                        {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </select>
                </div>
                <div className={s.filterGroup}>
                    <select value={filters.paymentStatus} onChange={e => setFilter('paymentStatus', e.target.value)}>
                        <option value="">All Payment Status</option>
                        <option value="Paid">Paid</option>
                        <option value="Partially Paid">Partially Paid</option>
                        <option value="Unpaid">Unpaid</option>
                    </select>
                </div>
                <button className={s.clearBtn} onClick={() => setFilters({ fromDate: moment().subtract(90,'days').format('YYYY-MM-DD'), toDate: moment().format('YYYY-MM-DD'), fy:'', salesperson:'', customer:'', item:'', source:'', customerType:'', paymentStatus:'' })}>Clear</button>
            </div>

            {error && <div className={s.errorBanner}><AlertCircle size={15}/> {error}</div>}

            {/* ── TABS ── */}
            <div className={s.tabs}>
                {[
                    { id: 'overview',    label: 'Overview & Funnel' },
                    { id: 'samples',     label: 'Sample Analysis' },
                    { id: 'repeat',      label: 'Repeat Business' },
                    { id: 'items',       label: 'Item-Wise Sales' },
                    { id: 'customers',   label: 'Customer Analysis' },
                    { id: 'salesperson', label: 'Team Performance' },
                    { id: 'payment',     label: 'Payment Analysis' },
                ].map(t => (
                    <button key={t.id} className={tab === t.id ? s.tabActive : s.tabBtn} onClick={() => setTab(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {loading && <div className={s.loadingBar}><div className={s.loadingProg} /></div>}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: OVERVIEW                                                    */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {tab === 'overview' && (
                <div className={s.tabContent}>
                    {/* 12 KPI CARDS */}
                    <div className={s.kpiGrid}>
                        <KPI title="Leads Generated"  value={safe(summary.totalLeads,0).toLocaleString()}       icon={<Users size={18}/>}       color="blue"    onClick={() => navigate('/customers/list?status=lead')} />
                        <KPI title="Samples Sent"     value={safe(summary.sampleCustomers,0).toLocaleString()}  icon={<Package size={18}/>}     color="amber"   onClick={() => setTab('samples')} />
                        <KPI title="Orders Converted" value={safe(summary.orderCustomers,0).toLocaleString()}   icon={<ShoppingCart size={18}/>} color="orange"  onClick={() => navigate('/sales/orders')} />
                        <KPI title="Invoices Made"    value={safe(summary.invoiceCustomers,0).toLocaleString()} icon={<FileText size={18}/>}    color="emerald" onClick={() => navigate('/sales/invoices')} />
                        <KPI title="Repeat Customers" value={safe(summary.repeatCustomers,0).toLocaleString()}  icon={<TrendingUp size={18}/>}  color="purple"  onClick={() => setTab('repeat')} />
                        <KPI title="Total Sales"      value={fmt(summary.totalSalesValue)}                      icon={<IndianRupee size={18}/>} color="indigo"  highlight />
                        <KPI title="Payment Received" value={fmt(paySumm.totalPaid)}                            icon={<Award size={18}/>}       color="cyan"    onClick={() => setTab('payment')} />
                        <KPI title="Outstanding"      value={fmt(paySumm.outstanding)}                          icon={<AlertCircle size={18}/>} color="rose"    pulse={paySumm.outstanding > 0} onClick={() => setTab('payment')} />
                        <KPI title="Sample→Order %"   value={pct(summary.sampleToOrderPct)}                    icon={<Zap size={18}/>}         color="violet"  sub="Conversion rate" />
                        <KPI title="Lead→Order %"     value={pct(summary.leadToOrderPct)}                      icon={<Target size={18}/>}      color="pink"    sub="Funnel efficiency" />
                        <KPI title="Repeat Sales %"   value={pct(summary.repeatSalesPct)}                      icon={<BarChart3 size={18}/>}   color="emerald" sub="of invoiced customers" />
                        <KPI title="Overdue Bills"    value={safe(paySumm.overdueInvoices,0).toLocaleString()}  icon={<XCircle size={18}/>}     color="red"     pulse={paySumm.overdueInvoices > 0} sub={fmt(paySumm.overdueValue)} onClick={() => setTab('payment')} />
                    </div>

                    {/* ── FUNNEL CHART + MONTHLY TREND ── */}
                    <div className={s.chartRow2}>
                        <Card title="Lead-to-Payment Funnel" icon={<Target size={15}/>} className={s.span7}>
                            {(funnel?.funnel?.length || 0) === 0 ? <NoData /> : (
                                <div style={{ height: 380 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <FunnelChart>
                                            <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                                                <div className={s.tooltip}>
                                                    <p className={s.ttLabel}>{payload[0].payload.stage}</p>
                                                    <p>Count: <strong>{safe(payload[0].payload.count, 0).toLocaleString()}</strong></p>
                                                    {payload[0].payload.value > 0 && <p>Value: <strong>{fmt(payload[0].payload.value)}</strong></p>}
                                                    <p>Conv from Prev: <strong>{pct(payload[0].payload.convFromPrev)}</strong></p>
                                                    <p>Conv from Leads: <strong>{pct(payload[0].payload.convFromLead)}</strong></p>
                                                </div>
                                            ) : null} />
                                            <Funnel dataKey="count" data={funnel.funnel.map((d, i) => ({ ...d, fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }))}>
                                                <LabelList position="right" dataKey="stage" fill="#475569" stroke="none" fontSize={11} fontWeight="700" />
                                                <LabelList position="center" dataKey="count" fill="white" stroke="none" fontSize={12} fontWeight="900" />
                                            </Funnel>
                                        </FunnelChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>

                        <Card title="Monthly Sales Trend" icon={<TrendingUp size={15}/>} className={s.span5}>
                            {!(funnel?.monthlyTrend?.length) ? <NoData /> : (
                                <div style={{ height: 380 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <AreaChart data={funnel.monthlyTrend}>
                                            <defs>
                                                <linearGradient id="gInvoiced" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.15} />
                                                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%"  stopColor="#14B8A6" stopOpacity={0.15} />
                                                    <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="_id" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip money />} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                            <Area type="monotone" dataKey="value" name="Invoiced" stroke="#2563EB" strokeWidth={3} fill="url(#gInvoiced)" />
                                            <Area type="monotone" dataKey="paid"  name="Paid"     stroke="#14B8A6" strokeWidth={3} fill="url(#gPaid)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Funnel Stage Table */}
                    <Card title="Funnel Stage Breakdown" icon={<BarChart3 size={15}/>}>
                        <div className={s.tableWrap}>
                            <table className={s.table}>
                                <thead><tr>
                                    <th>Stage</th><th>Count</th><th>Value (₹)</th>
                                    <th>Conv. from Prev.</th><th>Conv. from Leads</th>
                                </tr></thead>
                                <tbody>
                                    {(funnel?.funnel || []).map((row, i) => (
                                        <tr key={i}>
                                            <td><span className={s.stageDot} style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />{row.stage}</td>
                                            <td><strong>{safe(row.count, 0).toLocaleString()}</strong></td>
                                            <td>{row.value > 0 ? fmt(row.value) : '—'}</td>
                                            <td><span className={s.pctBadge}>{pct(row.convFromPrev)}</span></td>
                                            <td><span className={s.pctBadge}>{pct(row.convFromLead)}</span></td>
                                        </tr>
                                    ))}
                                    {!(funnel?.funnel?.length) && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>No data</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: SAMPLE ANALYSIS                                             */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {tab === 'samples' && (
                <div className={s.tabContent}>
                    <div className={s.kpiGrid4}>
                        <KPI title="Sample Customers" value={safe(sampleConv?.summary?.totalSampleCustomers,0)} icon={<Package size={18}/>} color="amber" />
                        <KPI title="Converted"        value={safe(sampleConv?.summary?.converted,0)}           icon={<ShoppingCart size={18}/>} color="emerald" />
                        <KPI title="Not Converted"    value={safe(sampleConv?.summary?.notConverted,0)}        icon={<XCircle size={18}/>} color="rose" />
                        <KPI title="Conversion %"     value={pct(sampleConv?.summary?.conversionPct)}          icon={<Zap size={18}/>} color="indigo" sub={`Avg ${safe(sampleConv?.summary?.avgDaysToConvert,0)} days`} />
                    </div>

                    <div className={s.chartRow2}>
                        {/* Salesperson Sample Conversion */}
                        <Card title="Salesperson Sample-to-Order Performance" icon={<Award size={15}/>} className={s.span6}>
                            {!(sampleConv?.salespersonStats?.length) ? <NoData /> : (
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <BarChart data={sampleConv.salespersonStats} layout="vertical">
                                            <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                            <Bar dataKey="total"     name="Total Samples" fill="#94a3b8" radius={[0,4,4,0]} barSize={10} />
                                            <Bar dataKey="converted" name="Converted"     fill="#10b981" radius={[0,4,4,0]} barSize={10} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                        {/* Source Sample Conversion */}
                        <Card title="Source-wise Sample Conversion" icon={<Target size={15}/>} className={s.span6}>
                            {!(sampleConv?.sourceStats?.length) ? <NoData /> : (
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <BarChart data={sampleConv.sourceStats}>
                                            <XAxis dataKey="source" tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                            <Bar dataKey="total"     name="Sample Customers" fill="#6366f1" radius={[4,4,0,0]} barSize={24} />
                                            <Bar dataKey="converted" name="Converted"         fill="#10b981" radius={[4,4,0,0]} barSize={24} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Non-Converted Samples Table */}
                    <Card title="⚠️ Sample Sent — No Order Received" icon={<AlertCircle size={15}/>}>
                        <div className={s.tableWrap}>
                            <table className={s.table}>
                                <thead><tr>
                                    <th>Customer</th><th>Sample Items</th><th>Sample Date</th>
                                    <th>Salesperson</th><th>Stage</th><th>Lost Reason</th>
                                    <th>Days Pending</th><th>Last Followup</th>
                                </tr></thead>
                                <tbody>
                                    {(nonConv?.results || []).map((r, i) => (
                                        <tr key={i}>
                                            <td><strong>{r.customerName}</strong></td>
                                            <td>{(r.sampleItems || []).filter(Boolean).join(', ') || '—'}</td>
                                            <td>{r.sampleDate ? moment(r.sampleDate).format('DD-MM-YY') : '—'}</td>
                                            <td>{r.salesperson || '—'}</td>
                                            <td><span className={s.stagePill}>{r.leadStage || '—'}</span></td>
                                            <td>
                                                <strong>{r.lostReason || '—'}</strong>
                                                {r.lostMatter && <div className={s.lostMatter}>{r.lostMatter}</div>}
                                            </td>
                                            <td>
                                                <span className={`${s.daysBadge} ${r.daysPending > 90 ? s.danger : r.daysPending > 30 ? s.warn : ''}`}>
                                                    {safe(r.daysPending, 0)} days
                                                </span>
                                            </td>
                                            <td>{r.lastFollowupDate ? moment(r.lastFollowupDate).format('DD-MM-YY') : '—'}</td>
                                        </tr>
                                    ))}
                                    {!(nonConv?.results?.length) && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8' }}>No non-converted samples in this period</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={nonConvPage} totalPages={nonConv?.totalPages || 1} total={nonConv?.total || 0} onPage={setNonConvPage} />
                    </Card>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: REPEAT BUSINESS                                             */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {tab === 'repeat' && (
                <div className={s.tabContent}>
                    <div className={s.kpiGrid4}>
                        <KPI title="Total Customers"  value={safe(repeat?.summary?.totalCustomers,0)}     icon={<Users size={18}/>}    color="blue" />
                        <KPI title="Repeat Buyers"    value={safe(repeat?.summary?.repeatCustomers,0)}    icon={<TrendingUp size={18}/>} color="purple" />
                        <KPI title="Inactive Buyers"  value={safe(repeat?.summary?.inactiveCustomers,0)}  icon={<XCircle size={18}/>}  color="rose" />
                        <KPI title="Repeat Sales %"   value={pct(repeat?.summary?.repeatSalesPct)}        icon={<BarChart3 size={18}/>} color="emerald" />
                        <KPI title="Active (30d)"     value={safe(repeat?.summary?.activeIn30,0)}         icon={<Zap size={18}/>}      color="indigo" />
                        <KPI title="Active (60d)"     value={safe(repeat?.summary?.activeIn60,0)}         icon={<Zap size={18}/>}      color="cyan" />
                        <KPI title="Active (90d)"     value={safe(repeat?.summary?.activeIn90,0)}         icon={<Zap size={18}/>}      color="amber" />
                        <KPI title="Active (180d)"    value={safe(repeat?.summary?.activeIn180,0)}        icon={<Zap size={18}/>}      color="violet" />
                    </div>

                    <div className={s.chartRow2}>
                        {/* Customer Classification Donut */}
                        <Card title="Customer Classification" icon={<Users size={15}/>} className={s.span5}>
                            {!(repeat?.classifications?.length) ? <NoData /> : (
                                <div style={{ height: 300 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <PieChart>
                                            <Pie data={repeat.classifications} dataKey="count" nameKey="name"
                                                innerRadius={65} outerRadius={95} stroke="none" paddingAngle={4}>
                                                {repeat.classifications.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                            </Pie>
                                            <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                                                <div className={s.tooltip}>
                                                    <p><strong>{payload[0].payload.name}</strong></p>
                                                    <p>Count: {payload[0].payload.count} &nbsp;({safe(payload[0].payload.pct,0)}%)</p>
                                                </div>
                                            ) : null} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>

                        {/* Monthly Repeat Trend */}
                        <Card title="Monthly Repeat Order Trend" icon={<TrendingUp size={15}/>} className={s.span7}>
                            {!(repeat?.monthlyRepeatTrend?.length) ? <NoData /> : (
                                <div style={{ height: 300 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <LineChart data={repeat.monthlyRepeatTrend}>
                                            <XAxis dataKey="_id" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                            <Line type="monotone" dataKey="totalOrders"  name="Total"  stroke="#2563EB" strokeWidth={3} dot={false} />
                                            <Line type="monotone" dataKey="repeatOrders" name="Repeat" stroke="#14B8A6" strokeWidth={3} dot={{ r: 4, fill: '#14B8A6', stroke: '#fff', strokeWidth: 2 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Top Repeat Customers */}
                    <Card title="Top Repeat Customers" icon={<Award size={15}/>}>
                        <div className={s.tableWrap}>
                            <table className={s.table}>
                                <thead><tr>
                                    <th>#</th><th>Customer</th><th>Invoices</th>
                                    <th>Total Sales</th><th>First Invoice</th><th>Last Invoice</th><th>Classification</th>
                                </tr></thead>
                                <tbody>
                                    {(repeat?.topRepeaters || []).map((r, i) => (
                                        <tr key={i}>
                                            <td>{i+1}</td>
                                            <td><strong>{r.customerName}</strong></td>
                                            <td>{r.invoiceCount}</td>
                                            <td><strong>{fmt(r.totalValue)}</strong></td>
                                            <td>{r.firstInvoice ? moment(r.firstInvoice).format('DD-MM-YY') : '—'}</td>
                                            <td>{r.lastInvoice  ? moment(r.lastInvoice).format('DD-MM-YY')  : '—'}</td>
                                            <td><span className={s.classBadge}>{r.classification}</span></td>
                                        </tr>
                                    ))}
                                    {!(repeat?.topRepeaters?.length) && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>No data</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: ITEM-WISE SALES                                             */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {tab === 'items' && (
                <div className={s.tabContent}>
                    <div className={s.chartRow2}>
                        <Card title="Top Items by Invoice Value" icon={<IndianRupee size={15}/>} className={s.span6}>
                            {!(items?.topByValue?.length) ? <NoData /> : (
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <BarChart data={items.topByValue.slice(0, 10)} layout="vertical">
                                            <XAxis type="number" tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="itemName" type="category" width={120} tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip money />} />
                                            <Bar dataKey="invoiceValue" name="Invoice Value" radius={[0,6,6,0]} barSize={14}>
                                                {items.topByValue.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                        <Card title="Top Items by Quantity" icon={<Package size={15}/>} className={s.span6}>
                            {!(items?.topByQty?.length) ? <NoData /> : (
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <BarChart data={items.topByQty.slice(0, 10)} layout="vertical">
                                            <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="itemName" type="category" width={120} tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="qtyTotal" name="Qty Sold" radius={[0,6,6,0]} barSize={14}>
                                                {items.topByQty.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Item Detail Table */}
                    <Card title="Item-Wise Sales Detail" icon={<BarChart3 size={15}/>}>
                        <div className={s.tableWrap}>
                            <table className={s.table}>
                                <thead><tr>
                                    <th>#</th><th>Item</th><th>Code</th><th>Qty Sold</th>
                                    <th>Invoice Value</th><th>Invoices</th><th>Customers</th>
                                    <th>Avg Rate</th><th>Sample Count</th><th>Sample Conv%</th>
                                </tr></thead>
                                <tbody>
                                    {(items?.itemStats || []).map((r, i) => (
                                        <tr key={i}>
                                            <td>{i+1}</td>
                                            <td><strong>{r.itemName}</strong></td>
                                            <td>{r.itemCode || '—'}</td>
                                            <td>{safe(r.qtyTotal,0).toLocaleString()}</td>
                                            <td><strong>{fmt(r.invoiceValue)}</strong></td>
                                            <td>{r.invoiceCount}</td>
                                            <td>{r.customerCount}</td>
                                            <td>{fmt(r.avgRate)}</td>
                                            <td>{r.sampleCount || '—'}</td>
                                            <td>{r.sampleConvPct != null ? <span className={s.pctBadge}>{pct(r.sampleConvPct)}</span> : '—'}</td>
                                        </tr>
                                    ))}
                                    {!(items?.itemStats?.length) && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8' }}>No item data</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* High Sample Low Conversion */}
                    {(items?.highSampleLowOrder?.length > 0) && (
                        <Card title="⚠️ High Sample – Low Conversion Items" icon={<AlertCircle size={15}/>}>
                            <div className={s.tableWrap}>
                                <table className={s.table}>
                                    <thead><tr><th>Item</th><th>Sample Count</th><th>Invoice Count</th><th>Conv%</th></tr></thead>
                                    <tbody>
                                        {items.highSampleLowOrder.map((r, i) => (
                                            <tr key={i}>
                                                <td><strong>{r.itemName}</strong></td>
                                                <td>{r.sampleCount}</td>
                                                <td>{r.invoiceCount}</td>
                                                <td><span className={`${s.pctBadge} ${s.danger}`}>{pct(r.sampleConvPct)}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: CUSTOMER ANALYSIS                                           */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {tab === 'customers' && (
                <div className={s.tabContent}>
                    {/* Segment summary */}
                    {customers?.segmentSummary?.length > 0 && (
                        <div className={s.kpiGrid4}>
                            {customers.segmentSummary.map((seg, i) => (
                                <KPI key={i} title={seg._id} value={seg.count} icon={<Users size={18}/>} color={['blue','purple','emerald'][i % 3]} sub={fmt(seg.value)} />
                            ))}
                        </div>
                    )}

                    <Card title="Customer-Wise Sales Detail" icon={<Users size={15}/>}>
                        <div className={s.tableWrap}>
                            <table className={s.table}>
                                <thead><tr>
                                    <th>#</th><th>Customer</th><th>Type</th>
                                    <th>Invoices</th><th>Total Sales</th><th>Paid</th><th>Outstanding</th>
                                    <th>First Sale</th><th>Last Sale</th><th>Segment</th>
                                </tr></thead>
                                <tbody>
                                    {(customers?.results || []).map((r, i) => (
                                        <tr key={i}>
                                            <td>{(customerPage-1)*20 + i + 1}</td>
                                            <td><strong>{r.customerName}</strong></td>
                                            <td>{r.customerType || '—'}</td>
                                            <td>{r.invoiceCount}</td>
                                            <td><strong>{fmt(r.totalValue)}</strong></td>
                                            <td>{fmt(r.totalPaid)}</td>
                                            <td>
                                                <span className={r.outstanding > 0 ? s.outstandingWarn : ''}>
                                                    {fmt(r.outstanding)}
                                                </span>
                                            </td>
                                            <td>{r.firstInvoice ? moment(r.firstInvoice).format('DD-MM-YY') : '—'}</td>
                                            <td>{r.lastInvoice  ? moment(r.lastInvoice).format('DD-MM-YY')  : '—'}</td>
                                            <td><span className={s.classBadge}>{r.classification}</span></td>
                                        </tr>
                                    ))}
                                    {!(customers?.results?.length) && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8' }}>No data</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={customerPage} totalPages={customers?.totalPages || 1} total={customers?.total || 0} onPage={setCustomerPage} />
                    </Card>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: SALESPERSON / TEAM PERFORMANCE                              */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {tab === 'salesperson' && (
                <div className={s.tabContent}>
                    <div className={s.chartRow2}>
                        <Card title="Sales Value by Salesperson" icon={<Award size={15}/>} className={s.span6}>
                            {!(spMatrix?.matrix?.length) ? <NoData /> : (
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <BarChart data={spMatrix.matrix} layout="vertical">
                                            <XAxis type="number" tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip money />} />
                                            <Bar dataKey="salesValue" name="Sales Value" radius={[0,6,6,0]} barSize={16}>
                                                {spMatrix.matrix.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                        <Card title="Lead → Invoice Conversion %" icon={<Target size={15}/>} className={s.span6}>
                            {!(spMatrix?.matrix?.length) ? <NoData /> : (
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <BarChart data={spMatrix.matrix}>
                                            <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                            <Bar dataKey="sampleToOrderPct" name="Sample→Order%" fill="#2563EB" radius={[4,4,0,0]} barSize={20} />
                                            <Bar dataKey="leadToInvoicePct" name="Lead→Invoice%" fill="#14B8A6" radius={[4,4,0,0]} barSize={20} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                    </div>

                    <Card title="Full Salesperson Conversion Matrix" icon={<BarChart3 size={15}/>}>
                        <div className={s.tableWrap}>
                            <table className={s.table}>
                                <thead><tr>
                                    <th>Salesperson</th><th>Leads</th><th>Contacted</th><th>Qualified</th>
                                    <th>Samples</th><th>Orders</th><th>Invoices</th><th>Sales Value</th>
                                    <th>Sample→Order%</th><th>Lead→Invoice%</th>
                                </tr></thead>
                                <tbody>
                                    {(spMatrix?.matrix || []).map((r, i) => (
                                        <tr key={i}>
                                            <td><strong>{r.name}</strong></td>
                                            <td>{r.leads}</td>
                                            <td>{r.contacted}</td>
                                            <td>{r.qualified}</td>
                                            <td>{r.samples}</td>
                                            <td>{r.orders}</td>
                                            <td>{r.invoices}</td>
                                            <td><strong>{fmt(r.salesValue)}</strong></td>
                                            <td><span className={s.pctBadge}>{pct(r.sampleToOrderPct)}</span></td>
                                            <td><span className={s.pctBadge}>{pct(r.leadToInvoicePct)}</span></td>
                                        </tr>
                                    ))}
                                    {!(spMatrix?.matrix?.length) && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8' }}>No data</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: PAYMENT ANALYSIS                                            */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {tab === 'payment' && (
                <div className={s.tabContent}>
                    <div className={s.kpiGrid4}>
                        <KPI title="Total Invoiced"   value={fmt(paySumm.totalInvoiced)}         icon={<FileText size={18}/>}       color="blue" />
                        <KPI title="Payment Received" value={fmt(paySumm.totalPaid)}              icon={<IndianRupee size={18}/>}    color="emerald" highlight />
                        <KPI title="Outstanding"      value={fmt(paySumm.outstanding)}            icon={<AlertCircle size={18}/>}    color="rose"    pulse={paySumm.outstanding > 0} />
                        <KPI title="Collection %"     value={pct(paySumm.collectionEfficiencyPct)} icon={<BarChart3 size={18}/>}    color="indigo"  sub="Efficiency" />
                        <KPI title="Fully Paid"       value={safe(paySumm.fullyPaidInvoices,0)}   icon={<Award size={18}/>}         color="emerald" />
                        <KPI title="Partially Paid"   value={safe(paySumm.partiallyPaidInvoices,0)} icon={<Zap size={18}/>}        color="amber" />
                        <KPI title="Unpaid"           value={safe(paySumm.unpaidInvoices,0)}      icon={<XCircle size={18}/>}       color="slate" />
                        <KPI title="Overdue Bills"    value={safe(paySumm.overdueInvoices,0)}     icon={<Clock size={18}/>}         color="red"     pulse sub={fmt(paySumm.overdueValue)} />
                    </div>

                    <div className={s.chartRow3}>
                        {/* Payment Mode Donut */}
                        <Card title="Payment Mode Distribution" icon={<IndianRupee size={15}/>} className={s.span4}>
                            {!(payment?.modeDistribution?.length) ? <NoData /> : (
                                <div style={{ height: 280 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <PieChart>
                                            <Pie data={payment.modeDistribution} dataKey="value" nameKey="_id"
                                                innerRadius={60} outerRadius={85} stroke="none" paddingAngle={4}>
                                                {payment.modeDistribution.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip money />} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                        {/* Payment Timing */}
                        <Card title="Payment Timing Analysis" icon={<Clock size={15}/>} className={s.span4}>
                            {!(payment?.paymentTiming?.length) ? <NoData /> : (
                                <div style={{ height: 280 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <BarChart data={payment.paymentTiming}>
                                            <XAxis dataKey="_id" tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="count" name="Payments" radius={[6,6,0,0]} barSize={32}>
                                                {payment.paymentTiming.map((e, i) => (
                                                    <Cell key={i} fill={e._id === 'Delayed' ? '#EF4444' : e._id === 'Advance' ? '#22C55E' : '#2563EB'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                        {/* Customer Behavior Donut */}
                        <Card title="Customer Payment Behavior" icon={<Users size={15}/>} className={s.span4}>
                            {!(payment?.customerBehaviorSummary?.length) ? <NoData /> : (
                                <div style={{ height: 280 }}>
                                    <ResponsiveContainer width="99%" height="100%">
                                        <PieChart>
                                            <Pie data={payment.customerBehaviorSummary} dataKey="count" nameKey="name"
                                                innerRadius={60} outerRadius={85} stroke="none" paddingAngle={4}>
                                                {payment.customerBehaviorSummary.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Monthly Realization */}
                    <Card title="Monthly Payment Realization Trend" icon={<TrendingUp size={15}/>}>
                        {!(payment?.monthlyRealization?.length) ? <NoData /> : (
                            <div style={{ height: 280 }}>
                                <ResponsiveContainer width="99%" height="100%">
                                    <BarChart data={payment.monthlyRealization}>
                                        <XAxis dataKey="_id" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip money />} />
                                        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                        <Bar dataKey="invoiced" name="Invoiced" fill="#2563EB" radius={[4,4,0,0]} barSize={18} />
                                        <Bar dataKey="paid"     name="Paid"     fill="#14B8A6" radius={[4,4,0,0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>

                    {/* Top Outstanding Customers */}
                    <div className={s.chartRow2}>
                        <Card title="Top Outstanding Customers" icon={<AlertCircle size={15}/>} className={s.span6}>
                            <div className={s.tableWrap}>
                                <table className={s.table}>
                                    <thead><tr><th>Customer</th><th>Invoiced</th><th>Paid</th><th>Outstanding</th><th>Behavior</th></tr></thead>
                                    <tbody>
                                        {(payment?.topOutstanding || []).slice(0, 10).map((r, i) => (
                                            <tr key={i}>
                                                <td><strong>{r.customerName}</strong></td>
                                                <td>{fmt(r.totalInvoiced)}</td>
                                                <td>{fmt(r.totalPaid)}</td>
                                                <td><span className={s.outstandingWarn}>{fmt(r.outstanding)}</span></td>
                                                <td><span className={s.classBadge}>{r.behavior}</span></td>
                                            </tr>
                                        ))}
                                        {!(payment?.topOutstanding?.length) && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>No data</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                        <Card title="Top Delayed Payment Customers" icon={<Clock size={15}/>} className={s.span6}>
                            <div className={s.tableWrap}>
                                <table className={s.table}>
                                    <thead><tr><th>Customer</th><th>Invoices</th><th>Invoiced</th><th>Outstanding</th></tr></thead>
                                    <tbody>
                                        {(payment?.topDelayed || []).slice(0, 10).map((r, i) => (
                                            <tr key={i}>
                                                <td><strong>{r.customerName}</strong></td>
                                                <td>{r.invoiceCount}</td>
                                                <td>{fmt(r.totalInvoiced)}</td>
                                                <td><span className={s.outstandingWarn}>{fmt(r.outstanding)}</span></td>
                                            </tr>
                                        ))}
                                        {!(payment?.topDelayed?.length) && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>No delayed customers</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            <div className={s.footer}>
                Sales Conversion Intelligence · Live CRM Data · Confidential
            </div>
        </div>
    );
};

// ── Pagination helper ─────────────────────────────────────────────────────────
const Pagination = ({ page, totalPages, total, onPage }) => (
    <div className={s.pagination}>
        <span className={s.pgInfo}>{total} records · Page {page} of {totalPages}</span>
        <button className={s.pgBtn} onClick={() => onPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={14}/></button>
        <button className={s.pgBtn} onClick={() => onPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={14}/></button>
    </div>
);

export default SalesConversionDashboard;
