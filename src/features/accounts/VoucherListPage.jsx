import { useState, useEffect } from "react";
import {
    Button, Select, useModal
} from "@/components/ui";
import { Search, Calendar, XCircle, Eye, Printer, Receipt, CreditCard, Wallet, Landmark, Info, Tag, Layers } from "lucide-react";
import { getVouchers, cancelVoucher } from "@/services/accountApi";
import { toast } from "react-hot-toast";
import { useFYDateRange } from "@/contexts/FinancialYearContext";
import FYBadge from "@/components/ui/FYBadge";
import s from "./VoucherListPage.module.scss";

const VoucherDetail = ({ voucher }) => {
    if (!voucher) return null;

    const isGst = voucher.isGstEnabled;
    const isCredit = voucher.expenseType === 'Credit';

    return (
        <div className="p-2 select-none">
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-100">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        {voucher.voucherNo}
                        {voucher.status === 'Cancelled' && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full uppercase">Cancelled</span>}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {voucher.nature} Voucher • {new Date(voucher.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Total Value</span>
                    <span className="text-2xl font-black text-indigo-600">₹{(voucher.grandTotal || voucher.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-2 tracking-widest">Primary Account</span>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-200">
                            {voucher.expenseType === 'Cash' || voucher.expenseType === 'Petty Cash' ? <Wallet size={18} className="text-rose-500" /> : 
                             voucher.expenseType === 'Bank' ? <Landmark size={18} className="text-blue-500" /> : 
                             <CreditCard size={18} className="text-purple-500" />}
                        </div>
                        <div>
                            <p className="text-sm font-black text-slate-800">{voucher.cashBankAccountName || voucher.partyName || '—'}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">{voucher.expenseType || 'Primary'} Mode</p>
                        </div>
                    </div>
                </div>
                {isCredit && (
                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                        <span className="text-[9px] font-black text-indigo-400 uppercase block mb-2 tracking-widest">Supplier Bill Details</span>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] font-bold text-indigo-900/40 uppercase">Bill No</p>
                                <p className="text-xs font-black text-indigo-900">{voucher.supplierBillNo || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-indigo-900/40 uppercase">Bill Date</p>
                                <p className="text-xs font-black text-indigo-900">{voucher.supplierBillDate ? new Date(voucher.supplierBillDate).toLocaleDateString('en-IN') : '—'}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                    <Layers size={14} className="text-indigo-600" />
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Transaction Items</span>
                </div>
                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px]">
                                <th className="p-3 text-left">Account / HSN</th>
                                <th className="p-3 text-right">Amount</th>
                                {isGst && <th className="p-3 text-right">Tax Details</th>}
                                <th className="p-3 text-left">Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {voucher.items?.map((item, i) => (
                                <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                                    <td className="p-3">
                                        <p className="font-black text-slate-700">{item.ledgerName || (item.ledgerId?.name)}</p>
                                        {item.hsnCode && <p className="text-[9px] font-bold text-slate-400">HSN: {item.hsnCode}</p>}
                                    </td>
                                    <td className="p-3 text-right font-black text-slate-600">
                                        ₹{(isGst ? item.taxableAmount : item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    {isGst && (
                                        <td className="p-3 text-right">
                                            <p className="font-bold text-indigo-600">{item.gstRate}% GST</p>
                                            <p className="text-[9px] text-slate-400">₹{(item.cgstAmount + item.sgstAmount + item.igstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                        </td>
                                    )}
                                    <td className="p-3 italic text-slate-400">
                                        {item.narration || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isGst && (
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="border border-slate-100 p-3 rounded-xl bg-slate-50/50">
                        <span className="text-[9px] font-black text-slate-400 block mb-1 uppercase tracking-tighter">Taxable Total</span>
                        <span className="text-sm font-black text-slate-700">₹{voucher.totalTaxableAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border border-slate-100 p-3 rounded-xl bg-indigo-50/30">
                        <span className="text-[9px] font-black text-indigo-400 block mb-1 uppercase tracking-tighter">Total GST Input</span>
                        <span className="text-sm font-black text-indigo-700">₹{voucher.totalTax?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border border-slate-100 p-3 rounded-xl bg-emerald-50/30">
                        <span className="text-[9px] font-black text-emerald-400 block mb-1 uppercase tracking-tighter">Round Off</span>
                        <span className="text-sm font-black text-emerald-700">{voucher.roundOff >= 0 ? '+' : ''}{voucher.roundOff?.toFixed(2)}</span>
                    </div>
                </div>
            )}

            <div className="bg-slate-50 border-2 border-slate-100 border-dashed p-4 rounded-xl">
                <div className="flex gap-2 items-start opacity-70">
                    <Info size={14} className="mt-0.5 text-slate-400" />
                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase block tracking-widest">General Narration</span>
                        <p className="text-xs font-semibold text-slate-700 mt-1 leading-relaxed">{voucher.narration || 'No description provided'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

const VoucherListPage = () => {
    const fyDateRange = useFYDateRange();
    const { openModal } = useModal();
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        startDate: fyDateRange.startDate,
        endDate: fyDateRange.endDate,
        voucherType: '',
        search: ''
    });

    // Auto-reset when FY changes
    useEffect(() => {
        setFilters(prev => ({
            ...prev,
            startDate: fyDateRange.startDate,
            endDate: fyDateRange.endDate,
        }));
    }, [fyDateRange.startDate, fyDateRange.endDate]);

    const fetchVouchers = async () => {
        setLoading(true);
        try {
            // Keep the system-generated entries hidden by default as requested
            const apiFilters = { ...filters, showSystemGenerated: 'false' };
            const result = await getVouchers(apiFilters);
            setVouchers(Array.isArray(result) ? result : (result?.data || []));
        } catch (error) {
            toast.error('Failed to fetch vouchers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVouchers();
    }, [filters.startDate, filters.endDate, filters.voucherType]);

    const handleCancel = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this voucher? This will reverse all ledger impacts.')) return;
        try {
            await cancelVoucher(id);
            toast.success('Voucher cancelled');
            fetchVouchers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to cancel voucher');
        }
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            'Confirmed': 'bg-emerald-50 text-emerald-700 border-emerald-100',
            'Cancelled': 'bg-red-50 text-red-700 border-red-100',
            'Draft': 'bg-slate-50 text-slate-700 border-slate-100'
        };
        return <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border-2 shadow-sm ${styles[status] || styles.Draft}`}>{status}</span>;
    };

    return (
        <div className={s.pageContainer}>
            <div className={s.headerSection}>
                <div>
                    <h1 className={s.title}>📔 Voucher Register</h1>
                    <p className={s.subtitle}>Comprehensive audit trail of all financial transactions</p>
                </div>
                <div className="flex gap-3" style={{ alignItems: 'center' }}>
                    <FYBadge />
                    <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-md" onClick={() => window.print()}>
                        <Printer size={14} /> Print Register
                    </button>
                </div>
            </div>

            <div className={s.filterPanel}>
                <div className={s.filterGroup}>
                    <label>Period Start</label>
                    <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
                </div>
                <div className={s.filterGroup}>
                    <label>Period End</label>
                    <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
                </div>
                <div className={s.searchGroup}>
                    <label>Search Details</label>
                    <div className={s.searchWrapper}>
                        <Search className={s.icon} size={16} />
                        <input
                            placeholder="Voucher #, Account Name, Narration..."
                            value={filters.search}
                            onChange={e => setFilters({ ...filters, search: e.target.value })}
                            onKeyPress={e => e.key === 'Enter' && fetchVouchers()}
                        />
                    </div>
                </div>
            </div>

            <div className={s.tableContainer}>
                {loading ? <div className="p-32 text-center text-slate-300 font-black animate-pulse uppercase tracking-widest">Reconstructing Audit Trail...</div> : (
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th>Voucher Details</th>
                                <th>Primary Account</th>
                                <th>Status</th>
                                <th className="text-right">Transaction Value</th>
                                <th className="text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vouchers.map(v => (
                                <tr key={v._id} className={v.status === 'Cancelled' ? s.cancelled : ''}>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <div className={s.voucherId}>{v.voucherNo}</div>
                                            {v.isGstEnabled && <span className="text-[8px] font-black bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase border border-indigo-200">GST</span>}
                                        </div>
                                        <div className={s.meta}>
                                            <Calendar size={12} /> {new Date(v.date).toLocaleDateString('en-IN')}
                                            <span className="opacity-20">/</span>
                                            {v.voucherTypeName || v.nature}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={s.accountName}>{v.cashBankAccountName || v.partyName || '—'}</div>
                                        <div className={s.narration} title={v.narration}>{v.narration}</div>
                                    </td>
                                    <td><StatusBadge status={v.status} /></td>
                                    <td className={s.amount}>₹{(v.grandTotal || v.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td>
                                        <div className="flex justify-center gap-2">
                                            <button 
                                                className="p-2 text-slate-300 hover:text-indigo-600 transition-colors" 
                                                title="View Details"
                                                onClick={() => openModal(<VoucherDetail voucher={v} />, { title: `Voucher Details: ${v.voucherNo}` })}
                                            >
                                                <Eye size={18} />
                                            </button>
                                            {v.status !== 'Cancelled' && (
                                                <button
                                                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    onClick={() => handleCancel(v._id)}
                                                    title="Cancel Voucher"
                                                >
                                                    <XCircle size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {vouchers.length === 0 && !loading && (
                    <div className="p-32 text-center text-slate-300 font-black uppercase tracking-widest italic">No financial records found for selected period</div>
                )}
            </div>
        </div>
    );
};

export default VoucherListPage;
