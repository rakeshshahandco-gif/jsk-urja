import { useState, useEffect } from 'react';
import { useFYDateRange } from '@/contexts/FinancialYearContext';
import { Download, Printer, ChevronRight, ChevronDown, Landmark, ShieldCheck, Scale, Database } from 'lucide-react';
import { toast } from 'react-hot-toast';
import accountApi from '@/services/accountApi';
import { Button } from '@/components/ui';
import s from './MISReport.module.scss';
import moment from 'moment';

const BalanceSheetPage = () => {
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState({});
    const [hideZeroBalances, setHideZeroBalances] = useState(true);
    
    // FY synchronization
    const { endDate } = useFYDateRange();
    const [reportDate, setReportDate] = useState(endDate);

    useEffect(() => {
        setReportDate(endDate);
    }, [endDate]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const data = await accountApi.getBalanceSheet({ date: reportDate });
            setReportData(data);
        } catch (error) {
            toast.error('Failed to load Balance Sheet');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [reportDate]);

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
                <span className="font-black uppercase tracking-widest animate-pulse">Reconciling Balance Sheet...</span>
            </div>
        );
    }

    return (
        <div className={s.pageContainer}>
            <div className={s.header}>
                <div className={s.titleSection}>
                    <h1>Balance Sheet</h1>
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
                    <label>As of Date</label>
                    <input 
                        type="date" 
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 mt-4 text-sm font-semibold text-slate-700 select-none cursor-pointer" onClick={() => setHideZeroBalances(!hideZeroBalances)}>
                    <input type="checkbox" checked={hideZeroBalances} readOnly className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
                    <span>Hide Zero Balances</span>
                </div>
                <Button onClick={fetchReport} className="mt-4">Apply Filters</Button>
            </div>

            <div className={s.reportGrid}>
                {/* Left Side: Liabilities */}
                <div className={s.side}>
                    <div className={s.sideHeader}>
                        <h2>Liabilities / Capital</h2>
                        <span className={s.label}>CREDIT BALANCE</span>
                    </div>
                    <div className={s.content}>
                        {reportData?.liabilityGroups
                            .filter(group => {
                                if (!hideZeroBalances) return true;
                                const hasNonZeroLedgers = group.ledgers.some(l => Math.abs(l.closingBalance) > 0.001);
                                return Math.abs(group.total) > 0.001 || hasNonZeroLedgers;
                            })
                            .map(group => {
                                const visibleLedgers = hideZeroBalances 
                                    ? group.ledgers.filter(l => Math.abs(l.closingBalance) > 0.001)
                                    : group.ledgers;
                                    
                                return (
                                    <div key={group.groupId}>
                                        <div className={s.groupRow} onClick={() => toggleGroup(group.groupId)}>
                                            <div className={s.groupName}>
                                                {expandedGroups[group.groupId] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                {group.groupName}
                                            </div>
                                            <div className={s.amount}>{formatAmount(group.totalAbs)}</div>
                                        </div>
                                        {expandedGroups[group.groupId] && visibleLedgers.length > 0 && (
                                            <div className={s.ledgerList}>
                                                {visibleLedgers.map(ledger => (
                                                    <div key={ledger.ledgerId} className={s.ledgerRow}>
                                                        <span className={s.ledgerName}>{ledger.name}</span>
                                                        <span className={s.amount}>{formatAmount(ledger.closingBalance)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                        {/* Current Period Profit/Loss */}
                        <div className={s.groupRow}>
                            <div className={s.groupName}>
                                <ShieldCheck size={14} className="text-emerald-500" />
                                Current Period Profit (P&L Account)
                            </div>
                            <div className={s.amount}>{formatAmount(reportData?.currentYearProfit)}</div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Assets */}
                <div className={s.side}>
                    <div className={s.sideHeader}>
                        <h2>Assets / Property</h2>
                        <span className={s.label}>DEBIT BALANCE</span>
                    </div>
                    <div className={s.content}>
                        {reportData?.assetGroups
                            .filter(group => {
                                if (!hideZeroBalances) return true;
                                const hasNonZeroLedgers = group.ledgers.some(l => Math.abs(l.closingBalance) > 0.001);
                                return Math.abs(group.total) > 0.001 || hasNonZeroLedgers;
                            })
                            .map(group => {
                                const visibleLedgers = hideZeroBalances 
                                    ? group.ledgers.filter(l => Math.abs(l.closingBalance) > 0.001)
                                    : group.ledgers;
                                    
                                return (
                                    <div key={group.groupId}>
                                        <div className={s.groupRow} onClick={() => toggleGroup(group.groupId)}>
                                            <div className={s.groupName}>
                                                {expandedGroups[group.groupId] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                {group.groupName}
                                            </div>
                                            <div className={s.amount}>{formatAmount(group.totalAbs)}</div>
                                        </div>
                                        {expandedGroups[group.groupId] && visibleLedgers.length > 0 && (
                                            <div className={s.ledgerList}>
                                                {visibleLedgers.map(ledger => (
                                                    <div key={ledger.ledgerId} className={s.ledgerRow}>
                                                        <span className={s.ledgerName}>{ledger.name}</span>
                                                        <span className={s.amount}>{formatAmount(ledger.closingBalance)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {/* Totals */}
                <div className="col-span-2 grid grid-cols-2">
                    <div className={s.totalRow}>
                        <span className={s.label}>Total Liabilities</span>
                        <span className={s.value}>{formatAmount(reportData?.totalLiabilities)}</span>
                    </div>
                    <div className={s.totalRow}>
                        <span className={s.label}>Total Assets</span>
                        <span className={s.value}>{formatAmount(reportData?.totalAssets)}</span>
                    </div>
                </div>
            </div>

            <div className={s.summarySection}>
                <div className={s.statCard}>
                    <span className={s.label}>Balance Sheet Reconciliation</span>
                    <div className={s.valueContent}>
                        <div className="flex items-center gap-3">
                            {reportData?.isTallied ? (
                                <ShieldCheck size={32} className="text-emerald-500" />
                            ) : (
                                <Scale size={32} className="text-rose-500" />
                            )}
                            <div>
                                <div className={`text-[10px] font-black uppercase tracking-widest ${reportData?.isTallied ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {reportData?.isTallied ? 'RECONCILED' : 'OUT OF BALANCE'}
                                </div>
                                <div className="text-xs font-bold text-slate-400">
                                    {reportData?.isTallied ? 'Perfectly Balanced' : `Diff: ${formatAmount(reportData?.diff)}`}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={`${s.statCard} ${s.primary}`}>
                    <span className={s.label}>Net Fixed Assets</span>
                    <div className={s.valueContent}>
                         <span className={s.value}>{formatAmount(reportData?.assetGroups.find(g => g.groupName === 'Fixed Assets')?.total || 0)}</span>
                         <Landmark size={32} className="opacity-20" />
                    </div>
                </div>
            </div>
            <div className="mt-8 text-center text-[10px] font-black opacity-20 uppercase tracking-[0.2em]">
                Verified and Reconciled on {moment().format('DD-MMM-YYYY HH:mm:ss')}
            </div>
        </div>
    );
};

export default BalanceSheetPage;
