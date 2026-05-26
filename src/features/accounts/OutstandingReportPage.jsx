import { useState, useEffect, useMemo } from "react";
import { Search, Download, User, ArrowRight, TrendingUp, X } from "lucide-react";
import { BrandedLoader, Select } from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { getOutstandingSummary, getOutstandingBills, getAccountGroups, getLedgers } from "@/services/accountApi";
import { useFinancialYear } from "@/contexts/FinancialYearContext";
import { useCompany } from "@/contexts/CompanyContext";
import FYBadge from "@/components/ui/FYBadge";
import { toast } from "react-hot-toast";
import s from "./OutstandingReportPage.module.scss";

const DEFAULT_GROUP_BY_TYPE = {
    Receivable: 'Sundry Debtors',
    Payable: 'Sundry Creditors',
    Expense: 'Outstanding Expenses',
};

const groupOptionsForType = (groups, reportType) => {
    if (!groups?.length) return [];
    if (reportType === 'Receivable') {
        return groups.filter(g => /debtor|customer/i.test(g.name));
    }
    if (reportType === 'Payable') {
        return groups.filter(g => /creditor|supplier/i.test(g.name));
    }
    return groups.filter(g => g.nature === 'Expenses' || /expense/i.test(g.name));
};

const ledgerOptionsForType = (ledgers, reportType) => {
    if (!ledgers?.length) return [];
    if (reportType === 'Receivable') return ledgers.filter(l => l.type === 'Customer' || l.isCustomer);
    if (reportType === 'Payable') return ledgers.filter(l => l.type === 'Supplier' || l.isSupplier);
    return ledgers.filter(l => l.type === 'Expense');
};

const OutstandingReportPage = () => {
    const { selectedFY } = useFinancialYear();
    const { selectedCompany } = useCompany();
    const [reportType, setReportType] = useState('Receivable');
    const [viewMode, setViewMode] = useState('group');
    const [showAll, setShowAll] = useState(false);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [masters, setMasters] = useState({ groups: [], ledgers: [] });
    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedLedger, setSelectedLedger] = useState('');
    const [detailLedger, setDetailLedger] = useState(null);
    const [detailBills, setDetailBills] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const groupOptions = useMemo(
        () => groupOptionsForType(masters.groups, reportType).map(g => ({ label: g.name, value: g._id })),
        [masters.groups, reportType]
    );
    const ledgerOptions = useMemo(
        () => ledgerOptionsForType(masters.ledgers, reportType).map(l => ({ label: l.name, value: l._id, meta: l.groupName })),
        [masters.ledgers, reportType]
    );

    useEffect(() => {
        (async () => {
            try {
                const [groups, ledgers] = await Promise.all([getAccountGroups(), getLedgers()]);
                setMasters({ groups: groups || [], ledgers: ledgers || [] });
            } catch {
                toast.error('Failed to load account masters');
            }
        })();
    }, [selectedCompany?._id]);

    useEffect(() => {
        const defaultName = DEFAULT_GROUP_BY_TYPE[reportType];
        const match = masters.groups.find(g => g.name === defaultName)
            || groupOptionsForType(masters.groups, reportType)[0];
        setSelectedGroup(match?._id || '');
        setSelectedLedger('');
        setSearch('');
    }, [reportType, masters.groups]);

    const canFetch = viewMode === 'group' ? !!selectedGroup : !!selectedLedger;

    const fetchReport = async () => {
        if (!canFetch) {
            setData([]);
            return;
        }
        setLoading(true);
        try {
            const results = await getOutstandingSummary({
                type: reportType,
                showAll,
                viewMode,
                groupId: viewMode === 'group' ? selectedGroup : undefined,
                ledgerId: viewMode === 'ledger' ? selectedLedger : undefined,
                financialYear: selectedFY || undefined,
            });
            setData(results || []);
        } catch {
            toast.error('Failed to fetch outstanding report');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [reportType, showAll, viewMode, selectedGroup, selectedLedger, selectedFY, selectedCompany?._id]);

    const filteredData = data.filter(item => {
        const q = search.toLowerCase();
        return item.ledgerName?.toLowerCase().includes(q) || item.groupName?.toLowerCase().includes(q);
    });

    const openDetails = async (row) => {
        setDetailLedger(row);
        setDetailBills([]);
        setDetailLoading(true);
        try {
            setDetailBills(await getOutstandingBills(row.ledgerId, { financialYear: selectedFY || undefined }) || []);
        } catch {
            toast.error('Failed to load bill details');
        } finally {
            setDetailLoading(false);
        }
    };

    const totalOutstanding = filteredData.reduce((sum, item) => sum + (item.outstanding || 0), 0);
    const amountClass = reportType === 'Receivable' ? s.receivable : s.payable;

    return (
        <div className={s.pageContainer}>
            <div className={s.header}>
                <div className={s.titleSection}>
                    <h1>Outstanding Summary</h1>
                    <p className={s.scopeLine}>
                        Company: <strong>{selectedCompany?.companyName || '—'}</strong>
                        {' · '}
                        Financial Year: <strong>{selectedFY || '—'}</strong>
                    </p>
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
                <div className={s.headerActions}>
                    <FYBadge />
                    <button type="button" className="flex items-center gap-2 bg-slate-900 border-2 border-slate-900 hover:bg-white hover:text-slate-900 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
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
                    <div className={`${s.searchBar} ${s.filterRow}`}>
                        <div className={s.viewModeRow}>
                            <label className={viewMode === 'group' ? s.activeView : ''}>
                                <input type="radio" name="outViewMode" checked={viewMode === 'group'} onChange={() => setViewMode('group')} />
                                Group-wise
                            </label>
                            <label className={viewMode === 'ledger' ? s.activeView : ''}>
                                <input type="radio" name="outViewMode" checked={viewMode === 'ledger'} onChange={() => setViewMode('ledger')} />
                                Ledger-wise
                            </label>
                        </div>
                        {viewMode === 'group' ? (
                            <SearchableSelect options={groupOptions} value={selectedGroup} onChange={setSelectedGroup} placeholder="Select account group..." className="flex-1 min-w-[200px]" />
                        ) : (
                            <SearchableSelect options={ledgerOptions} value={selectedLedger} onChange={setSelectedLedger} placeholder="Select ledger / party..." className="flex-1 min-w-[200px]" />
                        )}
                    </div>
                    <div className={s.searchBar}>
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                placeholder="Filter by ledger or group name..."
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
                    </div>
                    <div className="overflow-auto max-h-[500px]">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th>Ledger / Party Name</th>
                                    <th>Group</th>
                                    <th>Ageing</th>
                                    <th className="text-right">Bill Count</th>
                                    <th className="text-right">Due Balance</th>
                                    <th className="text-center">View</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-20"><div className="flex justify-center"><BrandedLoader size={100} /></div></td></tr>
                                ) : !canFetch ? (
                                    <tr><td colSpan={6} className="text-center py-20 text-slate-400 font-bold uppercase text-xs tracking-widest">Select {viewMode === 'group' ? 'a group' : 'a ledger'} to view outstanding</td></tr>
                                ) : filteredData.map((item) => (
                                    <tr key={item.ledgerId}>
                                        <td>
                                            <div className={s.partyName}>
                                                <div className={s.icon}><User size={16} /></div>
                                                <span>{item.ledgerName}</span>
                                            </div>
                                        </td>
                                        <td><span className={s.groupTag}>{item.groupName || '—'}</span></td>
                                        <td><span className={s.groupTag}>{item.ageingBucket || '—'}</span></td>
                                        <td className="text-right">
                                            <span className={s.billBadge}>{item.billCount} BILLS OPEN</span>
                                        </td>
                                        <td className={`${s.amount} ${amountClass}`}>
                                            ₹{(item.outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="text-center">
                                            <button type="button" className="text-slate-300 hover:text-indigo-600 transition-colors" onClick={() => openDetails(item)} title="View bills">
                                                <ArrowRight size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!loading && canFetch && filteredData.length === 0 && (
                            <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest">No outstanding records found</div>
                        )}
                    </div>
                </div>
            </div>

            {detailLedger && (
                <div className={s.detailOverlay} onClick={() => setDetailLedger(null)}>
                    <div className={s.detailPanel} onClick={(e) => e.stopPropagation()}>
                        <div className={s.detailHeader}>
                            <div>
                                <h3>{detailLedger.ledgerName}</h3>
                                <p>{detailLedger.groupName}</p>
                            </div>
                            <button type="button" onClick={() => setDetailLedger(null)}><X size={20} /></button>
                        </div>
                        {detailLoading ? (
                            <div className="py-12 flex justify-center"><BrandedLoader size={60} /></div>
                        ) : (
                            <div className="overflow-auto max-h-[360px]">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th>Bill / Voucher</th>
                                            <th>Date</th>
                                            <th className="text-right">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detailBills.map((bill) => {
                                            const total = bill.grandTotal ?? bill.totalAmount ?? bill.roundedTotal ?? 0;
                                            const paid = bill.paidAmount ?? 0;
                                            return (
                                                <tr key={bill._id}>
                                                    <td>{bill.invoiceNumber || bill.voucherNo}</td>
                                                    <td>{new Date(bill.invoiceDate || bill.date).toLocaleDateString()}</td>
                                                    <td className="text-right font-mono">₹{Math.max(0, total - paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {!detailBills.length && <p className="py-10 text-center text-slate-400">No open bills for this ledger</p>}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default OutstandingReportPage;
