import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Eye,
    Pencil,
    Trash2,
    CheckCircle2,
    Clock,
    XCircle
} from 'lucide-react';
import { getBOMs, deleteBOM } from '@/services/bomApi';
import { PATHS } from '@/routes/paths';
import { useToast } from '@/components/ui/Toast';

const BOMPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [boms, setBoms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        bomType: ''
    });

    const fetchBoms = async () => {
        try {
            setLoading(true);
            const response = await getBOMs({ ...filters, limit: 1000 });
            setBoms(response.data);
        } catch (error) {
            addToast('Failed to fetch BOMs', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBoms();
    }, [filters]);

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this BOM?')) {
            try {
                await deleteBOM(id);
                addToast('BOM deleted successfully', 'success');
                fetchBoms();
            } catch (error) {
                addToast('Failed to delete BOM', 'error');
            }
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Approved': return <CheckCircle2 size={16} className="text-green-500" />;
            case 'Draft': return <Clock size={16} className="text-amber-500" />;
            case 'Inactive': return <XCircle size={16} className="text-gray-400" />;
            default: return null;
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <ClipboardList className="text-blue-600" />
                        Bill of Materials (BOM)
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Manage product compositions and costing</p>
                </div>
                <button
                    onClick={() => navigate(PATHS.INVENTORY.BOM.NEW)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                >
                    <Plus size={20} />
                    Create New BOM
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Search & Filter Bar */}
                <div className="p-4 border-b border-gray-100 flex flex-wrap gap-4 items-center bg-gray-50/50">
                    <div className="relative flex-1 min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by BOM Number or Finished Product..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        />
                    </div>

                    <select
                        className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    >
                        <option value="">All Statuses</option>
                        <option value="Draft">Draft</option>
                        <option value="Approved">Approved</option>
                        <option value="Inactive">Inactive</option>
                    </select>

                    <select
                        className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                        value={filters.bomType}
                        onChange={(e) => setFilters({ ...filters, bomType: e.target.value })}
                    >
                        <option value="">All Types</option>
                        <option value="Production">Production</option>
                        <option value="Sub-Assembly">Sub-Assembly</option>
                        <option value="Service BOM">Service BOM</option>
                    </select>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 text-gray-600 text-sm font-semibold uppercase tracking-wider">
                                <th className="px-6 py-4">BOM Number</th>
                                <th className="px-6 py-4">Finished Product</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Version</th>
                                <th className="px-6 py-4">Qty</th>
                                <th className="px-6 py-4">Unit Cost</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan="8" className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : boms.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                                        No BOMs found. Create your first Bill of Material to get started.
                                    </td>
                                </tr>
                            ) : boms.map((bom) => (
                                <tr key={bom._id} className="hover:bg-gray-50/80 transition-colors group">
                                    <td className="px-6 py-4">
                                        <span className="font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => navigate(PATHS.INVENTORY.BOM.EDIT(bom._id))}>
                                            {bom.bomNumber}
                                        </span>
                                        {bom.isDefault && (
                                            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase">Default</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-gray-900 font-medium">{bom.finishedProductId?.itemName}</div>
                                        <div className="text-gray-400 text-xs">{bom.finishedProductId?.itemCode}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${bom.bomType === 'Production' ? 'bg-purple-100 text-purple-700' :
                                            bom.bomType === 'Sub-Assembly' ? 'bg-indigo-100 text-indigo-700' :
                                                'bg-teal-100 text-teal-700'
                                            }`}>
                                            {bom.bomType}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs">{bom.version}</td>
                                    <td className="px-6 py-4 text-gray-600">{bom.productionQuantity} {bom.finishedProductId?.uom}</td>
                                    <td className="px-6 py-4 text-gray-900 font-semibold">₹{bom.finalProductionCostPerUnit?.toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            {getStatusIcon(bom.status)}
                                            <span className="text-sm">{bom.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => navigate(PATHS.INVENTORY.BOM.EDIT(bom._id))}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                title="Edit"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(bom._id)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BOMPage;
