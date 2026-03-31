import React, { useState, useEffect } from 'react';
import { getProjects, getPrdIssues, getPrdChangeLogs, getPrdApprovals } from '@/services/prdApi';
import { Layers, AlertTriangle, FileText, CheckCircle, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import styles from './PrdDashboard.module.scss';
import moment from 'moment';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const PrdDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    
    // Metrics
    const [stats, setStats] = useState({
        totalProjects: 0,
        activeProjects: 0,
        openIssues: 0,
        pendingApprovals: 0
    });

    const [issues, setIssues] = useState([]);
    const [projectsByCategory, setProjectsByCategory] = useState([]);
    const [issuesBySev, setIssuesBySev] = useState([]);
    const [recentActivies, setRecentActivities] = useState([]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [projs, isss, ecns, apps] = await Promise.all([
                    getProjects({}), 
                    getPrdIssues({}), 
                    getPrdChangeLogs({}), 
                    getPrdApprovals({})
                ]);

                // Basic Stats
                const activeProjs = projs.filter(p => !['Mass Production', 'Cancelled'].includes(p.status)).length;
                const openIss = isss.filter(i => ['Open', 'In Progress'].includes(i.status)).length;
                const pendApp = apps.filter(a => (a.finalStatus || 'Pending').includes('Pending')).length;

                setStats({
                    totalProjects: projs.length,
                    activeProjects: activeProjs,
                    openIssues: openIss,
                    pendingApprovals: pendApp
                });

                // Chart: Projects by Category
                const catMap = projs.reduce((acc, p) => {
                    acc[p.category] = (acc[p.category] || 0) + 1;
                    return acc;
                }, {});
                setProjectsByCategory(Object.keys(catMap).map(k => ({ name: k, value: catMap[k] })));

                // Chart: Issues by Severity (Open Only)
                const sevMap = isss.filter(i => ['Open', 'In Progress'].includes(i.status)).reduce((acc, i) => {
                    acc[i.severity] = (acc[i.severity] || 0) + 1;
                    return acc;
                }, {});
                setIssuesBySev(Object.keys(sevMap).map(k => ({ name: k, count: sevMap[k] })));

                setIssues(isss.slice(0, 5)); // Top 5 recent issues

                // Mocking a combined recent activity feed from top 3 of the latest drops
                const comb = [
                    ...projs.map(p => ({ date: p.createdAt, type: 'Project', title: p.productName, id: p._id, desc: `Created in ${p.category}` })),
                    ...isss.map(i => ({ date: i.date, type: 'Issue', title: i.title, id: i.projectId, desc: `Reported (${i.severity})` })),
                    ...ecns.map(e => ({ date: e.changeDate, type: 'ECN', title: e.changeType, id: e.projectId, desc: e.changeDone })),
                    ...apps.map(a => ({ date: a.date, type: 'Release', title: 'Approval Cycle Initiated', id: a.projectId, desc: `For Rev ${a.revisionNo}` }))
                ]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 6);

                setRecentActivities(comb);
            } catch (error) {
                console.error('Failed to load PRD dash:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    if (loading) return <div className={styles.loading}>Loading Dashboard Analytics...</div>;

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.header}>
                <div>
                    <h2>R&D PLM Analytics Dashboard</h2>
                    <p>High-level view of product development pipelines, open failures, and testing cadences.</p>
                </div>
            </div>

            <div className={styles.statGrid}>
                <div className={styles.statCard} onClick={() => navigate('/prd/projects')}>
                    <div className={styles.iconWrap} style={{ background: '#eff6ff', color: '#3b82f6' }}><Layers size={24}/></div>
                    <div className={styles.sData}>
                        <div className={styles.sVal}>{stats.totalProjects}</div>
                        <div className={styles.sLbl}>Total Projects Catalogued</div>
                    </div>
                </div>
                <div className={styles.statCard} onClick={() => navigate('/prd/projects')}>
                    <div className={styles.iconWrap} style={{ background: '#fdf4ff', color: '#d946ef' }}><Clock size={24}/></div>
                    <div className={styles.sData}>
                        <div className={styles.sVal}>{stats.activeProjects}</div>
                        <div className={styles.sLbl}>Active Developments</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.iconWrap} style={{ background: '#fee2e2', color: '#ef4444' }}><AlertTriangle size={24}/></div>
                    <div className={styles.sData}>
                        <div className={styles.sVal}>{stats.openIssues}</div>
                        <div className={styles.sLbl}>Unresolved Failures/Bugs</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.iconWrap} style={{ background: '#fefce8', color: '#eab308' }}><CheckCircle size={24}/></div>
                    <div className={styles.sData}>
                        <div className={styles.sVal}>{stats.pendingApprovals}</div>
                        <div className={styles.sLbl}>Pending Sign-offs</div>
                    </div>
                </div>
            </div>

            <div className={styles.mainGrid}>
                {/* Chart Area */}
                <div className={styles.chartSection}>
                    <div className={styles.chartPanel}>
                        <h4 className={styles.panelTitle}>Product Verticals Distribution</h4>
                        <div className={styles.chartBox}>
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie data={projectsByCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" nameKey="name" label>
                                        {projectsByCategory.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className={styles.chartPanel}>
                        <h4 className={styles.panelTitle}>Open Issue Severities</h4>
                        <div className={styles.chartBox}>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={issuesBySev} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Right Side Info Panels */}
                <div className={styles.sidePanels}>
                    <div className={styles.listPanel}>
                        <h4 className={styles.panelTitle}>Recent Failure Reports</h4>
                        {issues.length === 0 ? <p className={styles.mutedTxt}>No active issues to display.</p> : (
                            <div className={styles.issList}>
                                {issues.map((iss, idx) => (
                                    <div key={idx} className={styles.issRow} onClick={() => navigate(`/prd/projects/${iss.projectId}`)}>
                                        <div className={clsx(styles.barIndic, styles[`bar_${(iss.severity || 'Minor').toLowerCase()}`])}></div>
                                        <div className={styles.issLeft}>
                                            <div className={styles.ititle}>{iss.title}</div>
                                            <div className={styles.imeta}>{moment(iss.date).format('DD MMM')} • {iss.category}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={styles.listPanel}>
                        <h4 className={styles.panelTitle}>Lifecycle Activity Feed</h4>
                        <div className={styles.feedList}>
                            {recentActivies.map((act, idx) => (
                                <div key={idx} className={styles.feedRow}>
                                    <div className={clsx(styles.fDot, styles[`fDot_${act.type}`])}></div>
                                    <div className={styles.fLine}></div>
                                    <div className={styles.fContent} onClick={() => navigate(`/prd/projects/${act.id}`)}>
                                        <div className={styles.ftitle}><strong>{act.type}:</strong> {act.title}</div>
                                        <div className={styles.fdesc}>{act.desc}</div>
                                        <div className={styles.ftime}>{moment(act.date).fromNow()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrdDashboard;
