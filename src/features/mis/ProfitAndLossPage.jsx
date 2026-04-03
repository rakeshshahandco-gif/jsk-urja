import { useState, useEffect } from 'react';
import { Download, Printer, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Calendar, Database } from 'lucide-react';
import { toast } from 'react-hot-toast';
import accountApi from '@/services/accountApi';
import { Button } from '@/components/ui';
import s from './MISReport.module.scss';
import moment from 'moment';

const ProfitAndLossPage = () => {
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState({});
    const [dateRange, setDateRange] = useState({
        startDate: moment().startOf('year').format('YYYY-MM-DD'),
        endDate: moment().endOf('day').format('YYYY-MM-DD')
    });

    const fetchReport = async () => {
        setLoading(true);
        try {
            const data = await accountApi.getProfitAndLoss(dateRange);
            setReportData(data);
        } catch (error) {
            toast.error('Failed to load Profit & Loss report');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [dateRange]);

    const toggleGroup = (groupId) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const formatAmount = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(Math.abs(amount));
    };

    if (loading && !reportData) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
                <span className="font-black uppercase tracking-widest animate-pulse">Calculating Profit & Loss...</span>
            </div>
        );
    }

    return (
        <div className={s.pageContainer}>
            <div className={s.header}>
                <div className={s.titleSection}>
                    <h1>Profit & Loss Account</h1>
                </div>
                <div className={s.actions}>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer size={16} className="mr-2" /> Print
                    </Button>
                    <Button variant="primary" size="sm">
                        <Download size={16} className="mr-2" /> Export
                    </Button>
                </div>
            </div>

            <div className={s.filters}>
                <div className={s.filterGroup}>
                    <label>Period From</label>
                    <input 
                        type="date" 
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    />
                </div>
                <div className={s.filterGroup}>
                    <label>Period To</label>
                    <input 
                        type="date" 
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                </div>
                <Button onClick={fetchReport} className="mt-4">Update Report</Button>
            </div>

            <div className={s.reportGrid}>
                {/* Left Side: Particulars (Expenses) */}
                <div className={s.side}>
                    <div className={s.sideHeader}>
                        <h2>Expenses / Particulars</h2>
                        <span className={s.label}>DEBIT</span>
                    </div>
                    <div className={s.content}>
                        {reportData?.expenseGroups.map(group => (
                            <div key={group.groupId}>
                                <div className={s.groupRow} onClick={() => toggleGroup(group.groupId)}>
                                    <div className={s.groupName}>
                                        {expandedGroups[group.groupId] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {group.groupName}
                                    </div>
                                    <div className={s.amount}>{formatAmount(group.totalAbs)}</div>
                                </div>
                                {expandedGroups[group.groupId] && (
                                    <div className={s.ledgerList}>
                                        {group.ledgers.map(ledger => (
                                            <div key={ledger.ledgerId} className={s.ledgerRow}>
                                                <span className={s.ledgerName}>{ledger.name}</span>
                                                <span className={s.amount}>{formatAmount(ledger.closingBalance)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Side: Particulars (Incomes) */}
                <div className={s.side}>
                    <div className={s.sideHeader}>
                        <h2>Income / Particulars</h2>
                        <span className={s.label}>CREDIT</span>
                    </div>
                    <div className={s.content}>
                        {reportData?.incomeGroups.map(group => (
                            <div key={group.groupId}>
                                <div className={s.groupRow} onClick={() => toggleGroup(group.groupId)}>
                                    <div className={s.groupName}>
                                        {expandedGroups[group.groupId] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {group.groupName}
                                    </div>
                                    <div className={s.amount}>{formatAmount(group.totalAbs)}</div>
                                </div>
                                {expandedGroups[group.groupId] && (
                                    <div className={s.ledgerList}>
                                        {group.ledgers.map(ledger => (
                                            <div key={ledger.ledgerId} className={s.ledgerRow}>
                                                <span className={s.ledgerName}>{ledger.name}</span>
                                                <span className={s.amount}>{formatAmount(ledger.closingBalance)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Section for Gross Profit & Net Profit */}
                <div className="col-span-2 grid grid-cols-2">
                    <div className={reportData?.netProfit >= 0 ? s.profitRow : s.lossRow}>
                        <span className={s.label}>{reportData?.netProfit >= 0 ? 'Net Profit' : 'Net Loss'} (Transfer to B/S)</span>
                        <span className={s.value}>{formatAmount(reportData?.netProfit)}</span>
                    </div>
                    <div className={s.totalRow}>
                        <span className={s.label}>Total</span>
                        <span className={s.value}>{formatAmount(Math.max(reportData?.totalIncome, reportData?.totalExpense))}</span>
                    </div>
                </div>
            </div>

            <div className={s.summarySection}>
                <div className={s.statCard}>
                    <span className={s.label}>Gross Profit</span>
                    <div className={s.valueContent}>
                         <span className={s.value}>{formatAmount(reportData?.grossProfit)}</span>
                         <span className={reportData?.grossProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            {reportData?.grossProfit >= 0 ? <TrendingUp size={32} strokeWidth={3} /> : <TrendingDown size={32} strokeWidth={3} />}
                        </span>
                    </div>
                </div>
                <div className={`${s.statCard} ${s.primary}`}>
                    <span className={s.label}>Net Profit Margin %</span>
                    <div className={s.valueContent}>
                         <span className={s.value}>{( (reportData?.netProfit / (reportData?.tradingIncome || 1)) * 100).toFixed(2)}%</span>
                         <Database size={32} className="opacity-20" />
                    </div>
                </div>
            </div>
            <div className="mt-6 text-center text-[10px] font-black opacity-20 uppercase tracking-[0.2em]">
                Generated on {moment().format('DD-MMM-YYYY HH:mm:ss')}
            </div>
        </div>
    );
};

export default ProfitAndLossPage;
