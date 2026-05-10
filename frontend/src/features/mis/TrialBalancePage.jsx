import { useState, useEffect } from 'react';
import { useFYDateRange } from '@/contexts/FinancialYearContext';
import { Download, Printer, Search, ShieldCheck, Scale } from 'lucide-react';
import { toast } from 'react-hot-toast';
import accountApi from '@/services/accountApi';
import { Button } from '@/components/ui';
import s from './MISReport.module.scss';
import moment from 'moment';

const TrialBalancePage = () => {
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    // FY synchronization
    const { endDate } = useFYDateRange();
    const [reportDate, setReportDate] = useState(endDate);

    useEffect(() => {
        setReportDate(endDate);
    }, [endDate]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const data = await accountApi.getTrialBalance({ date: reportDate });
            setReportData(data);
        } catch (error) {
            toast.error('Failed to load Trial Balance');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [reportDate]);

    const formatAmount = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(Math.abs(amount));
    };

    const filteredLedgers = reportData?.ledgers.filter(l => 
        l.name.toLowerCase().includes(search.toLowerCase()) || 
        l.groupName.toLowerCase().includes(search.toLowerCase())
    ) || [];

    if (loading && !reportData) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
                <span className="font-black uppercase tracking-widest animate-pulse">Scanning Ledgers...</span>
            </div>
        );
    }

    return (
        <div className={s.pageContainer}>
            <div className={s.header}>
                <div className={s.titleSection}>
                    <h1>Trial Balance</h1>
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
                <div className={s.filterGroup} style={{ flex: 2 }}>
                    <label>Search Ledger / Group</label>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            placeholder="Filter by name..."
                            className="pl-10 w-full"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className={s.filterGroup}>
                    <label>As of Date</label>
                    <input 
                        type="date" 
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                    />
                </div>
                <Button onClick={fetchReport} className="mt-4">Refresh</Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className={s.trialTable}>
                    <thead>
                        <tr>
                            <th>Particulars / Ledger Name</th>
                            <th>Group</th>
                            <th className="text-right">Debit Balance</th>
                            <th className="text-right">Credit Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLedgers.map(ledger => (
                            <tr key={ledger.ledgerId}>
                                <td className={s.ledgerName}>{ledger.name}</td>
                                <td>
                                    <span className={s.groupTag}>{ledger.groupName}</span>
                                </td>
                                <td className={s.amount}>
                                    {ledger.closingBalance > 0 ? formatAmount(ledger.closingBalance) : '-'}
                                </td>
                                <td className={s.amount}>
                                    {ledger.closingBalance < 0 ? formatAmount(Math.abs(ledger.closingBalance)) : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-900 text-white font-black">
                        <tr>
                            <td colSpan={2} className="px-6 py-4 uppercase tracking-[0.2em] text-[10px]">Grand Total</td>
                            <td className="px-6 py-4 text-right font-mono text-lg">{formatAmount(reportData?.totalDebit)}</td>
                            <td className="px-6 py-4 text-right font-mono text-lg">{formatAmount(reportData?.totalCredit)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className={`${s.tallyAlert} ${reportData?.isTallied ? s.success : s.danger}`}>
                <div className={s.icon}>
                    {reportData?.isTallied ? <ShieldCheck size={32} /> : <Scale size={32} />}
                </div>
                <div className={s.text}>
                    <div className={s.title}>
                        {reportData?.isTallied ? 'Trial Balance Tallied' : 'Trial Balance Out of Balance'}
                    </div>
                    <div className={s.subtitle}>
                        {reportData?.isTallied 
                            ? 'All postings are mathematically accurate and reconciled.' 
                            : `Difference detected: ${formatAmount(reportData?.diff)}. Please check for unposted or unequal entries.`
                        }
                    </div>
                </div>
                <div className="text-[10px] font-black opacity-40 uppercase tracking-widest">
                    Generated: {moment().format('DD-MMM-YYYY HH:mm')}
                </div>
            </div>
        </div>
    );
};

export default TrialBalancePage;
