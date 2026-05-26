import { useState, useEffect } from 'react';
import { Search, Calendar } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';
import { getFixedAssets } from '@/services/fixedAssetApi';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const DepreciationSchedulePage = () => {
    const [assets, setAssets] = useState([]);
    const [assetId, setAssetId] = useState('');
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getFixedAssets({}).then(list => {
            setAssets((list || []).map(a => ({ label: a.assetName || a.name, value: a._id })));
        }).catch(() => {});
    }, []);

    const load = async () => {
        if (!assetId) return toast.error('Select an asset first');
        setLoading(true);
        try {
            const res = await axiosInstance.get('/depreciation/schedule', { params: { assetId } });
            setSchedule(res.data?.data?.schedule || res.data?.data || []);
        } catch { toast.error('Failed to load schedule'); }
        finally { setLoading(false); }
    };

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
                <Calendar className="text-blue-600" size={24} />
                <h1 className="text-xl font-bold text-slate-800">Depreciation Schedule</h1>
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex gap-4 items-end">
                <div className="w-80">
                    <label className="text-xs text-slate-500 block mb-1">Select Asset</label>
                    <SearchableSelect options={assets} value={assetId} onChange={setAssetId} placeholder="Search asset..." />
                </div>
                <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Show Schedule
                </button>
            </div>

            {loading ? <BrandedLoader /> : schedule.length > 0 && (
                <div className="bg-white rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Year</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Opening BV</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Depreciation</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Closing BV</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedule.map((row, i) => (
                                <tr key={i} className="border-b hover:bg-slate-50">
                                    <td className="px-4 py-3 text-right font-medium text-slate-700">{row.year}</td>
                                    <td className="px-4 py-3 text-right">₹{fmt(row.openingBV)}</td>
                                    <td className="px-4 py-3 text-right text-red-600">₹{fmt(row.depreciation)}</td>
                                    <td className="px-4 py-3 text-right font-semibold">₹{fmt(row.closingBV)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default DepreciationSchedulePage;
