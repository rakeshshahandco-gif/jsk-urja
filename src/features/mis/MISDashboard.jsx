import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  ShieldCheck, 
  Scale, 
  Database, 
  ChevronRight, 
  FileText, 
  BarChart3, 
  PieChart, 
  ArrowUpRight 
} from 'lucide-react';
import accountApi from '@/services/accountApi';
import s from './MISReport.module.scss';
import moment from 'moment';

const MISDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        pnL: null,
        bs: null,
        tb: null,
        loading: true
    });

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [pnL, bs, tb] = await Promise.all([
                    accountApi.getProfitAndLoss(),
                    accountApi.getBalanceSheet(),
                    accountApi.getTrialBalance()
                ]);
                setStats({ pnL, bs, tb, loading: false });
            } catch (error) {
                console.error('Failed to load MIS stats', error);
                setStats(prev => ({ ...prev, loading: false }));
            }
        };
        fetchAllData();
    }, []);

    const formatAmount = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(Math.abs(amount || 0));
    };

    if (stats.loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Management Stats...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={s.pageContainer}>
            <div className={s.header}>
                <div className={s.titleSection}>
                    <h1>Management Reports (MIS)</h1>
                </div>
            </div>

            <div className="mb-10">
                <p className="text-slate-500 text-sm max-w-2xl mb-8">
                    Welcome to the Management Information System. This dashboard provides a high-level overview of your company's financial health, drawing real-time data from the general ledger.
                </p>
                
                <div className={s.mainGrid}>
                    {/* Card 1: Performance */}
                    <div className={s.topCard} onClick={() => navigate('/mis/reports/pl')}>
                        <div className={s.tag}>Performance</div>
                        <div className={s.contentWrapper}>
                            <div className={`${s.iconWrapper} ${s.bgGreen}`}><TrendingUp size={32} /></div>
                            <div className={s.details}>
                                <div className={s.cardTitle}>Profit & Loss</div>
                                <div className={s.metrics}>
                                    <div className={s.metric}>
                                        <span className={s.mLabel}>Net Profit</span>
                                        <span className={s.mValue}>{formatAmount(stats.pnL?.netProfit)}</span>
                                    </div>
                                    <div className={s.metric}>
                                        <span className={s.mLabel}>Margin</span>
                                        <span className={s.mValueGreen}>
                                            {(( (stats.pnL?.grossProfit || 0) / (stats.pnL?.tradingIncome || 1)) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={s.footer}>
                            View Performance <ArrowUpRight size={14} />
                        </div>
                    </div>

                    {/* Card 2: Solvency */}
                    <div className={s.topCard} onClick={() => navigate('/mis/reports/bs')}>
                        <div className={s.tag}>Solvency</div>
                        <div className={s.contentWrapper}>
                            <div className={`${s.iconWrapper} ${s.bgBlue}`}><Database size={32} /></div>
                            <div className={s.details}>
                                <div className={s.cardTitle}>Balance Sheet</div>
                                <div className={s.metrics}>
                                    <div className={s.metric}>
                                        <span className={s.mLabel}>Total Assets</span>
                                        <span className={s.mValue}>{formatAmount(stats.bs?.totalAssets)}</span>
                                    </div>
                                    <div className={s.metric}>
                                        <span className={s.mLabel}>Status</span>
                                        <span className={s.mValueBlue}>Healthy</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={s.footer}>
                            Check Solvency <ArrowUpRight size={14} />
                        </div>
                    </div>
                </div>

                {/* Card 3: Large Integrity Card */}
                <div className={s.largeCard} onClick={() => navigate('/mis/reports/tb')}>
                    <div className={s.tag}>Integrity</div>
                    <div className={s.contentWrapper}>
                        <div className={`${s.iconWrapper} ${s.bgPurple}`}>
                            {stats.tb?.isTallied ? <ShieldCheck size={36} /> : <Scale size={36} />}
                        </div>
                        <div className={s.details}>
                            <div className={s.cardTitle}>Trial Balance</div>
                            <div className={s.metrics}>
                                <div className={s.metric}>
                                    <span className={s.mLabel}>Reconciliation</span>
                                    <span className={stats.tb?.isTallied ? s.mValueGreen : s.mValueRed}>
                                        {stats.tb?.isTallied ? "Balanced" : "Unbalanced"}
                                    </span>
                                </div>
                                <div className={s.metric}>
                                    <span className={s.mLabel}>Total Postings</span>
                                    <span className={s.mValue}>{stats.tb?.ledgers.length} Ledgers</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={s.footer}>
                        Audit Books <ArrowUpRight size={14} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div className={s.statusCard}>
                        <div className={`${s.smallIcon} ${s.bgIndigo}`}><BarChart3 size={20} /></div>
                        <div>
                            <div className={s.sLabel}>Revenue Status</div>
                            <div className={s.sValue}>Consolidated View</div>
                        </div>
                     </div>
                     <div className={s.statusCard}>
                        <div className={`${s.smallIcon} ${s.bgAmber}`}><PieChart size={20} /></div>
                        <div>
                            <div className={s.sLabel}>Expense Ratio</div>
                            <div className={s.sValue}>Within Budget</div>
                        </div>
                     </div>
                     <div className={s.statusCard}>
                        <div className={`${s.smallIcon} ${s.bgSlate}`}><FileText size={20} /></div>
                        <div>
                            <div className={s.sLabel}>Auditor Access</div>
                            <div className={s.sValue}>Standard Role</div>
                        </div>
                     </div>
                </div>
            </div>
            
            <div className="text-center text-[10px] font-black opacity-20 uppercase tracking-[0.2em] mt-20">
                Management Information System &bull; Confidential
            </div>
        </div>
    );
};

export default MISDashboard;
