import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { Plus, Trash2, Save, Layers } from 'lucide-react';
import {
    getVoucherTypes, getCashBankAccounts, getLedgers,
    getOutstandingBills, createVoucher
} from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const PaymentEntryPage = () => {
    const navigate = useNavigate();
    const { openModal, closeModal } = useModal();

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [cashBankAccounts, setCashBankAccounts] = useState([]);
    const [ledgers, setLedgers] = useState([]);

    const [formData, setFormData] = useState({
        voucherTypeId: '',
        date: new Date().toISOString().split('T')[0],
        cashBankAccountId: '',
        totalAmount: 0,
        narration: '',
        instrumentType: 'Bank Transfer',
        instrumentNo: '',
        items: [
            { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', adjustments: [] }
        ]
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vTypes, cbAccs, allLedgers] = await Promise.all([
                    getVoucherTypes({ nature: 'Payment', active: true }),
                    getCashBankAccounts({ status: 'Active' }),
                    getLedgers()
                ]);
                setVoucherTypes(vTypes);
                setCashBankAccounts(cbAccs);
                setLedgers(allLedgers);

                if (vTypes.length > 0) setFormData(prev => ({ ...prev, voucherTypeId: vTypes[0]._id }));
                if (cbAccs.length > 0) setFormData(prev => ({ ...prev, cashBankAccountId: cbAccs[0]._id }));
            } catch (error) {
                toast.error('Failed to load initial data');
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
                        updated.ledgerType = ledger ? ledger.type : 'General';
                        updated.adjustments = [];
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
            items: [...prev, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', adjustments: [] }]
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

    const BillAdjustmentPopup = ({ itemId, ledgerId, amountToAdjust }) => {
        const [bills, setBills] = useState([]);
        const [selectedBills, setSelectedBills] = useState([]);
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            const fetchBills = async () => {
                setLoading(true);
                try {
                    const data = await getOutstandingBills(ledgerId);
                    setBills(data);
                } catch (error) {
                    toast.error('Failed to fetch outstanding bills');
                } finally {
                    setLoading(false);
                }
            };
            fetchBills();
        }, [ledgerId]);

        const totalSelected = selectedBills.reduce((sum, b) => sum + b.amount, 0);

        const toggleBill = (bill) => {
            setSelectedBills(prev => {
                const exists = prev.find(b => b.refId === bill._id);
                if (exists) return prev.filter(b => b.refId !== bill._id);

                const remaining = amountToAdjust - totalSelected;
                const billBalance = bill.grandTotal - bill.paidAmount;
                const amount = Math.min(remaining, billBalance);

                return [...prev, {
                    refId: bill._id,
                    refNumber: bill.invoiceNumber,
                    amount: amount,
                    adjustmentType: 'Against Bill',
                    refModel: 'PurchaseInvoice'
                }];
            });
        };

        const handleConfirm = () => {
            const finalAdjustments = [...selectedBills];
            if (totalSelected < amountToAdjust) {
                finalAdjustments.push({
                    adjustmentType: 'On Account',
                    amount: amountToAdjust - totalSelected
                });
            }
            handleItemChange(itemId, 'adjustments', finalAdjustments);
            closeModal();
        };

        return (
            <div className="space-y-4 pt-4">
                <div className="flex justify-between items-center bg-primary/5 p-3 rounded-lg border border-primary/20">
                    <span className="font-medium text-gray-700 text-sm">Amount to Adjusted: <span className="text-primary font-bold">₹{amountToAdjust}</span></span>
                    <span className="font-medium text-green-600 text-sm">Selected: ₹{totalSelected}</span>
                </div>

                <div className="max-h-[300px] overflow-y-auto border rounded-xl shadow-inner bg-white">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Select</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Invoice #</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Date</th>
                                <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400 text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                            {bills.map(bill => (
                                <tr key={bill._id} className="hover:bg-blue-50/50 transition-colors">
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedBills.some(s => s.refId === bill._id)}
                                            onChange={() => toggleBill(bill)}
                                            className="w-4 h-4 rounded text-primary"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-sm">{bill.invoiceNumber}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(bill.invoiceDate).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-sm font-bold text-red-600 text-right">₹{(bill.grandTotal - bill.paidAmount).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {bills.length === 0 && !loading && (
                        <div className="p-10 text-center text-gray-400 italic text-sm">No outstanding purchase invoices found.</div>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button onClick={handleConfirm}>Confirm Adjustments</Button>
                </div>
            </div>
        );
    };

    const handleOpenAdjustment = (item) => {
        if (!item.ledgerId || !item.amount) return toast.error('Set supplier ledger and amount first');
        if (item.ledgerType !== 'Supplier') {
            handleItemChange(item.id, 'adjustments', [{ adjustmentType: 'On Account', amount: item.amount }]);
            return toast.success('Non-supplier ledger: Adjusted on account');
        }
        openModal({
            title: `Bill Adjustment - ${item.ledgerName}`,
            content: <BillAdjustmentPopup itemId={item.id} ledgerId={item.ledgerId} amountToAdjust={item.amount} />,
            size: 'lg'
        });
    };

    const handleSave = async () => {
        if (!formData.cashBankAccountId) return toast.error('Select Cash/Bank account to pay from');
        if (formData.totalAmount <= 0) return toast.error('Payment amount must be greater than zero');

        const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
        if (invalidItem) return toast.error('All payment lines must have a ledger and amount');

        try {
            await createVoucher(formData);
            toast.success('Payment voucher saved successfully');
            navigate(PATHS.ACCOUNTS.VOUCHERS);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save payment');
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Payment Entry</h1>
                    <p className="text-gray-500 font-medium mt-1 text-sm">Record money paid to suppliers or for expenses</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="ghost" className="font-semibold text-gray-500" onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}>Cancel</Button>
                    <Button onClick={handleSave} className="flex items-center gap-2 px-8 font-bold">
                        <Save className="w-4 h-4" /> Save Payment
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1 bg-white p-6 rounded-xl border border-gray-200 border-t-4 border-t-primary shadow-sm space-y-4">
                    <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Voucher Info</h3>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 uppercase">Voucher Type</label>
                        <Select
                            name="voucherTypeId"
                            value={formData.voucherTypeId}
                            onChange={handleHeaderChange}
                            options={voucherTypes.map(v => ({ label: v.name, value: v._id }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 uppercase">Date</label>
                        <Input
                            type="date"
                            name="date"
                            value={formData.date}
                            onChange={handleHeaderChange}
                        />
                    </div>
                </div>

                <div className="md:col-span-3 bg-white p-6 rounded-xl border border-gray-200 border-t-4 border-t-primary shadow-sm space-y-4">
                    <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Payment Source (From Cash/Bank)</h3>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 uppercase">Paid From Account</label>
                        <Select
                            name="cashBankAccountId"
                            value={formData.cashBankAccountId}
                            onChange={handleHeaderChange}
                            options={cashBankAccounts.map(a => ({
                                label: `${a.accountName} (Balance: ₹${a.currentBalance.toLocaleString()})`,
                                value: a._id
                            }))}
                            className="text-lg font-bold"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-gray-600 uppercase">Instrument Type</label>
                            <Select
                                name="instrumentType"
                                value={formData.instrumentType}
                                onChange={handleHeaderChange}
                                options={[
                                    { label: 'Bank Transfer (NEFT/RTGS)', value: 'Bank Transfer' },
                                    { label: 'Cash', value: 'Cash' },
                                    { label: 'Cheque', value: 'Cheque' },
                                    { label: 'UPI', value: 'UPI' }
                                ]}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-gray-600 uppercase">Instrument / Ref No.</label>
                            <Input name="instrumentNo" value={formData.instrumentNo} onChange={handleHeaderChange} placeholder="UTR / Cheque No" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b p-4 flex justify-between items-center">
                    <h3 className="text-sm font-black uppercase text-gray-600 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" /> Multi-Line Payments
                    </h3>
                    <Button variant="outline" size="sm" onClick={addItem} className="text-primary hover:bg-primary/5 font-bold">
                        <Plus className="w-4 h-4 mr-2" /> Add Ledger Line
                    </Button>
                </div>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-200/30">
                            <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Paid To (Ledger)</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest w-48">Amount (₹)</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest w-40">Adjustment</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Line Narration</th>
                            <th className="px-6 py-4 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 italic">
                        {formData.items.map((item, index) => (
                            <tr key={item.id} className="group hover:bg-gray-50 transition-colors not-italic">
                                <td className="px-6 py-4">
                                    <SearchableSelect
                                        options={ledgers.map(l => ({ label: l.name, value: l._id, type: l.type }))}
                                        value={item.ledgerId}
                                        onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                        placeholder="Select supplier or expense..."
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={item.amount}
                                        onChange={(e) => handleItemChange(item.id, 'amount', e.target.value)}
                                        className="text-lg font-black font-mono"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <Button
                                        variant={item.adjustments.length > 0 ? 'primary' : 'outline'}
                                        size="sm"
                                        className="w-full text-[10px] font-black uppercase"
                                        onClick={() => handleOpenAdjustment(item)}
                                        disabled={!item.ledgerId || !item.amount}
                                    >
                                        {item.adjustments.length > 0 ? `Bill Settled` : 'Bill-Wise'}
                                    </Button>
                                </td>
                                <td className="px-6 py-4">
                                    <Input
                                        placeholder="Line notes..."
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
                                        className="text-gray-200 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-8 py-4">
                <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Overall Payment Narration</label>
                        <Input
                            placeholder="Add a detailed remark..."
                            name="narration"
                            value={formData.narration}
                            onChange={handleHeaderChange}
                            className="bg-gray-50 border-gray-200 h-16 rounded-xl"
                        />
                    </div>
                </div>
                <div className="w-full md:w-80">
                    <div className="bg-gray-900 text-white p-8 rounded-2xl shadow-xl flex flex-col items-center">
                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">Grand Total</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl text-gray-400 font-bold">₹</span>
                            <span className="text-4xl font-black tabular-nums tracking-tighter">
                                {formData.totalAmount.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentEntryPage;
