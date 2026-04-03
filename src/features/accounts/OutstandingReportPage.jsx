import { useState, useEffect } from "react";
import { Search, Download, User, ArrowRight, TrendingUp } from "lucide-react";
import { getOutstandingSummary } from "@/services/accountApi";
import { toast } from "react-hot-toast";
import { Select } from "@/components/ui";
import s from "./OutstandingReportPage.module.scss";

const OutstandingReportPage = () => {
    const [reportType, setReportType] = useState('Receivable'); // Receivable (Customers) or Payable (Suppliers)
    const [showAll, setShowAll] = useState(false);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const fetchReport = async () => {
        setLoading(true);
        try {
            const results = await getOutstandingSummary(reportType, showAll);
            setData(results);
        } catch (error) {
            toast.error('Failed to fetch outstanding report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [reportType, showAll]);

    const filteredData = data.filter(item =>
        item.ledgerName.toLowerCase().includes(search.toLowerCase())
    );

    const totalOutstanding = filteredData.reduce((sum, item) => sum + item.outstanding, 0);

    return (
        <div className={s.pageContainer}>
            <div className={s.header}>
                <div className={s.titleSection}>
                    <h1>Outstanding Summary</h1>
                    <div className={s.typeSwitcher}>
                        <button
                            onClick={() => setReportType('Receivable')}
                            className={`${s.receivable} ${reportType === 'Receivable' ? s.active : ''}`}
                        >
                            Receivables
                        </button>
                        <button
                            onClick={() => setReportType('Payable')}
                            className={`${s.payable} ${reportType === 'Payable' ? s.active : ''}`}
                        >
                            Payables
                        </button>
                        <button
                            onClick={() => setReportType('Expense')}
                            className={`${s.payable} ${reportType === 'Expense' ? s.active : ''}`}
                        >
                            Expenses
                        </button>
                    </div>
                </div>
                <div className="flex gap-4">
                   <button className="flex items-center gap-2 bg-slate-900 border-2 border-slate-900 hover:bg-white hover:text-slate-900 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
                       <Download size={14} /> Export Report
                   </button>
                </div>
            </div>

            <div className={s.contentGrid}>
                <div className={s.summaryCard}>
                    <div className={`${s.iconContainer} ${reportType === 'Receivable' ? s.receivable : s.payable}`}>
                        <TrendingUp size={32} />
                    </div>
                    <span className={s.label}>Total {reportType === 'Receivable' ? 'Receivable' : reportType === 'Payable' ? 'Payable' : 'Outstanding Expense'} Amount</span>
                    <span className={`${s.value} ${reportType === 'Receivable' ? s.receivable : s.payable}`}>
                        ₹{totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className={s.count}>ACTIVE ON {filteredData.length} ACCOUNTS</div>
                </div>

                <div className={s.tableContainer}>
                    <div className={s.searchBar}>
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                placeholder="Filter by ledger name..."
                                className="w-full bg-white border border-slate-200 pl-11 pr-4 py-2.5 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-colors"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <Select
                            value={showAll ? 'all' : 'outstanding'}
                            onChange={(val) => setShowAll(val === 'all')}
                            options={[
                                { label: 'Outstanding Only', value: 'outstanding' },
                                { label: 'All Accounts', value: 'all' }
                            ]}
                            className="w-48 font-bold text-[10px] tracking-wider uppercase"
                        />
                        <Select
                            options={[
                                { label: 'All Ageing Slabs', value: 'all' },
                                { label: 'Due > 30 Days', value: '30' },
                                { label: 'Due > 60 Days', value: '60' },
                                { label: 'Due > 90 Days', value: '90' }
                            ]}
                            className="w-48 font-bold text-[10px] tracking-wider uppercase"
                        />
                    </div>
                    <div className="overflow-auto max-h-[500px]">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th>Ledger / Party Name</th>
                                    <th className="text-right">Bill Count</th>
                                    <th className="text-right">Due Balance</th>
                                    <th className="text-center">View</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={4} className="text-center py-20 text-slate-300 font-black uppercase tracking-widest animate-pulse">Analyzing Ledgers...</td></tr>
                                ) : filteredData.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div className={s.partyName}>
                                                <div className={s.icon}><User size={16} /></div>
                                                <span>{item.ledgerName}</span>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <span className={s.billBadge}>{item.billCount} BILLS OPEN</span>
                                        </td>
                                        <td className={`${s.amount} ${reportType === 'Receivable' ? s.receivable : s.payable}`}>
                                            ₹{item.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="text-center">
                                            <button className="text-slate-300 hover:text-indigo-600 transition-colors"><ArrowRight size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!loading && filteredData.length === 0 && (
                            <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest">No outstanding records found</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OutstandingReportPage;
