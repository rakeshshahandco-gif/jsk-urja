import { useState } from 'react';
import { TrendingUp, Search, Printer } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { useFYDateRange } from '@/contexts/FinancialYearContext';
import FYBadge from '@/components/ui/FYBadge';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const Section = ({ title, items = [], color }) => (
    <div className="mb-2">
        <div className={`px-4 py-2 font-semibold text-sm rounded-t-lg ${color}`}>{title}</div>
        {items.map((item, i) => (
            <div key={i} className="flex justify-between px-4 py-2 border-b text-sm hover:bg-slate-50">
                <span className="text-slate-700 pl-4">{item.label}</span>
                <span className={`font-medium ${item.amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>₹{fmt(Math.abs(item.amount))} {item.amount < 0 ? '(Outflow)' : ''}</span>
            </div>
        ))}
    </div>
);

const CashFlowPage = () => {
    const fyDateRange = useFYDateRange();
    const [filters, setFilters] = useState({ startDate: fyDateRange.startDate, endDate: fyDateRange.endDate });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/accounting/reports/cash-flow', { params: filters });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load cash flow statement');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <TrendingUp className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Cash Flow Statement</h1>
                    <FYBadge />
                </div>
                {data && <button onClick={() => window.print()} className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50"><Printer size={15} /> Print</button>}
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">From</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={filters.startDate} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">To</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={filters.endDate} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} />
                </div>
                <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Generate
                </button>
            </div>

            {loading ? <BrandedLoader /> : data && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-800 text-white text-center font-bold text-sm">
                        Cash Flow Statement — {filters.startDate} to {filters.endDate}
                    </div>

                    <Section
                        title="A. Cash from Operating Activities"
                        color="bg-blue-50 text-blue-800"
                        items={[
                            { label: 'Net Profit for the Period', amount: data.operating?.netProfit || 0 },
                            ...(data.operating?.workingCapitalItems || []).map(i => ({ label: i.name, amount: i.cfImpact })),
                        ]}
                    />
                    <div className="flex justify-between px-4 py-2 bg-blue-100 font-semibold text-sm border-b">
                        <span>Net Cash from Operating Activities</span>
                        <span className={(data.operating?.total || 0) < 0 ? 'text-red-600' : 'text-blue-800'}>₹{fmt(Math.abs(data.operating?.total || 0))}</span>
                    </div>

                    <Section
                        title="B. Cash from Investing Activities"
                        color="bg-green-50 text-green-800"
                        items={(data.investing?.items || []).map(i => ({ label: i.name, amount: i.cfImpact }))}
                    />
                    <div className="flex justify-between px-4 py-2 bg-green-100 font-semibold text-sm border-b">
                        <span>Net Cash from Investing Activities</span>
                        <span className={(data.investing?.total || 0) < 0 ? 'text-red-600' : 'text-green-800'}>₹{fmt(Math.abs(data.investing?.total || 0))}</span>
                    </div>

                    <Section
                        title="C. Cash from Financing Activities"
                        color="bg-purple-50 text-purple-800"
                        items={(data.financing?.items || []).map(i => ({ label: i.name, amount: i.cfImpact }))}
                    />
                    <div className="flex justify-between px-4 py-2 bg-purple-100 font-semibold text-sm border-b">
                        <span>Net Cash from Financing Activities</span>
                        <span className={(data.financing?.total || 0) < 0 ? 'text-red-600' : 'text-purple-800'}>₹{fmt(Math.abs(data.financing?.total || 0))}</span>
                    </div>

                    <div className="flex justify-between px-4 py-3 bg-slate-800 text-white font-bold text-sm">
                        <span>Net Change in Cash & Cash Equivalents</span>
                        <span>₹{fmt(data.netChange || 0)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2 text-sm border-b">
                        <span className="text-slate-600">Opening Balance</span>
                        <span className="font-medium">₹{fmt(data.openingCash || 0)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-3 bg-blue-600 text-white font-bold text-sm">
                        <span>Closing Balance</span>
                        <span>₹{fmt(data.closingCash || 0)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CashFlowPage;
