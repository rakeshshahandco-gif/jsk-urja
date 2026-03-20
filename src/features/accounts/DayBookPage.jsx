import React, { useState, useEffect } from 'react';
import { Button, Input, ExportButtons } from '@/components/ui';
import { BookOpen, Filter, Eye, ArrowRight } from 'lucide-react';
import { getDayBook, cancelVoucher } from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const DayBookPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        from: new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getDayBook(filters);
            setData(res);
        } catch (error) {
            toast.error('Failed to fetch day book');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getNatureColor = (nature) => {
        switch (nature) {
            case 'Receipt': return 'bg-green-100 text-green-700 border-green-200';
            case 'Payment': return 'bg-red-100 text-red-700 border-red-200';
            case 'Expense': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'Journal': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Contra': return 'bg-purple-100 text-purple-700 border-purple-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-8 h-8 text-primary" /> Day Book
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Daily transaction overview across all voucher types</p>
                </div>
                <div className="flex gap-2">
                    <ExportButtons data={data} filename="day_book" />
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-gray-400">Date Range</label>
                    <div className="flex items-center gap-2">
                        <Input type="date" value={filters.from} onChange={(e) => setFilters(prev => ({ ...prev, from: e.target.value }))} className="h-9 text-sm w-40" />
                        <ArrowRight className="w-4 h-4 text-gray-300" />
                        <Input type="date" value={filters.to} onChange={(e) => setFilters(prev => ({ ...prev, to: e.target.value }))} className="h-9 text-sm w-40" />
                    </div>
                </div>
                <Button onClick={fetchData} className="h-9">
                    <Filter className="w-4 h-4 mr-2" /> Refresh
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b">
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Vch Type</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Vch No.</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Particulars</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Debit (₹)</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Credit (₹)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.map(vch => (
                            <React.Fragment key={vch._id}>
                                <tr className="hover:bg-gray-50/50 font-medium group">
                                    <td className="px-6 py-4 text-sm">{new Date(vch.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-tighter ${getNatureColor(vch.nature)}`}>
                                            {vch.voucherTypeName || vch.nature}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-primary font-bold">{vch.voucherNo}</td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900">{vch.partyName || (vch.items[0]?.ledgerName)}</div>
                                        <div className="text-[10px] text-gray-400 italic mt-0.5 max-w-xs truncate">{vch.narration}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        {vch.nature === 'Receipt' ? vch.totalAmount.toLocaleString() : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        {vch.nature === 'Payment' || vch.nature === 'Expense' ? vch.totalAmount.toLocaleString() : '-'}
                                    </td>
                                </tr>
                                {/* Optional: Sub-rows for Journal/Contra multi-line display could be added here */}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && !loading && (
                    <div className="py-24 text-center bg-gray-50/50">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white shadow-sm mb-4 border border-gray-100 text-gray-200">
                            <FileText className="w-8 h-8" />
                        </div>
                        <p className="text-gray-400 font-medium">Empty Day Book</p>
                        <p className="text-gray-300 text-xs mt-1">No transactions recorded on this date</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DayBookPage;
