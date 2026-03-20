import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { Plus, Trash2, Save, Receipt } from 'lucide-react';
import {
    getVoucherTypes, getCashBankAccounts, getLedgers,
    createVoucher
} from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const ExpenseEntryPage = () => {
    const navigate = useNavigate();
    const { openModal, closeModal } = useModal();

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [cashBankAccounts, setCashBankAccounts] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        voucherTypeId: '',
        date: new Date().toISOString().split('T')[0],
        cashBankAccountId: '',
        totalAmount: 0,
        narration: '',
        items: [
            { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '' }
        ]
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vTypes, cbAccs, allLedgers] = await Promise.all([
                    getVoucherTypes({ nature: 'Expense', active: true }),
                    getCashBankAccounts({ status: 'Active' }),
                    getLedgers()
                ]);
                setVoucherTypes(vTypes);
                setCashBankAccounts(cbAccs);
                setLedgers(allLedgers);

                if (vTypes.length > 0) {
                    setFormData(prev => ({ ...prev, voucherTypeId: vTypes[0]._id }));
                }
                if (cbAccs.length > 0) {
                    setFormData(prev => ({ ...prev, cashBankAccountId: cbAccs[0]._id }));
                }
            } catch (error) {
                toast.error('Failed to load initial data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleHeaderChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleItemChange = (id, field, value) => {
        setFormData(prev => {
            const newItems = prev.items.map(item => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    if (field === 'ledgerId') {
                        const ledger = ledgers.find(l => l._id === value);
                        updated.ledgerName = ledger ? ledger.name : '';
                    }
                    return updated;
                }
                return item;
            });
            const total = newItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
            return { ...prev, items: newItems, totalAmount: total };
        });
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '' }]
        }));
    };

    const removeItem = (id) => {
        if (formData.items.length === 1) return;
        setFormData(prev => {
            const newItems = prev.items.filter(item => item.id !== id);
            const total = newItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
            return { ...prev, items: newItems, totalAmount: total };
        });
    };

    const handleSave = async () => {
        if (!formData.cashBankAccountId) return toast.error('Select Cash/Bank account');
        if (formData.totalAmount <= 0) return toast.error('Total amount must be greater than zero');

        const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
        if (invalidItem) return toast.error('All items must have a ledger and amount');

        setIsSubmitting(true);
        try {
            await createVoucher({ ...formData, nature: 'Expense' });
            toast.success('Expense voucher saved successfully');
            navigate(PATHS.ACCOUNTS.VOUCHERS);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save expense');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Expense Voucher</h1>
                    <p className="text-gray-500 text-sm mt-1">Record business expenses (Multi-line supported)</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSubmitting} className="flex items-center gap-2">
                        <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save Expense'}
                    </Button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-t-4 border-t-red-500">
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
                    <div className="space-y-2 col-span-2">
                        <label className="text-xs font-bold uppercase text-gray-500">Paid from (Cash/Bank Account)</label>
                        <Select
                            name="cashBankAccountId"
                            value={formData.cashBankAccountId}
                            onChange={handleHeaderChange}
                            options={cashBankAccounts.map(a => ({
                                label: `${a.accountName} (Bal: ₹${a.currentBalance})`,
                                value: a._id
                            }))}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b p-4 flex justify-between items-center">
                    <h3 className="text-sm font-bold uppercase text-gray-600 flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-primary" /> Expense Details
                    </h3>
                    <Button variant="ghost" size="sm" onClick={addItem} className="text-primary hover:bg-primary/5">
                        <Plus className="w-4 h-4 mr-1" /> Add Expense Line
                    </Button>
                </div>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Expense / Ledger</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase w-48">Amount (₹)</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Line Narration</th>
                            <th className="px-6 py-3 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {formData.items.map((item) => (
                            <tr key={item.id} className="group hover:bg-gray-50/30 transition-colors">
                                <td className="px-6 py-4">
                                    <SearchableSelect
                                        options={ledgers.map(l => ({ label: l.name, value: l._id }))}
                                        value={item.ledgerId}
                                        onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                        placeholder="Search expense head..."
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={item.amount || ''}
                                        onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                                        className="font-mono font-bold"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Input
                                        placeholder="Bill No / Remarks"
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
                </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase text-gray-500">Main Narration</label>
                    <Input
                        placeholder="Overall transaction reference..."
                        name="narration"
                        value={formData.narration}
                        onChange={handleHeaderChange}
                    />
                </div>
                <div className="bg-gray-900 text-white p-6 rounded-xl shadow-lg flex justify-between items-center">
                    <span className="text-sm text-gray-400 font-semibold uppercase">Total Expense</span>
                    <span className="text-3xl font-bold">₹{formData.totalAmount.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
};

export default ExpenseEntryPage;
