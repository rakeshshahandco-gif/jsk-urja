import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { Plus, Trash2, Save, BookOpen, AlertCircle } from 'lucide-react';
import {
    getVoucherTypes, getLedgers, createVoucher
} from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const JournalEntryPage = () => {
    const navigate = useNavigate();

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        voucherTypeId: '',
        date: new Date().toISOString().split('T')[0],
        narration: '',
        items: [
            { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '' },
            { id: Date.now() + 1, ledgerId: '', ledgerName: '', amount: 0, type: 'Credit', narration: '' }
        ]
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vTypes, allLedgers] = await Promise.all([
                    getVoucherTypes({ nature: 'Journal', active: true }),
                    getLedgers()
                ]);
                setVoucherTypes(vTypes);
                setLedgers(allLedgers);

                if (vTypes.length > 0) {
                    setFormData(prev => ({ ...prev, voucherTypeId: vTypes[0]._id }));
                }
            } catch (error) {
                toast.error('Failed to load initial data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const totals = formData.items.reduce((acc, item) => {
        if (item.type === 'Debit') acc.debit += (item.amount || 0);
        else acc.credit += (item.amount || 0);
        return acc;
    }, { debit: 0, credit: 0 });

    const difference = Math.abs(totals.debit - totals.credit);
    const isBalanced = difference < 0.01 && totals.debit > 0;

    const handleHeaderChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleItemChange = (id, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    if (field === 'ledgerId') {
                        const ledger = ledgers.find(l => l._id === value);
                        updated.ledgerName = ledger ? ledger.name : '';
                    }
                    return updated;
                }
                return item;
            })
        }));
    };

    const addItem = (type = 'Debit') => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type, narration: '' }]
        }));
    };

    const removeItem = (id) => {
        if (formData.items.length <= 2) return;
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const handleSave = async () => {
        if (!isBalanced) return toast.error('Journal entry must be balanced (Total Dr = Total Cr)');
        
        const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
        if (invalidItem) return toast.error('All items must have a ledger and amount');

        setIsSubmitting(true);
        try {
            await createVoucher({ ...formData, nature: 'Journal', totalAmount: totals.debit });
            toast.success('Journal entry saved successfully');
            navigate(PATHS.ACCOUNTS.VOUCHERS);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save journal');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Journal Voucher</h1>
                    <p className="text-gray-500 text-sm mt-1">Double-entry adjustments (Total Dr must equal Total Cr)</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSubmitting || !isBalanced} className="flex items-center gap-2">
                        <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save Journal'}
                    </Button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-t-4 border-t-blue-500">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-gray-500">Voucher Type</label>
                        <Select
                            name="voucherTypeId"
                            value={formData.voucherTypeId}
                            onChange={handleHeaderChange}
                            options={voucherTypes.map(v => ({ label: v.name, value: v._id }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-gray-500">Voucher Date</label>
                        <Input type="date" name="date" value={formData.date} onChange={handleHeaderChange} />
                    </div>
                    <div className="col-span-2 flex items-center justify-end px-4">
                        {!isBalanced && totals.debit > 0 && (
                            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-200 animate-pulse">
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-sm font-bold tracking-tight uppercase">Out of Balance: ₹{difference.toLocaleString()}</span>
                            </div>
                        )}
                        {isBalanced && (
                            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                                <span className="text-sm font-bold tracking-tight uppercase">Entry is Balanced</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b p-4 flex justify-between items-center">
                    <h3 className="text-sm font-bold uppercase text-gray-600 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-primary" /> Entry Lines
                    </h3>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => addItem('Debit')} className="text-blue-600 hover:bg-blue-50">
                            <Plus className="w-4 h-4 mr-1" /> Add Dr
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => addItem('Credit')} className="text-red-600 hover:bg-red-50">
                            <Plus className="w-4 h-4 mr-1" /> Add Cr
                        </Button>
                    </div>
                </div>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase w-24">Dr / Cr</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Account / Ledger</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase w-48 text-right">Amount (₹)</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Narration</th>
                            <th className="px-6 py-3 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {formData.items.map((item) => (
                            <tr key={item.id} className={`group hover:bg-gray-50/30 transition-colors ${item.type === 'Debit' ? 'border-l-4 border-l-blue-400' : 'border-l-4 border-l-red-400'}`}>
                                <td className="px-6 py-4">
                                    <select
                                        className={`w-full bg-transparent font-bold text-sm outline-none ${item.type === 'Debit' ? 'text-blue-700' : 'text-red-700'}`}
                                        value={item.type}
                                        onChange={(e) => handleItemChange(item.id, 'type', e.target.value)}
                                    >
                                        <option value="Debit">Dr</option>
                                        <option value="Credit">Cr</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4">
                                    <SearchableSelect
                                        options={ledgers.map(l => ({ label: l.name, value: l._id }))}
                                        value={item.ledgerId}
                                        onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                        placeholder="Search ledger..."
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={item.amount || ''}
                                        onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                                        className="font-mono font-bold text-right"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Input
                                        placeholder="Line remarks"
                                        value={item.narration}
                                        onChange={(e) => handleItemChange(item.id, 'narration', e.target.value)}
                                        className="text-xs"
                                    />
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeItem(item.id)}
                                        className="text-gray-300 hover:text-red-500"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-gray-900 text-white font-bold">
                            <td colSpan={2} className="px-6 py-4 text-right uppercase text-xs tracking-widest text-gray-400">Totals</td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex flex-col">
                                    <div className="flex justify-between text-blue-400">
                                        <span>Dr:</span>
                                        <span>₹{totals.debit.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-red-400">
                                        <span>Cr:</span>
                                        <span>₹{totals.credit.toLocaleString()}</span>
                                    </div>
                                </div>
                            </td>
                            <td colSpan={2} className="px-6 py-4">
                                {isBalanced ? (
                                    <div className="text-green-400 text-center text-xs">BALANCED</div>
                                ) : (
                                    <div className="text-amber-400 text-center text-xs uppercase animate-pulse">Difference: ₹{difference.toLocaleString()}</div>
                                )}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-gray-500">Main Narration</label>
                <Input
                    placeholder="Overall transaction reference..."
                    name="narration"
                    value={formData.narration}
                    onChange={handleHeaderChange}
                    className="bg-white"
                />
            </div>
        </div>
    );
};

export default JournalEntryPage;
