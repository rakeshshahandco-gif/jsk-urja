import React, { useState, useEffect } from 'react';
import { Button, Input, ExportButtons } from '@/components/ui';
import { Calendar, FileText, Filter, Eye } from 'lucide-react';
import { getSalesRegister } from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const SalesRegisterPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getSalesRegister(filters);
            setData(res);
        } catch (error) {
            toast.error('Failed to fetch sales register');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const totalAmount = data.reduce((sum, inv) => sum + (inv.roundedTotal || inv.grandTotal || 0), 0);
    const totalTax = data.reduce((sum, inv) => sum + (inv.totalGst || 0), 0);

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales Register</h1>
                    <p className="text-gray-500 text-sm mt-1">Monthly/Periodical summary of all sales invoices</p>
                </div>
                <div className="flex gap-2">
                    <ExportButtons data={data} filename="sales_register" />
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-gray-400">From Date</label>
                    <Input type="date" value={filters.from} onChange={(e) => setFilters(prev => ({ ...prev, from: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-gray-400">To Date</label>
                    <Input type="date" value={filters.to} onChange={(e) => setFilters(prev => ({ ...prev, to: e.target.value }))} className="h-9 text-sm" />
                </div>
                <Button onClick={fetchData} className="h-9">
                    <Filter className="w-4 h-4 mr-2" /> Apply
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b">
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Particulars</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Vch No.</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Gross Amount</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Tax Amount</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Net Amount</th>
                            <th className="px-6 py-3 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 italic-last-row">
                        {data.map(inv => (
                            <tr key={inv._id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-3 text-sm">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                                <td className="px-6 py-3">
                                    <div className="text-sm font-medium text-gray-900">{inv.customerId?.name || 'Cash Sale'}</div>
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">{inv.customerGstin || 'No GST'}</div>
                                </td>
                                <td className="px-6 py-3 text-sm font-mono">{inv.invoiceNumber}</td>
                                <td className="px-6 py-3 text-sm text-right">₹{(inv.totalBeforeTax || 0).toLocaleString()}</td>
                                <td className="px-6 py-3 text-sm text-right text-gray-500">₹{(inv.totalGst || 0).toLocaleString()}</td>
                                <td className="px-6 py-3 text-sm font-bold text-right text-green-700">₹{(inv.roundedTotal || inv.grandTotal).toLocaleString()}</td>
                                <td className="px-6 py-3 text-center">
                                    <button onClick={() => navigate(PATHS.SALES.INVOICE_DETAIL(inv._id))} className="text-primary hover:text-primary/70">
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-900 text-white font-bold">
                        <tr>
                            <td colSpan={3} className="px-6 py-4 text-right uppercase text-xs tracking-widest text-gray-400">Total Selection</td>
                            <td className="px-6 py-4 text-right text-sm">₹{(totalAmount - totalTax).toLocaleString()}</td>
                            <td className="px-6 py-4 text-right text-sm text-gray-400">₹{totalTax.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right text-lg text-green-400">₹{totalAmount.toLocaleString()}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
                {data.length === 0 && !loading && <div className="p-20 text-center text-gray-400 flex flex-col items-center gap-2">
                    <FileText className="w-10 h-10 opacity-20" />
                    <span>No transactions found for the selected period</span>
                </div>}
            </div>
        </div>
    );
};

export default SalesRegisterPage;
