import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select
} from '@/components/ui';
import { Search, Filter, Download, User, ArrowRight, TrendingUp } from 'lucide-react';
import { getOutstandingSummary } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

const OutstandingReportPage = () => {
    const [reportType, setReportType] = useState('Receivable'); // Receivable (Customers) or Payable (Suppliers)
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const fetchReport = async () => {
        setLoading(true);
        try {
            const results = await getOutstandingSummary(reportType);
            setData(results);
        } catch (error) {
            toast.error('Failed to fetch outstanding report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [reportType]);

    const filteredData = data.filter(item =>
        item.ledgerName.toLowerCase().includes(search.toLowerCase())
    );

    const totalOutstanding = filteredData.reduce((sum, item) => sum + item.outstanding, 0);

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Outstanding Summary</h1>
                    <div className="flex gap-2 mt-4 p-1 bg-gray-100 rounded-lg inline-flex">
                        <button
                            onClick={() => setReportType('Receivable')}
                            className={`px-6 py-2 text-xs font-black uppercase rounded-md transition-all ${reportType === 'Receivable' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:bg-white/50'}`}
                        >
                            Receivables (Customers)
                        </button>
                        <button
                            onClick={() => setReportType('Payable')}
                            className={`px-6 py-2 text-xs font-black uppercase rounded-md transition-all ${reportType === 'Payable' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:bg-white/50'}`}
                        >
                            Payables (Suppliers)
                        </button>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="flex items-center gap-2 font-bold px-6">
                        <Download className="w-4 h-4" /> Export
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`p-8 rounded-2xl shadow-lg border-2 flex flex-col items-center justify-center col-span-1 ${reportType === 'Receivable' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className={`p-3 rounded-full mb-3 ${reportType === 'Receivable' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        <TrendingUp className="w-8 h-8" />
                    </div>
                    <span className="text-[10px] font-black uppercase text-gray-500 mb-1">Total {reportType}</span>
                    <span className={`text-4xl font-black ${reportType === 'Receivable' ? 'text-green-700' : 'text-red-700'}`}>
                        ₹{totalOutstanding.toLocaleString()}
                    </span>
                    <p className="text-[11px] text-gray-400 mt-2 font-bold">ACCROSS {filteredData.length} ACCOUNTS</p>
                </div>

                <div className="md:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-100 flex items-center gap-4 bg-gray-50/50">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Filter by name..."
                                className="pl-10 font-bold"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <Select
                            options={[
                                { label: 'All Ageing', value: 'all' },
                                { label: '> 30 Days', value: '30' },
                                { label: '> 60 Days', value: '60' },
                                { label: '> 90 Days', value: '90' }
                            ]}
                            className="w-40 font-bold text-xs"
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[400px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
                                    <th className="px-6 py-4">Party / Ledger Name</th>
                                    <th className="px-6 py-4 text-right">Bills</th>
                                    <th className="px-6 py-4 text-right">Balance Amount (₹)</th>
                                    <th className="px-6 py-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 font-medium">
                                {filteredData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-gray-100 p-2 rounded-lg text-gray-400">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <div className="font-bold text-gray-900">{item.ledgerName}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-600">
                                                {item.billCount} BILLS
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 text-right font-black text-lg ${reportType === 'Receivable' ? 'text-green-600' : 'text-red-600'}`}>
                                            ₹{item.outstanding.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Button variant="ghost" size="sm" className="hover:bg-primary/5 text-primary">
                                                <ArrowRight className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredData.length === 0 && (
                            <div className="py-20 text-center text-gray-300 italic">No records found.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OutstandingReportPage;
