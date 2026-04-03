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
                
                <div className={s.dashboardGrid}>
                    {/* Card 1: Profitability */}
                    <div className={`${s.misCard} ${s.green}`} onClick={() => navigate('/mis/reports/pl')}>
                        <div className={s.cardHeader}>
                            <div className={s.iconBox}><TrendingUp size={28} /></div>
                            <div className="text-right">
                                <div className={s.title}>Performance</div>
                                <div className={s.name}>Profit & Loss</div>
                            </div>
                        </div>
                        <div className={s.stats}>
                            <div className={s.statItem}>
                                <span className={s.label}>Net Profit</span>
                                <span className={s.value}>{formatAmount(stats.pnL?.netProfit)}</span>
                            </div>
                            <div className={s.statItem}>
                                <span className={s.label}>Gross Margin</span>
                                <span className="text-emerald-600 font-bold text-xs">
                                     {(( (stats.pnL?.grossProfit || 0) / (stats.pnL?.tradingIncome || 1)) * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                        <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                             View Details <ArrowUpRight size={14} />
                        </div>
                    </div>

                    {/* Card 2: Financial Position */}
                    <div className={`${s.misCard} ${s.blue}`} onClick={() => navigate('/mis/reports/bs')}>
                        <div className={s.cardHeader}>
                            <div className={s.iconBox}><Database size={28} /></div>
                            <div className="text-right">
                                <div className={s.title}>Solvency</div>
                                <div className={s.name}>Balance Sheet</div>
                            </div>
                        </div>
                        <div className={s.stats}>
                            <div className={s.statItem}>
                                <span className={s.label}>Total Assets</span>
                                <span className={s.value}>{formatAmount(stats.bs?.totalAssets)}</span>
                            </div>
                            <div className={s.statItem}>
                                <span className={s.label}>Working Capital</span>
                                <span className="text-blue-600 font-bold text-xs">
                                    Healthy Position
                                </span>
                            </div>
                        </div>
                        <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                             Check Solvency <ArrowUpRight size={14} />
                        </div>
                    </div>

                    {/* Card 3: Data Integrity */}
                    <div className={`${s.misCard} ${s.purple}`} onClick={() => navigate('/mis/reports/tb')}>
                        <div className={s.cardHeader}>
                            <div className={s.iconBox}>
                                {stats.tb?.isTallied ? <ShieldCheck size={28} /> : <Scale size={28} />}
                            </div>
                            <div className="text-right">
                                <div className={s.title}>Integrity</div>
                                <div className={s.name}>Trial Balance</div>
                            </div>
                        </div>
                        <div className={s.stats}>
                            <div className={s.statItem}>
                                <span className={s.label}>Reconciliation</span>
                                <span className={stats.tb?.isTallied ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                                    {stats.tb?.isTallied ? "Balanced" : "Unbalanced"}
                                </span>
                            </div>
                            <div className={s.statItem}>
                                <span className={s.label}>Total Postings</span>
                                <span className={s.value}>{stats.tb?.ledgers.length} Ledgers</span>
                            </div>
                        </div>
                        <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                             Audit Books <ArrowUpRight size={14} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                     <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="bg-indigo-50 text-indigo-500 p-3 rounded-xl"><BarChart3 size={20} /></div>
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revenue Status</div>
                            <div className="text-sm font-bold">Consolidated View</div>
                        </div>
                     </div>
                     <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="bg-amber-50 text-amber-500 p-3 rounded-xl"><PieChart size={20} /></div>
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expense Ratio</div>
                            <div className="text-sm font-bold">Within Budget</div>
                        </div>
                     </div>
                     <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="bg-slate-50 text-slate-500 p-3 rounded-xl"><FileText size={20} /></div>
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auditor Access</div>
                            <div className="text-sm font-bold">Standard Role</div>
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
