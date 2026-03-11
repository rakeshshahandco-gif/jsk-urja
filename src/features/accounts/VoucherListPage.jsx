import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal
} from '@/components/ui';
import { Search, Filter, Calendar, XCircle, Eye, ArrowRight, Printer } from 'lucide-react';
import { getVouchers, cancelVoucher } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

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
            const data = await getVouchers(filters);
            setVouchers(data);
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

    const statusBadge = (status) => {
        const styles = {
            'Generated': 'bg-green-100 text-green-700',
            'Cancelled': 'bg-red-100 text-red-700',
            'Draft': 'bg-gray-100 text-gray-700'
        };
        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${styles[status] || styles.Draft}`}>{status}</span>;
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">Voucher Register</h1>
                    <p className="text-gray-500 text-sm mt-1">Audit trail of all financial transactions</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="flex items-center gap-2">
                        <Printer className="w-4 h-4" /> Print Register
                    </Button>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">From Date</label>
                    <Input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">To Date</label>
                    <Input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
                </div>
                <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Search Details</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Voucher #, Account Name, Narration..."
                            className="pl-10"
                            value={filters.search}
                            onChange={e => setFilters({ ...filters, search: e.target.value })}
                            onKeyPress={e => e.key === 'Enter' && fetchVouchers()}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Voucher Details</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Primary Account</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Amount (₹)</th>
                            <th className="px-6 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 italic">
                        {vouchers.map(v => (
                            <tr key={v._id} className={`hover:bg-gray-50 transition-colors not-italic ${v.status === 'Cancelled' ? 'opacity-60 grayscale' : ''}`}>
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900">{v.voucherNumber}</div>
                                    <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                                        <Calendar className="w-3 h-3" /> {new Date(v.date).toLocaleDateString()}
                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                        {v.voucherType?.name}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-700">{v.cashBankAccount?.accountName}</div>
                                    <div className="text-[10px] text-gray-400 uppercase truncate max-w-[200px] mt-0.5">{v.narration}</div>
                                </td>
                                <td className="px-6 py-4">{statusBadge(v.status)}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="text-lg font-black text-gray-900 tabular-nums">₹{v.totalAmount.toLocaleString()}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center gap-1">
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View Details">
                                            <Eye className="w-4 h-4 text-gray-400" />
                                        </Button>
                                        {v.status !== 'Cancelled' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 hover:bg-red-50"
                                                onClick={() => handleCancel(v._id)}
                                                title="Cancel Voucher"
                                            >
                                                <XCircle className="w-4 h-4 text-red-500" />
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {vouchers.length === 0 && !loading && (
                    <div className="py-20 text-center text-gray-400 font-medium italic">No vouchers found for this period.</div>
                )}
            </div>
        </div>
    );
};

export default VoucherListPage;
