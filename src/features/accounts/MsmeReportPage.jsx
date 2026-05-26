import { useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import FYBadge from '@/components/ui/FYBadge';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

const MsmeReportPage = () => {
    const [asOnDate, setAsOnDate] = useState(today());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/accounting/reports/msme', { params: { asOnDate } });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load MSME report');
        } finally {
            setLoading(false);
        }
    };

    // Backend returns { items: [{ supplierName, invoiceNo, invoiceDate, daysPast, outstanding, exceededBy }], totalOverdue }
    const rows = (data?.items || []).map(r => ({
        ...r,
        party: r.supplierName,
        amount: r.outstanding,
        daysOverdue: r.daysPast,
    }));

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">MSME Compliance Report</h1>
                    <FYBadge />
                </div>
            </div>

            {data && (
                <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="bg-red-50 rounded-xl p-4">
                        <p className="text-xs text-red-600 font-medium mb-1">Overdue &gt; 45 Days</p>
                        <p className="text-2xl font-bold text-red-700">{rows.length}</p>
                        <p className="text-sm text-red-600">₹{fmt(data.totalOverdue)}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4">
                        <p className="text-xs text-yellow-600 font-medium mb-1">MSME Limit (days)</p>
                        <p className="text-2xl font-bold text-yellow-700">{data.msmeDaysLimit || 45}</p>
                        <p className="text-sm text-yellow-600">As per MSMED Act</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4">
                        <p className="text-xs text-green-600 font-medium mb-1">Total Overdue Bills</p>
                        <p className="text-2xl font-bold text-green-700">{rows.length}</p>
                        <p className="text-sm text-green-600">₹{fmt(data.totalOverdue)}</p>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border p-4 mb-5 flex gap-4 items-end">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">As on Date</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={asOnDate} onChange={e => setAsOnDate(e.target.value)} />
                </div>
                <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Generate
                </button>
            </div>

            {loading ? <BrandedLoader /> : data && (
                <div className="bg-white rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Supplier (MSME)</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Invoice No</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Invoice Date</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Amount</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Days Overdue</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">No MSME parties with outstanding bills</td></tr>}
                            {rows.map((row, i) => (
                                <tr key={i} className="border-b hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{row.party}</td>
                                    <td className="px-4 py-3 text-slate-600">{row.invoiceNo}</td>
                                    <td className="px-4 py-3 text-slate-500">{row.invoiceDate ? new Date(row.invoiceDate).toLocaleDateString('en-IN') : '—'}</td>
                                    <td className="px-4 py-3 text-right">₹{fmt(row.amount)}</td>
                                    <td className={`px-4 py-3 text-right font-medium ${row.daysOverdue > 45 ? 'text-red-600' : 'text-yellow-600'}`}>{row.daysOverdue}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.daysOverdue > 45 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {row.daysOverdue > 45 ? 'Overdue' : 'Due Soon'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default MsmeReportPage;
