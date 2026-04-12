import { useState, useEffect, useMemo } from 'react';
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
  BarChart3
} from 'lucide-react';
import { 
  FunnelChart, 
  Funnel, 
  LabelList, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import analyticsApi from '@/services/analyticsApi';
import * as userApi from '@/services/userApi';
import s from './SalesMarketingDashboard.module.scss';
import moment from 'moment';

const SalesMarketingDashboard = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [leads, setLeads] = useState([]);
    const [users, setUsers] = useState([]);
    const [filters, setFilters] = useState({
        fromDate: moment().startOf('month').format('YYYY-MM-DD'),
        toDate: moment().endOf('month').format('YYYY-MM-DD'),
        salesperson: '',
        source: '',
        product: ''
    });

    const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4'];

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [analytics, userList, leadList] = await Promise.all([
                    analyticsApi.getSalesMarketingDashboard(filters),
                    userApi.getUsers({ role: 'sales' }),
                    analyticsApi.getLeadReport({ ...filters, limit: 10 })
                ]);
                setData(analytics);
                setUsers(userList?.users || []);
                setLeads(leadList?.results || []);
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
        } catch (error) {
            console.error('Export failed', error);
        }
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(val || 0);
    };

    const funnelData = useMemo(() => {
        if (!data?.summary) return [];
        const sum = data.summary;
        return [
            { value: sum.totalLeads, name: 'Lead Generated', fill: '#6366f1' },
            { value: sum.contactedLeads, name: 'Contacted', fill: '#8b5cf6' },
            { value: sum.qualifiedLeads, name: 'Qualified', fill: '#ec4899' },
            { value: sum.samplesIssued, name: 'Sample Issued', fill: '#f43f5e' },
            { value: sum.ordersReceived, name: 'Order Received', fill: '#f59e0b' },
            { value: sum.convertedLeads, name: 'Invoice Done', fill: '#10b981' },
        ].filter(d => d.value > 0);
    }, [data]);

    if (loading && !data) {
        return (
            <div className={s.loader}>
                <div className={s.spinner}></div>
                <span>Synthesizing Business Intelligence...</span>
            </div>
        );
    }

    const s_data = data?.summary || {};

    return (
        <div className={s.dashboardContainer}>
            {/* Header Section */}
            <div className={s.headerRow}>
                <div className={s.titleSection}>
                    <h1>Sales & Marketing MIS</h1>
                    <p>Tracking the complete business funnel from Lead to Cash</p>
                </div>

                <div className={s.actionSection}>
                    <div className={s.filterBar}>
                        <Calendar size={14} style={{ color: '#94a3b8', marginRight: '8px' }} />
                        <input 
                            type="date" 
                            value={filters.fromDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                        />
                        <span className={s.separator}>to</span>
                        <input 
                            type="date" 
                            value={filters.toDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                        />
                    </div>

                    <div className={s.filterBar}>
                        <Users size={14} style={{ color: '#94a3b8', marginRight: '8px' }} />
                        <select 
                            value={filters.salesperson}
                            onChange={(e) => setFilters(prev => ({ ...prev, salesperson: e.target.value }))}
                        >
                            <option value="">All Salespeople</option>
                            {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                        </select>
                    </div>

                    <button onClick={handleExport} className={s.exportButton}>
                        <Download size={16} /> Export Reports
                    </button>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className={s.kpiGrid}>
                <MiniKPICard title="Total Leads" value={s_data.totalLeads} icon={<Users size={16} />} color="blue" />
                <MiniKPICard title="Contacted" value={s_data.contactedLeads} icon={<TrendingUp size={16} />} color="purple" />
                <MiniKPICard title="Qualified" value={s_data.qualifiedLeads} icon={<Target size={16} />} color="pink" />
                <MiniKPICard title="Samples" value={s_data.samplesIssued} icon={<Package size={16} />} color="amber" />
                <MiniKPICard title="Orders" value={s_data.ordersReceived} icon={<ShoppingCart size={16} />} color="orange" />
                <MiniKPICard title="Invoices" value={s_data.invoicesGenerated} icon={<FileText size={16} />} color="emerald" />
                
                <MiniKPICard title="Sales Value" value={formatCurrency(s_data.totalSalesValue)} icon={<IndianRupee size={16} />} color="indigo" highlight />
                <MiniKPICard title="Lead-to-Cash" value={`${s_data.avgLeadToOrderDays || 0} D`} icon={<Clock size={16} />} color="cyan" />
                <MiniKPICard title="Conv. Rate" value={`${((s_data.convertedLeads / (s_data.totalLeads || 1)) * 100).toFixed(1)}%`} icon={<Zap size={16} />} color="rose" />
                <MiniKPICard title="Sample-to-SO" value={`${((s_data.convertedLeads / (s_data.samplesIssued || 1)) * 100).toFixed(1)}%`} icon={<BarChart3 size={16} />} color="violet" />
                <MiniKPICard title="Lost Leads" value={s_data.lostLeads} icon={<AlertCircle size={16} />} color="slate" />
                <MiniKPICard title="Overdue" value={s_data.overdueFollowups} icon={<BellRing size={16} />} color="red" animate={s_data.overdueFollowups > 0} />
            </div>

            {/* Main Charts Row */}
            <div className={s.chartRow}>
                <div className={s.funnelColumn}>
                    <div className={s.chartCard}>
                        <div className={s.cardHeader}>
                            <div className={s.titleWrap}>
                                <h3>Conversion Funnel</h3>
                            </div>
                            <div className={`${s.iconBox} ${s.indigo}`}><Target size={16} /></div>
                        </div>
                        <div className={s.chartWrapper}>
                            <ResponsiveContainer width="100%" height="100%">
                                <FunnelChart>
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value) => [value, 'Count']}
                                    />
                                    <Funnel dataKey="value" data={funnelData} isAnimationActive>
                                        <LabelList position="right" fill="#64748b" stroke="none" dataKey="name" fontSize={10} fontWeight="900" />
                                    </Funnel>
                                </FunnelChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className={s.trendColumn}>
                    <div className={s.chartCard}>
                        <div className={s.cardHeader}>
                            <div className={s.titleWrap}>
                                <h3>Inquiry Generation Trend</h3>
                            </div>
                            <div className={`${s.iconBox} ${s.emerald}`}><TrendingUp size={16} /></div>
                        </div>
                        <div className={s.chartWrapper}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data?.trend || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="_id" 
                                        tick={{ fontSize: 9, fontWeight: '800', fill: '#94a3b8' }} 
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(val) => moment(val).format('DD MMM')}
                                    />
                                    <YAxis tick={{ fontSize: 9, fontWeight: '800', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                                    <Line type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={4} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Distribution Charts */}
            <div className={s.distributionRow}>
                <div className={s.chartCard}>
                    <div className={s.cardHeader}>
                        <div className={s.titleWrap}>
                            <h3>Source performance</h3>
                        </div>
                        <div className={`${s.iconBox}`}><PieChartIcon size={16} /></div>
                    </div>
                    <div className={s.chartWrapper} style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.sourceWise || []} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="_id" type="category" tick={{ fontSize: 9, fontWeight: '800', fill: '#475569' }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="leads" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={12} />
                                <Bar dataKey="converted" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className={s.chartCard}>
                    <div className={s.cardHeader}>
                        <div className={s.titleWrap}>
                            <h3>Product Intent Share</h3>
                        </div>
                        <div className={`${s.iconBox}`}><Package size={16} /></div>
                    </div>
                    <div className={s.chartWrapper} style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={data?.productIntent || []} 
                                    dataKey="inquiries" 
                                    nameKey="_id" 
                                    innerRadius={50} 
                                    outerRadius={70} 
                                    paddingAngle={5}
                                    stroke="none"
                                >
                                    {(data?.productIntent || []).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '800', paddingTop: '20px' }} />
                                <Pie />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className={s.chartCard}>
                    <div className={s.cardHeader}>
                        <div className={s.titleWrap}>
                            <h3>Lost Lead Analysis</h3>
                        </div>
                        <div className={`${s.iconBox}`}><AlertCircle size={16} /></div>
                    </div>
                    <div className={s.chartWrapper} style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.lostAnalysis || []}>
                                <XAxis dataKey="_id" tick={{ fontSize: 9, fontWeight: '800', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis hide />
                                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Salesperson Leaderboard */}
            <div className={s.leaderboardCard}>
                <div className={s.header}>
                    <div className={s.titleSection}>
                        <h4>Performance Matrix</h4>
                        <h2>Salesperson Leaderboard</h2>
                    </div>
                    <div className={s.iconBadge}><Award size={22} /></div>
                </div>

                <div className={s.grid}>
                    {(data?.salespersonWise || []).map((sp, idx) => (
                        <div key={idx} className={s.spCard}>
                            <div className={s.topArea}>
                                <div className={s.avatar}>{sp.name?.charAt(0) || 'U'}</div>
                                <div className={s.info}>
                                    <div className={s.name}>{sp.name}</div>
                                    <div className={s.rank}>Performance Tier</div>
                                </div>
                                {idx === 0 && <Award size={18} className={s.award} fill="currentColor" />}
                            </div>
                            
                            <div className={s.statsGrid}>
                                <div className={s.statItem}>
                                    <div className={s.sLabel}>Sales Value</div>
                                    <div className={s.sValue}>{formatCurrency(sp.salesValue)}</div>
                                </div>
                                <div className={s.statItem}>
                                    <div className={s.sLabel}>Conversion</div>
                                    <div className={`${s.sValue} ${s.highlight}`}>
                                        {((sp.conversions / (sp.leads || 1)) * 100).toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            <div className={s.footer}>
                                <div className={s.smallStat}><span>{sp.leads}</span> Leads</div>
                                <div className={s.smallStat}><span>{sp.samples}</span> Samples</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Lead Drill-down Table */}
            <div className={s.tableContainer}>
                <div className={s.tableHeader}>
                    <h3>Lead Drill-down</h3>
                    <h2>Direct Segment Intelligence</h2>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Lead Name</th>
                                <th>Source</th>
                                <th>Stage</th>
                                <th>Salesperson</th>
                                <th style={{ textAlign: 'right' }}>Inquiry Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.map((lead, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <div className={s.mainText}>{lead.customerName}</div>
                                        <div className={s.subText}>{lead.company || 'Private Inquiry'}</div>
                                    </td>
                                    <td>
                                        <span className={`${s.badge} ${s.source}`}>
                                            {lead.leadSource || 'Direct'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${s.badge} ${s.stage}`}>
                                            {lead.leadStage}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>
                                        {lead.assignedSalesperson?.name || 'Unassigned'}
                                    </td>
                                    <td className={`${s.right} ${s.bold}`}>
                                        {moment(lead.leadDate).format('DD MMM YYYY')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const MiniKPICard = ({ title, value, icon, color, highlight = false, subText = 'Overall Performance', animate = false }) => {
    return (
        <div className={`${s.kpiCard} ${highlight ? s.highlight : ''} ${animate ? s.alert : ''}`}>
            <div className={s.cardHeader}>
                <div className={`${s.iconWrapper} ${s[color]}`}>
                    {icon}
                </div>
                <ArrowUpRight size={14} className={s.trendIcon} />
            </div>
            <div className={s.cardBody}>
                <div className={s.label}>{title}</div>
                <div className={s.value}>{value}</div>
                <div className={s.subText}>
                    <Clock size={10} /> {subText}
                </div>
            </div>
        </div>
    );
};

export default SalesMarketingDashboard;
