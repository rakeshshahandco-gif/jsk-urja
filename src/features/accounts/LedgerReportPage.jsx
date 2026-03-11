import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, SearchableSelect
} from '@/components/ui';
import { Search, Printer, FileText, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { getLedgers, getLedgerStatement } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

const LedgerReportPage = ({ defaultType = null }) => {
    const [ledgers, setLedgers] = useState([]);
    const [selectedLedgerId, setSelectedLedgerId] = useState('');
    const [filters, setFilters] = useState({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

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

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                        {defaultType === 'Cash' ? 'Cash Book' : defaultType === 'Bank' ? 'Bank Book' : 'Account Ledger Report'}
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Detailed transaction history and balance summary</p>
                </div>
                <Button variant="outline" className="flex items-center gap-2" disabled={!data}>
                    <Printer className="w-4 h-4" /> Export PDF
                </Button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Select Account / Ledger</label>
                    <SearchableSelect
                        options={ledgers.map(l => ({ label: l.name, value: l._id, type: l.type }))}
                        value={selectedLedgerId}
                        onChange={setSelectedLedgerId}
                        placeholder="Type to search..."
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Period</label>
                    <div className="flex gap-2">
                        <Input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
                        <Input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
                    </div>
                </div>
                <Button onClick={handleFetchStatement} disabled={loading} className="w-full font-bold">
                    {loading ? 'Processing...' : 'View Report'}
                </Button>
            </div>

            {data && (
                <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-6">
                        <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                            <p className="text-[10px] font-black uppercase text-blue-400 mb-1">Opening Balance</p>
                            <p className="text-2xl font-black text-blue-900">₹{data.openingBalance.toLocaleString()}</p>
                        </div>
                        <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                            <p className="text-[10px] font-black uppercase text-indigo-400 mb-1">Total Period Activity</p>
                            <div className="flex gap-4">
                                <div><span className="text-[10px] text-green-600 font-bold">DEBIT (+):</span> <span className="font-bold">₹{data.periodDebit.toLocaleString()}</span></div>
                                <div><span className="text-[10px] text-red-600 font-bold">CREDIT (-):</span> <span className="font-bold">₹{data.periodCredit.toLocaleString()}</span></div>
                            </div>
                        </div>
                        <div className="bg-gray-900 p-6 rounded-xl shadow-lg">
                            <p className="text-[10px] font-black uppercase text-gray-500 mb-1">Closing Balance</p>
                            <p className="text-2xl font-black text-white">₹{data.closingBalance.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b">
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Voucher / Ref</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Type</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Debit (₹)</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Credit (₹)</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Balance (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 font-medium">
                                <tr className="bg-gray-50/30 italic">
                                    <td className="px-6 py-3 text-sm" colSpan={3}>Brought Forward (Opening)</td>
                                    <td className="px-6 py-3 text-right">-</td>
                                    <td className="px-6 py-3 text-right">-</td>
                                    <td className="px-6 py-3 text-right font-bold tabular-nums">₹{data.openingBalance.toLocaleString()}</td>
                                </tr>
                                {data.entries.map((entry, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-500">{new Date(entry.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-gray-900">{entry.voucherNumber}</div>
                                            <div className="text-[10px] text-gray-400 uppercase truncate max-w-[250px]">{entry.narration || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {entry.type === 'Debit' ?
                                                <ArrowUpRight className="w-4 h-4 text-green-500 mx-auto" /> :
                                                <ArrowDownLeft className="w-4 h-4 text-red-500 mx-auto" />
                                            }
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-green-600">
                                            {entry.type === 'Debit' ? `₹${entry.amount.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-red-600">
                                            {entry.type === 'Credit' ? `₹${entry.amount.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-900 tabular-nums">
                                            ₹{entry.runningBalance.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-primary/5 font-black border-t-2 border-primary/20">
                                    <td className="px-6 py-4 text-sm uppercase" colSpan={3}>Closing Balance</td>
                                    <td className="px-6 py-4 text-right text-green-700">₹{data.periodDebit.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right text-red-700">₹{data.periodCredit.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right text-primary text-lg">₹{data.closingBalance.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!data && !loading && (
                <div className="py-32 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                    <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <FileText className="w-10 h-10 text-gray-300" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Generate Ledger Statement</h3>
                    <p className="text-gray-400 mt-2 max-w-xs mx-auto text-sm font-medium">Select an account and date range above to view the transaction history.</p>
                </div>
            )}
        </div>
    );
};

export default LedgerReportPage;
