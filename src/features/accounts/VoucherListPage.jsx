import { useState, useEffect } from "react";
import {
    Button, Select
} from "@/components/ui";
import { Search, Calendar, XCircle, Eye, Printer } from "lucide-react";
import { getVouchers, cancelVoucher } from "@/services/accountApi";
import { toast } from "react-hot-toast";
import s from "./VoucherListPage.module.scss";

const VoucherListPage = () => {
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        voucherType: '',
        search: ''
    });

    const fetchVouchers = async () => {
        setLoading(true);
        try {
        const result = await getVouchers(filters);
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
            'Generated': 'bg-emerald-50 text-emerald-700 border-emerald-100',
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
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-md">
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
                                        <div className={s.voucherId}>{v.voucherNumber}</div>
                                        <div className={s.meta}>
                                            <Calendar size={12} /> {new Date(v.date).toLocaleDateString('en-IN')}
                                            <span className="opacity-20">/</span>
                                            {v.voucherType?.name}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={s.accountName}>{v.cashBankAccount?.accountName}</div>
                                        <div className={s.narration} title={v.narration}>{v.narration}</div>
                                    </td>
                                    <td><StatusBadge status={v.status} /></td>
                                    <td className={s.amount}>₹{(v.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td>
                                        <div className="flex justify-center gap-2">
                                            <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors" title="View Details">
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
