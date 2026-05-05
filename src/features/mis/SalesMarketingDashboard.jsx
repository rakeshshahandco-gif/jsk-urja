import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Target, 
  Package, 
  ShoppingCart, 
  IndianRupee, 
  TrendingUp, 
  PieChart as PieChartIcon,
  Filter,
  Download,
  Calendar,
  ChevronDown,
  ArrowUpRight,
  Clock,
  AlertCircle,
  Award,
  BellRing,
  FileText,
  Zap,
  BarChart3,
  CheckCircle2,
  XCircle,
  BarChart,
  RefreshCcw,
  Search
} from 'lucide-react';
import { 
  FunnelChart, 
  Funnel, 
  LabelList, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart as ReBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area
} from 'recharts';
import analyticsApi from '@/services/analyticsApi';
import * as userApi from '@/services/userApi';
import { getFinancialYears } from '@/services/financialYearApi';
import s from './SalesMarketingDashboard.module.scss';
import moment from 'moment';

const SalesMarketingDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [data, setData] = useState(null);
    const [users, setUsers] = useState([]);
    const [financialYears, setFinancialYears] = useState([]);
    const [filters, setFilters] = useState({
        fromDate: moment().subtract(30, 'days').format('YYYY-MM-DD'),
        toDate: moment().format('YYYY-MM-DD'),
        salesperson: '',
        fy: ''
    });

    const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4'];

    useEffect(() => {
        setMounted(true);
        const fetchMeta = async () => {
            try {
                const [fys, sps] = await Promise.all([
                    getFinancialYears(),
                    userApi.getUsers({ role: 'sales' })
                ]);
                setFinancialYears(fys?.data || []);
                setUsers(sps?.users || []);
            } catch (err) { console.error('Meta fetch failed', err); }
        };
        fetchMeta();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const analytics = await analyticsApi.getSalesMarketingDashboard(filters);
                setData(analytics?.data);
            } catch (error) {
                console.error('Failed to fetch analytics', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [filters]);

    const handleExport = async () => {
        try {
            const queryParams = new URLSearchParams(filters).toString();
            window.open(`${import.meta.env.VITE_API_BASE_URL}/v1/analytics/export-sales-marketing?${queryParams}`, '_blank');
        } catch (error) { console.error('Export failed', error); }
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: 'INR', maximumFractionDigits: 0
        }).format(val || 0);
    };

    const funnelData = useMemo(() => {
        const s = data?.summary;
        if (!s) return [];
        return [
            { value: s.totalLeads || 0, name: 'Generated', fill: '#6366f1' },
            { value: s.contacted || 0, name: 'Contacted', fill: '#8b5cf6' },
            { value: s.qualified || 0, name: 'Qualified', fill: '#ec4899' },
            { value: s.samples || 0, name: 'Sample', fill: '#f43f5e' },
            { value: s.orders || 0, name: 'Order', fill: '#f59e0b' },
            { value: s.invoices || 0, name: 'Invoice', fill: '#10b981' },
        ].filter(d => !!d.value);
    }, [data]);

    const s_data = data?.summary || {};

    if (loading && !data) {
        return (
            <div className={s.loader}>
                <div className={s.spinner}></div>
                <span>Syncing Corporate Intelligence...</span>
            </div>
        );
    }

    return (
        <div className={s.dashboardContainer}>
            {/* Header Section */}
            <div className={s.headerRow}>
                <div className={s.titleSection}>
                    <div className={s.breadcrumb}>MIS Reports &bull; Sales Operations</div>
                    <h1>Sales MIS Dashboard</h1>
                    <p>Live Lead-to-Cash Business Intelligence Engine</p>
                </div>

                <div className={s.actionSection}>
                    <div className={s.filterBar}>
                        <Clock size={14} style={{ color: '#6366f1' }} />
                        <select 
                            value={filters.fy}
                            onChange={(e) => setFilters(prev => ({ ...prev, fy: e.target.value }))}
                        >
                            <option value="">Current FY</option>
                            {financialYears.map(fy => <option key={fy._id} value={fy._id}>{fy.name}</option>)}
                        </select>
                    </div>

                    <div className={s.filterBar} style={{ padding: '0 12px' }}>
                        <Calendar size={14} style={{ color: '#94a3b8' }} />
                        <input type="date" value={filters.fromDate} onChange={(e) => setFilters(prev => ({ ...prev, fromDate: e.target.value }))} style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 900 }} />
                        <span style={{ margin: '0 8px', color: '#e2e8f0' }}>-</span>
                        <input type="date" value={filters.toDate} onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value }))} style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 900 }} />
                    </div>

                    <div className={s.filterBar}>
                        <Users size={14} style={{ color: '#94a3b8' }} />
                        <select value={filters.salesperson} onChange={(e) => setFilters(prev => ({ ...prev, salesperson: e.target.value }))}>
                            <option value="">Global View</option>
                            {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                        </select>
                    </div>

                    <div className={s.btnGroup}>
                        <button onClick={() => setFilters({ ...filters })} className={s.refreshBtn}><RefreshCcw size={16} /></button>
                        <button onClick={handleExport} className={s.exportButton}><Download size={16} /> Export Intelligence</button>
                    </div>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className={s.kpiGrid}>
                <KPICard title="Total Leads" value={s_data?.totalLeads || 0} icon={<Users size={18} />} color="blue" onClick={() => navigate('/customers/list?status=lead')} />
                <KPICard title="Engagement" value={s_data?.contacted || 0} icon={<BellRing size={18} />} color="purple" onClick={() => navigate('/reports/followups')} />
                <KPICard title="Qualified" value={s_data?.qualified || 0} icon={<Target size={18} />} color="pink" onClick={() => navigate('/customers/list?stage=Qualified')} />
                <KPICard title="Sample Issued" value={s_data?.samples || 0} icon={<Package size={18} />} color="amber" onClick={() => navigate('/rd-samples/samples')} />
                <KPICard title="Sales Orders" value={s_data?.orders || 0} icon={<ShoppingCart size={18} />} color="orange" onClick={() => navigate('/sales/orders')} />
                <KPICard title="Invoice Done" value={s_data?.invoices || 0} icon={<FileText size={18} />} color="emerald" onClick={() => navigate('/sales/invoices')} />
                <KPICard title="Gross Sales" value={formatCurrency(s_data?.salesValue)} icon={<IndianRupee size={18} />} color="indigo" highlight />
                <KPICard title="Lead Cycle" value={`${s_data?.leadToCashDays || 0} Days`} icon={<Clock size={18} />} color="cyan" sub="Average Lead-to-Cash" />
                <KPICard title="Conversion Rate" value={`${s_data?.conversionRate || 0}%`} icon={<Zap size={18} />} color="rose" sub="Inquiry Success" />
                <KPICard title="Sample Logic" value={`${s_data?.sampleToSoRate || 0}%`} icon={<BarChart3 size={18} />} color="violet" sub="Sample-to-SO%" />
                <KPICard title="Lost Deals" value={s_data?.lostLeads || 0} icon={<XCircle size={18} />} color="slate" onClick={() => navigate('/customers/list?stage=Lost')} />
                <KPICard title="Alert Action" value={s_data?.overdueFollowups || 0} icon={<AlertCircle size={18} />} color="red" animate={(s_data?.overdueFollowups || 0) > 0} onClick={() => navigate('/reports/open-reminders')} sub="Overdue Followups" />
            </div>

            {/* Charts Section */}
            {mounted && (
                <div className={s.mainGrid}>
                    <CardWrapper title="Performance Funnel" icon={<Target size={16} />}>
                        <ResponsiveContainer width="99%" height={350}>
                            <FunnelChart>
                                <Tooltip contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} />
                                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                                    <LabelList position="right" fill="#64748b" stroke="none" dataKey="name" fontSize={11} fontWeight="900" />
                                </Funnel>
                            </FunnelChart>
                        </ResponsiveContainer>
                    </CardWrapper>

                    <CardWrapper title="Generation Velocity (Leads)" icon={<TrendingUp size={16} />}>
                        <ResponsiveContainer width="99%" height={350}>
                            <AreaChart data={data?.trends || []}>
                                <defs>
                                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="_id" tick={{ fontSize: 9, fontWeight: '800', fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => moment(v).format('DD MMM')} />
                                <YAxis tick={{ fontSize: 9, fontWeight: '800', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: 16, border: 'none' }} />
                                <Area type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorLeads)" dot={{ r: 4, fill: '#6366f1' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardWrapper>

                    <CardWrapper title="Revenue Influx Trend" icon={<IndianRupee size={16} />}>
                        <ResponsiveContainer width="99%" height={350}>
                            <LineChart data={data?.trends || []}>
                                <XAxis dataKey="_id" tick={{ fontSize: 9, fontWeight: '800' }} axisLine={false} tickLine={false} tickFormatter={(v) => moment(v).format('DD MMM')} />
                                <YAxis hide domain={['auto', 'auto']} />
                                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 16 }} />
                                <Line type="stepAfter" dataKey="salesValue" stroke="#10b981" strokeWidth={4} dot={false} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardWrapper>

                    <CardWrapper title="Leaderboard: Sales Team" icon={<Award size={16} />}>
                        <ResponsiveContainer width="99%" height={350}>
                            <ReBarChart data={data?.salespersonPerformance || []} layout="vertical">
                                <YAxis dataKey="_id" type="category" tick={{ fontSize: 10, fontWeight: '800' }} width={90} axisLine={false} tickLine={false} />
                                <XAxis type="number" hide />
                                <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }} />
                                <Bar dataKey="salesValue" name="Gross Sales" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={14} />
                                <Bar dataKey="invoices" name="Invoice Count" fill="#10b981" radius={[0, 6, 6, 0]} barSize={14} />
                            </ReBarChart>
                        </ResponsiveContainer>
                    </CardWrapper>

                    <CardWrapper title="Inquiry Channel Distribution" icon={<PieChartIcon size={16} />}>
                        <ResponsiveContainer width="99%" height={300}>
                            <PieChart>
                                <Pie data={data?.sourceDistribution || []} dataKey="count" nameKey="_id" innerRadius={60} outerRadius={80} stroke="none" paddingAngle={5}>
                                    {(data?.sourceDistribution || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: 16 }} />
                                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 900, paddingTop: 20 }} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardWrapper>

                    <CardWrapper title="Lead Mortality Analysis (Lost)" icon={<AlertCircle size={16} />}>
                        <ResponsiveContainer width="99%" height={300}>
                            <ReBarChart data={data?.lostAnalysis || []}>
                                <XAxis dataKey="_id" tick={{ fontSize: 9, fontWeight: 800 }} axisLine={false} tickLine={false} />
                                <Bar dataKey="count" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={35} />
                                <Tooltip />
                            </ReBarChart>
                        </ResponsiveContainer>
                    </CardWrapper>

                    <CardWrapper title="Activity / Follow-up Health" icon={<BellRing size={16} />}>
                        <ResponsiveContainer width="99%" height={300}>
                            <ReBarChart data={data?.followupAnalysis || []}>
                                <XAxis dataKey="_id" tick={{ fontSize: 9, fontWeight: 800 }} axisLine={false} tickLine={false} />
                                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={30}>
                                    {(data?.followupAnalysis || []).map((entry, index) => (
                                        <Cell key={index} fill={entry._id === 'Overdue' ? '#f43f5e' : entry._id === 'Completed' ? '#10b981' : '#6366f1'} />
                                    ))}
                                </Bar>
                                <Tooltip />
                            </ReBarChart>
                        </ResponsiveContainer>
                    </CardWrapper>

                    <CardWrapper title="Product Portfolio Interest" icon={<Package size={16} />}>
                        <ResponsiveContainer width="99%" height={300}>
                            <PieChart>
                                <Pie data={data?.productIntent || []} dataKey="inquiries" nameKey="_id" innerRadius={60} outerRadius={80} stroke="none">
                                    {(data?.productIntent || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: 16 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardWrapper>
                </div>
            )}

            <div className={s.footerNotes}>
                 Intelligence Engine v4.0 &bull; Generated from Live CRM Records &bull; Confidential
            </div>
        </div>
    );
};
const KPICard = ({ title, value, icon, color, highlight, sub, animate, onClick }) => (
    <div className={`${s.kpiCard} ${highlight ? s.highlight : ''} ${animate ? s.alert : ''} ${onClick ? s.clickable : ''}`} onClick={onClick}>
        <div className={s.headerInner}>
            <div className={`${s.iconWrap} ${s[color]}`}>{icon}</div>
            <ArrowUpRight size={14} className={s.diagArrow} />
        </div>
        <div className={s.bodyInner}>
            <div className={s.metricLabel}>{title}</div>
            <div className={s.metricValue}>{value}</div>
            {sub && <div className={s.metricSub}>{sub}</div>}
        </div>
    </div>
);

const CardWrapper = ({ title, icon, children }) => (
    <div className={s.chartCard}>
        <div className={s.cardHeaderPremium}>
            <div className={s.cardTitlePremium}>
                <div className={s.titleIconBox}>{icon}</div>
                <h3>{title}</h3>
            </div>
        </div>
        <div className={s.cardBodyPremium}>{children}</div>
    </div>
);

export default SalesMarketingDashboard;
