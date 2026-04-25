import React, { useState, useEffect } from 'react';
import { Button, Input, SearchableSelect } from '@/components/ui';
import { Printer, FileText, ArrowDownLeft, ArrowUpRight, Trash2, ArrowUpCircle, ArrowDownCircle, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getLedgers, getLedgerStatement, cancelVoucher } from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useFYDateRange } from '@/contexts/FinancialYearContext';
import FYBadge from '@/components/ui/FYBadge';
import s from './LedgerReportPage.module.scss';

const LedgerReportPage = ({ defaultType = null }) => {
    const navigate = useNavigate();
    const fyDateRange = useFYDateRange();
    const [ledgers, setLedgers] = useState([]);
    const [selectedLedgerId, setSelectedLedgerId] = useState('');
    const [filters, setFilters] = useState({
        startDate: fyDateRange.startDate,
        endDate: fyDateRange.endDate
    });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    // Auto-reset date filter whenever financial year changes
    useEffect(() => {
        setFilters({
            startDate: fyDateRange.startDate,
            endDate: fyDateRange.endDate,
        });
        setData(null);
    }, [fyDateRange.startDate, fyDateRange.endDate]);

    useEffect(() => {
        const fetchLedgers = async () => {
            try {
                const results = await getLedgers();
                setLedgers(results);
            } catch (error) {
                toast.error('Failed to fetch ledgers');
            }
        };
        fetchLedgers();
    }, []);

    const handleFetchStatement = async () => {
        if (!selectedLedgerId) return toast.error('Select a ledger first');
        setLoading(true);
        try {
            const result = await getLedgerStatement(selectedLedgerId, filters);
            setData(result);
        } catch (error) {
            toast.error('Failed to fetch statement');
        } finally {
            setLoading(false);
        }
    };

    const handleCancelVoucher = async (id, voucherNo) => {
        if (!id) return;
        if (!window.confirm(`Are you sure you want to delete transaction ${voucherNo}? This will reverse all ledger impacts.`)) return;
        
        try {
            await cancelVoucher(id);
            toast.success(`Transaction ${voucherNo} has been deleted successfully`);
            handleFetchStatement(); // Refresh the report to reflect changes
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete transaction');
        }
    };

    const handleEdit = (entry) => {
        const id = entry.voucherId;
        const nature = entry.voucherNature || '';
        
        let path = '';
        if (nature === 'Receipt') path = `/accounts/receipt-entry/edit/${id}`;
        else if (nature === 'Payment') path = `/accounts/payment-entry/edit/${id}`;
        else if (nature === 'Expense') path = `/accounts/expense-entry/edit/${id}`;
        else if (nature === 'Journal') path = `/accounts/journal-entry/edit/${id}`;
        
        if (path) navigate(path);
        else toast.error('Edit not supported for this entry type');
    };

    const cur = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    const filteredLedgers = ledgers.filter(l => {
        if (defaultType === 'Bank') return l.type === 'Bank' || l.isBank;
        if (defaultType === 'Cash') return l.type === 'Cash' || l.isCashLedger;
        return true;
    });

    return (
        <div className={s.pageContainer}>
            <div className={s.headerSection}>
                <div>
                    <h1 className={s.title}>
                        {defaultType === 'Cash' ? 'Cash Book' : defaultType === 'Bank' ? 'Bank Book' : 'Account Ledger Report'}
                    </h1>
                    <p className={s.subtitle}>Comprehensive transaction history and financial summary</p>
                </div>
                <div className="flex items-center gap-3">
                    <FYBadge />
                    {(defaultType === 'Bank' || defaultType === 'Cash') && (
                        <>
                            <Button 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 font-bold px-4 py-2"
                                onClick={() => navigate('/accounts/receipt-entry')}
                            >
                                <ArrowDownCircle size={16} /> Receive Payment
                            </Button>
                            <Button 
                                className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 font-bold px-4 py-2"
                                onClick={() => navigate('/accounts/payment-entry')}
                            >
                                <ArrowUpCircle size={16} /> Make Payment
                            </Button>
                        </>
                    )}
                    <Button variant="outline" className="flex items-center gap-2 font-bold " disabled={!data}>
                        <Printer className="w-4 h-4" /> Export
                    </Button>
                </div>
            </div>

            <div className={s.filterPanel}>
                <div className={s.filterGroup}>
                    <label>Account / Ledger</label>
                    <SearchableSelect
                        options={filteredLedgers.map(l => ({ label: l.name, value: l._id, type: l.type }))}
                        value={selectedLedgerId}
                        onChange={setSelectedLedgerId}
                        placeholder="Search accounts..."
                    />
                </div>
                <div className={s.filterGroup}>
                    <label>Period Range</label>
                    <div className={s.dateRange}>
                        <Input type="date" className={s.dateInput} value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
                        <span className="text-gray-300 font-bold">→</span>
                        <Input type="date" className={s.dateInput} value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
                    </div>
                </div>
                <Button onClick={handleFetchStatement} disabled={loading} className="w-full h-11 font-black text-sm uppercase tracking-wide">
                    {loading ? 'Fetching...' : 'View Statement'}
                </Button>
            </div>

            {data && (
                <div className="space-y-8">
                    <div className={s.summaryCards}>
                        <div className={`${s.card} ${s.opening}`}>
                            <p className={s.cardLabel}>Opening Balance</p>
                            <p className={s.cardValue}>₹{cur(data.openingBalance)}</p>
                        </div>
                        <div className={`${s.card} ${s.activity}`}>
                            <p className={s.cardLabel}>Period Activity</p>
                            <div className={s.activityMetrics}>
                                <div className={`${s.metric} ${s.debit}`}>
                                    <span>Debit (+)</span>
                                    <span>₹{cur(data.periodDebit)}</span>
                                </div>
                                <div className={`${s.metric} ${s.credit}`}>
                                    <span>Credit (-)</span>
                                    <span>₹{cur(data.periodCredit)}</span>
                                </div>
                            </div>
                        </div>
                        <div className={`${s.card} ${s.closing}`}>
                            <p className={s.cardLabel}>Closing Balance</p>
                            <p className={s.cardValue}>₹{cur(data.closingBalance)}</p>
                        </div>
                    </div>

                    <div className={s.tableContainer}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Voucher Details</th>
                                    <th className="text-center">Type</th>
                                    <th className="text-right">Debit (₹)</th>
                                    <th className="text-right">Credit (₹)</th>
                                    <th className="text-right">Balance (₹)</th>
                                    <th className="text-center">Manage</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className={s.broughtForward}>
                                    <td colSpan={3}>BALANCE BROUGHT FORWARD (OPENING)</td>
                                    <td className="text-right">--</td>
                                    <td className="text-right">--</td>
                                    <td className="text-right">
                                        <span className={s.amount}>₹{cur(data.openingBalance)}</span>
                                    </td>
                                    <td></td>
                                </tr>
                                {data.entries.map((entry, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="text-slate-500 font-bold tabular-nums">
                                            {new Date(entry.date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td>
                                            <div className={s.voucherInfo}>
                                                <div className="font-bold text-slate-800 tracking-wide mb-1 text-[13px]">
                                                    {entry.oppositeName || 'Various Accounts'}
                                                </div>
                                                <div className={s.voucherNo}>{entry.voucherNumber || entry.voucherNo}</div>
                                                <div className={s.narration}>{entry.narration || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            {entry.type === 'Debit' ?
                                                <ArrowUpRight className="w-5 h-5 text-emerald-500 mx-auto" /> :
                                                <ArrowDownLeft className="w-5 h-5 text-rose-500 mx-auto" />
                                            }
                                        </td>
                                        <td className="text-right font-black">
                                            {entry.type === 'Debit' ? 
                                                <span className={`${s.amount} ${s.debit}`}>₹{cur(entry.amount)}</span> : '--'}
                                        </td>
                                        <td className="text-right font-black">
                                            {entry.type === 'Credit' ? 
                                                <span className={`${s.amount} ${s.credit}`}>₹{cur(entry.amount)}</span> : '--'}
                                        </td>
                                        <td className="text-right">
                                            <span className={`${s.amount} ${s.neutral}`}>₹{cur(entry.runningBalance)}</span>
                                        </td>
                                        <td className="text-center">
                                            {entry.voucherId && entry.type !== 'Opening' && (
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors rounded-md"
                                                        onClick={() => handleEdit(entry)}
                                                        title="Edit Transaction"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-md"
                                                        onClick={() => handleCancelVoucher(entry.voucherId, entry.voucherNumber || entry.voucherNo)}
                                                        title="Delete Transaction"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                <tr className={s.closingRow}>
                                    <td colSpan={3} className="uppercase tracking-widest text-xs opacity-60">Closing Statement Balance</td>
                                    <td className="text-right text-emerald-700">₹{cur(data.periodDebit)}</td>
                                    <td className="text-right text-rose-700">₹{cur(data.periodCredit)}</td>
                                    <td className="text-right text-teal-600 text-xl font-black">₹{cur(data.closingBalance)}</td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!data && !loading && (
                <div className={s.emptyState}>
                    <div className={s.emptyIcon}>
                        <FileText className="w-10 h-10" />
                    </div>
                    <h3>Analyze Account Activity</h3>
                    <p>Select a ledger and a date range above to generate your detailed financial report.</p>
                </div>
            )}
        </div>
    );
};

export default LedgerReportPage;
