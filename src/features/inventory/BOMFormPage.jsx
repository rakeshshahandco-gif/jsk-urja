import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Save,
    X,
    Plus,
    Trash2,
    Calculator,
    ChevronLeft,
    Settings,
    FileText,
    Activity,
    AlertCircle
} from 'lucide-react';
import { getBOM, createBOM, updateBOM } from '@/services/bomApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import { useToast } from '@/components/ui/Toast';

const BLANK_COMPONENT = {
    itemId: '',
    itemCode: '',
    itemName: '',
    category: '',
    uom: '',
    quantity: 0,
    wastagePercentage: 0,
    finalQuantity: 0,
    rate: 0,
    totalCost: 0
};

const BOMFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const isEdit = Boolean(id);

    const [loading, setLoading] = useState(isEdit);
    const [items, setItems] = useState([]); // All items for selection
    const [finishedProducts, setFinishedProducts] = useState([]); // Only finished goods

    const [form, setForm] = useState({
        bomNumber: '',
        finishedProductId: '',
        version: 'V1',
        revisionDate: new Date().toISOString().split('T')[0],
        status: 'Draft',
        productionQuantity: 1,
        bomType: 'Production',
        components: [{ ...BLANK_COMPONENT }],

        totalRawMaterialCost: 0,
        totalProcessCost: 0,
        overheadCost: 0,
        labourCost: 0,
        finalProductionCostPerUnit: 0,

        processes: {
            smtAssembly: false,
            manualAssembly: false,
            testingRequired: false,
            qcRequired: false,
            packingRequired: false
        },

        isDefault: false,
        allowAlternateItems: false,
        scrapAccount: '',
        remarks: ''
    });

    // Fetch Initial Data
    useEffect(() => {
        const fetchItems = async () => {
            try {
                const response = await getItems({ limit: 1000 });
                setItems(response.data);
                setFinishedProducts(response.data.filter(i => i.itemCategory === 'FINISHED_GOOD'));
            } catch (err) {
                addToast('Failed to load items', 'error');
            }
        };

        const fetchBOMData = async () => {
            if (!isEdit) return;
            try {
                const data = await getBOM(id);
                setForm({
                    ...data,
                    finishedProductId: data.finishedProductId?._id || data.finishedProductId,
                    revisionDate: new Date(data.revisionDate).toISOString().split('T')[0],
                    components: data.components.map(c => ({
                        ...c,
                        itemId: c.itemId?._id || c.itemId
                    }))
                });
            } catch (err) {
                addToast('Failed to load BOM', 'error');
                navigate(PATHS.INVENTORY.BOM.ROOT);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
        fetchBOMData();
    }, [id, isEdit]);

    // Handle Component Changes & Calculations
    const handleComponentChange = (index, field, value) => {
        const newComponents = [...form.components];
        const comp = { ...newComponents[index] };

        if (field === 'itemId') {
            const selectedItem = items.find(i => i._id === value);
            if (selectedItem) {
                comp.itemId = value;
                comp.itemCode = selectedItem.itemCode;
                comp.itemName = selectedItem.itemName;
                comp.category = selectedItem.itemCategory;
                comp.uom = selectedItem.uom;
                comp.rate = selectedItem.purchaseRate || 0;
            }
        } else {
            comp[field] = value;
        }

        // Recalculate component costs
        const qty = parseFloat(comp.quantity) || 0;
        const wastage = parseFloat(comp.wastagePercentage) || 0;
        comp.finalQuantity = qty * (1 + wastage / 100);
        comp.totalCost = comp.finalQuantity * (parseFloat(comp.rate) || 0);

        newComponents[index] = comp;
        setForm(prev => ({ ...prev, components: newComponents }));
    };

    const addComponent = () => {
        setForm(prev => ({
            ...prev,
            components: [...prev.components, { ...BLANK_COMPONENT }]
        }));
    };

    const removeComponent = (index) => {
        if (form.components.length === 1) return;
        const newComponents = form.components.filter((_, i) => i !== index);
        setForm(prev => ({ ...prev, components: newComponents }));
    };

    // Global Cost Calculations
    useEffect(() => {
        const totalRM = form.components.reduce((sum, c) => sum + (parseFloat(c.totalCost) || 0), 0);
        const totalProcess = parseFloat(form.totalProcessCost) || 0;
        const overhead = parseFloat(form.overheadCost) || 0;
        const labour = parseFloat(form.labourCost) || 0;

        const totalProduction = totalRM + totalProcess + overhead + labour;
        const prodQty = parseFloat(form.productionQuantity) || 1;

        setForm(prev => ({
            ...prev,
            totalRawMaterialCost: totalRM,
            finalProductionCostPerUnit: totalProduction / prodQty
        }));
    }, [form.components, form.totalProcessCost, form.overheadCost, form.labourCost, form.productionQuantity]);

    const onSubmit = async () => {
        try {
            if (isEdit) {
                await updateBOM(id, form);
                addToast('BOM updated successfully', 'success');
            } else {
                await createBOM(form);
                addToast('BOM created successfully', 'success');
            }
            navigate(PATHS.INVENTORY.BOM.ROOT);
        } catch (error) {
            addToast(error.response?.data?.message || 'Failed to save BOM', 'error');
        }
    };

    if (loading) return <div className="p-10 text-center">Loading BOM Details...</div>;

    return (
        <div className="bg-gray-50 min-h-screen">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(PATHS.INVENTORY.BOM.ROOT)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ChevronLeft />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">
                            {isEdit ? `Edit BOM: ${form.bomNumber}` : 'Create New Bill of Material'}
                        </h1>
                        <p className="text-xs text-gray-500 uppercase font-mono tracking-tight">
                            {isEdit ? 'Modified ' + new Date(form.updatedAt).toLocaleDateString() : 'New Production Specification'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate(PATHS.INVENTORY.BOM.ROOT)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSubmit}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 shadow-md transition-all active:scale-95"
                    >
                        <Save size={18} />
                        Save BOM
                    </button>
                </div>
            </div>

            <div className="p-6 max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Left Column: Form Sections */}
                <div className="xl:col-span-3 space-y-6">

                    {/* Header Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <FileText size={16} />
                            BOM Header
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">BOM Number</label>
                                <input
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                                    placeholder="AUTO-GENERATE"
                                    value={form.bomNumber}
                                    onChange={e => setForm({ ...form, bomNumber: e.target.value })}
                                    disabled={isEdit}
                                />
                            </div>
                            <div className="space-y-1 lg:col-span-2">
                                <label className="text-xs font-semibold text-gray-600">Finished Product *</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                                    value={form.finishedProductId}
                                    onChange={e => setForm({ ...form, finishedProductId: e.target.value })}
                                    required
                                >
                                    <option value="">Select Product from Item Master</option>
                                    {finishedProducts.map(p => (
                                        <option key={p._id} value={p._id}>{p.itemCode} - {p.itemName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Version</label>
                                <input
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-mono"
                                    value={form.version}
                                    onChange={e => setForm({ ...form, version: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Revision Date</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                                    value={form.revisionDate}
                                    onChange={e => setForm({ ...form, revisionDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Status</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                                    value={form.status}
                                    onChange={e => setForm({ ...form, status: e.target.value })}
                                >
                                    <option value="Draft">Draft</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Production Quantity</label>
                                <input
                                    type="number"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-blue-600"
                                    value={form.productionQuantity}
                                    onChange={e => setForm({ ...form, productionQuantity: e.target.value })}
                                />
                                <p className="text-[10px] text-gray-400">BOM is defined for this quantity</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">BOM Type</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                                    value={form.bomType}
                                    onChange={e => setForm({ ...form, bomType: e.target.value })}
                                >
                                    <option value="Production">Production</option>
                                    <option value="Sub-Assembly">Sub-Assembly</option>
                                    <option value="Service BOM">Service BOM</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Component Grid Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Settings size={16} />
                                Raw Material / Component Table
                            </h2>
                            <button
                                onClick={addComponent}
                                className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-2 font-semibold transition-all"
                            >
                                <Plus size={16} />
                                Add Row
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-100/50 text-gray-500 text-[10px] uppercase font-bold tracking-wider border-b border-gray-200">
                                        <th className="px-3 py-3 w-10 text-center">#</th>
                                        <th className="px-3 py-3 min-w-[200px]">Item Search / Code</th>
                                        <th className="px-3 py-3 w-32">Category</th>
                                        <th className="px-3 py-3 w-28 text-center">Qty</th>
                                        <th className="px-3 py-3 w-20">UOM</th>
                                        <th className="px-3 py-3 w-24">Wastage %</th>
                                        <th className="px-3 py-3 w-28">Final Qty</th>
                                        <th className="px-3 py-3 w-28">Rate</th>
                                        <th className="px-3 py-3 w-32">Total Cost</th>
                                        <th className="px-3 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {form.components.map((comp, idx) => (
                                        <tr key={idx} className="group hover:bg-blue-50/30 transition-colors">
                                            <td className="px-3 py-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                                            <td className="px-3 py-2">
                                                <select
                                                    className="w-full bg-transparent p-1 border-none focus:ring-1 focus:ring-blue-500 rounded text-sm outline-none"
                                                    value={comp.itemId}
                                                    onChange={e => handleComponentChange(idx, 'itemId', e.target.value)}
                                                >
                                                    <option value="">Select Item...</option>
                                                    {items.map(i => (
                                                        <option key={i._id} value={i._id}>{i.itemCode} - {i.itemName}</option>
                                                    ))}
                                                </select>
                                                {comp.itemName && <div className="text-[10px] text-gray-400 ml-1">{comp.itemName}</div>}
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600">{comp.category || '-'}</span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    className="w-full p-1 border border-transparent group-hover:border-gray-200 focus:border-blue-500 rounded text-sm text-center outline-none bg-transparent"
                                                    value={comp.quantity}
                                                    onChange={e => handleComponentChange(idx, 'quantity', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-xs text-gray-500 font-mono uppercase">{comp.uom || '-'}</td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    className="w-full p-1 border border-transparent group-hover:border-gray-200 focus:border-blue-500 rounded text-sm text-center outline-none bg-transparent text-amber-600"
                                                    value={comp.wastagePercentage}
                                                    onChange={e => handleComponentChange(idx, 'wastagePercentage', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs text-center font-bold">
                                                {comp.finalQuantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    className="w-full p-1 border border-transparent group-hover:border-gray-200 focus:border-blue-500 rounded text-sm outline-none bg-transparent"
                                                    value={comp.rate}
                                                    onChange={e => handleComponentChange(idx, 'rate', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs font-bold text-gray-800">
                                                ₹{comp.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2">
                                                <button
                                                    onClick={() => removeComponent(idx)}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Extra Settings Footer */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="space-y-3">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={form.isDefault}
                                        onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                                    />
                                    <div className={`w-10 h-5 rounded-full transition-colors ${form.isDefault ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.isDefault ? 'translate-x-5' : ''}`}></div>
                                </div>
                                <span className="text-sm font-medium text-gray-700">Is Default BOM?</span>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={form.allowAlternateItems}
                                        onChange={e => setForm({ ...form, allowAlternateItems: e.target.checked })}
                                    />
                                    <div className={`w-10 h-5 rounded-full transition-colors ${form.allowAlternateItems ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.allowAlternateItems ? 'translate-x-5' : ''}`}></div>
                                </div>
                                <span className="text-sm font-medium text-gray-700">Allow Alternate Items</span>
                            </label>
                        </div>
                        <div className="space-y-1 lg:col-span-3">
                            <label className="text-xs font-semibold text-gray-600">Remarks / Notes</label>
                            <textarea
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                                rows="2"
                                placeholder="Additional details about this BOM version..."
                                value={form.remarks}
                                onChange={e => setForm({ ...form, remarks: e.target.value })}
                            ></textarea>
                        </div>
                    </div>
                </div>

                {/* Right Column: Summaries */}
                <div className="space-y-6">

                    {/* Cost Summary Section */}
                    <div className="bg-gradient-to-br from-blue-900 to-indigo-950 p-6 rounded-2xl shadow-xl text-white">
                        <h2 className="text-xs font-bold opacity-60 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Calculator size={16} />
                            Costing Summary
                        </h2>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center pb-4 border-b border-white/10">
                                <span className="text-sm opacity-80">Raw Material</span>
                                <span className="font-mono font-bold">₹{form.totalRawMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs opacity-70">
                                    <span>Process Cost</span>
                                    <input
                                        type="number"
                                        className="w-20 bg-white/10 border-none rounded p-1 text-right outline-none focus:ring-1 focus:ring-white/40"
                                        value={form.totalProcessCost}
                                        onChange={e => setForm({ ...form, totalProcessCost: e.target.value })}
                                    />
                                </div>
                                <div className="flex justify-between items-center text-xs opacity-70">
                                    <span>Overhead Cost</span>
                                    <input
                                        type="number"
                                        className="w-20 bg-white/10 border-none rounded p-1 text-right outline-none focus:ring-1 focus:ring-white/40"
                                        value={form.overheadCost}
                                        onChange={e => setForm({ ...form, overheadCost: e.target.value })}
                                    />
                                </div>
                                <div className="flex justify-between items-center text-xs opacity-70">
                                    <span>Labour Cost</span>
                                    <input
                                        type="number"
                                        className="w-20 bg-white/10 border-none rounded p-1 text-right outline-none focus:ring-1 focus:ring-white/40"
                                        value={form.labourCost}
                                        onChange={e => setForm({ ...form, labourCost: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/20">
                                <div className="text-xs opacity-60 uppercase font-bold tracking-tighter mb-1 text-center">Final Cost Per Unit</div>
                                <div className="text-4xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-100">
                                    ₹{form.finalProductionCostPerUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Process Flags Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Activity size={16} />
                            Process Flow
                        </h2>
                        <div className="space-y-3">
                            {Object.entries(form.processes).map(([key, value]) => (
                                <label key={key} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                    <span className="text-xs font-semibold text-gray-600 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        checked={value}
                                        onChange={e => setForm({
                                            ...form,
                                            processes: { ...form.processes, [key]: e.target.checked }
                                        })}
                                    />
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Alerts/Hints */}
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                        <AlertCircle className="text-amber-500 shrink-0" size={20} />
                        <div className="text-xs text-amber-800 leading-relaxed">
                            <span className="font-bold">Pro Tip:</span> Ensure individual item rates are updated in
                            the Item Master to get accurate BOM costing automatically.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BOMFormPage;
