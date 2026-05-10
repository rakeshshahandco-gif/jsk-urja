import React, { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { Download, Calendar as CalendarIcon, RefreshCw, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import apiClient from '@/config/apiClient';
import { formatCurrency } from '@/utils/formatters';

export const GstPayableSummary = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const [dateRange, setDateRange] = useState({ startDate: firstDay, endDate: lastDay });

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/gst-reports/payable-summary', { params: dateRange });
            if (res.data.success) {
                setData(res.data.data);
            }
        } catch (error) {
            console.error('Error fetching GST Payable Summary:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    if (loading && !data) {
        return <div className="p-8 text-center text-slate-500">Loading GST Summary...</div>;
    }

    if (!data) {
        return <div className="p-8 text-center text-red-500">Failed to load GST Summary.</div>;
    }

    const { output, input, net } = data;
    const isPayable = net.total >= 0;

    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <CalendarIcon size={16} className="text-slate-500" />
                        <input
                            type="date"
                            value={dateRange.startDate}
                            onChange={(e) => setDateRange(p => ({ ...p, startDate: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                            type="date"
                            value={dateRange.endDate}
                            onChange={(e) => setDateRange(p => ({ ...p, endDate: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <Button variant="secondary" size="sm" onClick={fetchSummary} disabled={loading} icon={RefreshCw}>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* High Level Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 border-t-4 border-t-emerald-500">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">Total Output Tax (Liability)</p>
                            <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(output.total)}</h3>
                            <p className="text-xs text-slate-400 mt-2">Sales & Debit Notes</p>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                            <TrendingUp size={24} />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 border-t-4 border-t-blue-500">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">Total Input Tax (ITC Available)</p>
                            <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(input.total)}</h3>
                            <p className="text-xs text-slate-400 mt-2">Purchases & Credit Notes</p>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                            <TrendingDown size={24} />
                        </div>
                    </div>
                </Card>

                <Card className={`p-6 border-t-4 ${isPayable ? 'border-t-rose-500 bg-rose-50/30' : 'border-t-indigo-500 bg-indigo-50/30'}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">
                                {isPayable ? 'Net GST Payable' : 'Net ITC Carry Forward'}
                            </p>
                            <h3 className={`text-3xl font-bold ${isPayable ? 'text-rose-600' : 'text-indigo-600'}`}>
                                {formatCurrency(Math.abs(net.total))}
                            </h3>
                            <p className="text-xs text-slate-500 mt-2 font-medium">Output Liability - Input Tax Credit</p>
                        </div>
                        <div className={`p-3 rounded-full ${isPayable ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            <Scale size={24} />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Detailed Breakdown */}
            <Card className="overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-800">Tax Head Breakdown</h3>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100/50 text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="p-4 font-medium">Tax Component</th>
                                <th className="p-4 font-medium text-right">Taxable Value</th>
                                <th className="p-4 font-medium text-right text-emerald-600">Output Tax (₹)</th>
                                <th className="p-4 font-medium text-right text-blue-600">Input Tax (₹)</th>
                                <th className="p-4 font-medium text-right font-bold">Net Liability (₹)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr className="hover:bg-slate-50">
                                <td className="p-4 font-medium text-slate-700">CGST (Central Tax)</td>
                                <td className="p-4 text-right text-slate-500">--</td>
                                <td className="p-4 text-right">{formatCurrency(output.cgst)}</td>
                                <td className="p-4 text-right">{formatCurrency(input.cgst)}</td>
                                <td className={`p-4 text-right font-semibold ${net.cgst >= 0 ? 'text-rose-600' : 'text-indigo-600'}`}>
                                    {formatCurrency(Math.abs(net.cgst))} {net.cgst >= 0 ? '(Payable)' : '(Credit)'}
                                </td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="p-4 font-medium text-slate-700">SGST (State Tax)</td>
                                <td className="p-4 text-right text-slate-500">--</td>
                                <td className="p-4 text-right">{formatCurrency(output.sgst)}</td>
                                <td className="p-4 text-right">{formatCurrency(input.sgst)}</td>
                                <td className={`p-4 text-right font-semibold ${net.sgst >= 0 ? 'text-rose-600' : 'text-indigo-600'}`}>
                                    {formatCurrency(Math.abs(net.sgst))} {net.sgst >= 0 ? '(Payable)' : '(Credit)'}
                                </td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="p-4 font-medium text-slate-700">IGST (Integrated Tax)</td>
                                <td className="p-4 text-right text-slate-500">--</td>
                                <td className="p-4 text-right">{formatCurrency(output.igst)}</td>
                                <td className="p-4 text-right">{formatCurrency(input.igst)}</td>
                                <td className={`p-4 text-right font-semibold ${net.igst >= 0 ? 'text-rose-600' : 'text-indigo-600'}`}>
                                    {formatCurrency(Math.abs(net.igst))} {net.igst >= 0 ? '(Payable)' : '(Credit)'}
                                </td>
                            </tr>
                            <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                <td className="p-4 text-slate-800">Grand Total</td>
                                <td className="p-4 text-right text-slate-500">--</td>
                                <td className="p-4 text-right text-emerald-700">{formatCurrency(output.total)}</td>
                                <td className="p-4 text-right text-blue-700">{formatCurrency(input.total)}</td>
                                <td className={`p-4 text-right text-lg ${isPayable ? 'text-rose-700' : 'text-indigo-700'}`}>
                                    {formatCurrency(Math.abs(net.total))}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default GstPayableSummary;
