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
import { useNavigate, useLocation } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const ReceiptEntryPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
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
        instrumentType: 'Cash',
        instrumentNo: '',
        items: [
            { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Credit', narration: '', adjustments: [] }
        ]
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vTypes, cbAccs, allLedgers] = await Promise.all([
                    getVoucherTypes({ nature: 'Receipt', active: true }),
                    getCashBankAccounts({ status: 'Active' }),
                    getLedgers()
                ]);
                setVoucherTypes(vTypes);
                setCashBankAccounts(cbAccs);
                setLedgers(allLedgers);

                if (vTypes.length > 0) {
                    const defaultType = vTypes.find(v => v.name.toUpperCase() === 'RECEIPT VOUCHER' || v.name.toUpperCase() === 'RECEIPT') || vTypes[0];
                    setFormData(prev => ({ ...prev, voucherTypeId: defaultType._id }));
                }
                if (cbAccs.length > 0) {
                    setFormData(prev => ({ ...prev, cashBankAccountId: cbAccs[0]._id }));
                }

                // If launched from Invoice Detail, pre-fill details
                const defaultCustomerId = location.state?.customerId;
                const defaultCustomerName = location.state?.customerName || 'Customer';
                const defaultAmount = location.state?.amount || 0;
                const defaultInvoiceId = location.state?.invoiceId;
                const defaultInvoiceNo = location.state?.invoiceNumber;

                if (defaultCustomerId) {
                    const custLedger = allLedgers.find(l => 
                        (l.referenceId?.toString() === defaultCustomerId?.toString() && l.referenceModel === 'Customer') || 
                        l._id?.toString() === defaultCustomerId?.toString()
                    );
                    if (custLedger) {
                        setFormData(prev => {
                            const newItems = [...prev.items];
                            newItems[0].ledgerId = custLedger._id;
                            newItems[0].ledgerName = custLedger.name;
                            newItems[0].ledgerType = custLedger.type;
                            newItems[0].amount = defaultAmount;
                            newItems[0].narration = `Against ${defaultInvoiceNo}`;

                            if (defaultInvoiceId && defaultAmount) {
                                newItems[0].adjustments = [{
                                    refId: defaultInvoiceId,
                                    refNumber: defaultInvoiceNo,
                                    amount: defaultAmount,
                                    adjustmentType: 'Against Bill',
                                    refModel: 'SalesInvoice'
                                }];
                            }

                            return { 
                                ...prev, 
                                items: newItems, 
                                totalAmount: defaultAmount,
                                narration: `Receipt against Sales Invoice ${defaultInvoiceNo}`
                            };
                        });
                    } else {
                        toast.error(`Customer ledger for "${defaultCustomerName}" is not mapped. Please create or link ledger first.`, { duration: 6000 });
                    }
                }

            } catch (error) {
                toast.error('Failed to load initial data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [location.state]);

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
            items: [...prev, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Credit', narration: '', adjustments: [] }]
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
                const billBalance = bill.roundedTotal - bill.paidAmount;
                const amount = Math.min(remaining, billBalance);

                return [...prev, {
                    refId: bill._id,
                    refNumber: bill.invoiceNumber,
                    amount: amount,
                    adjustmentType: 'Against Bill',
                    refModel: 'SalesInvoice'
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
                    <span className="font-medium">Amount to Adjusted: <span className="text-primary font-bold">₹{amountToAdjust}</span></span>
                    <span className="font-medium text-green-600">Selected: ₹{totalSelected}</span>
                </div>

                <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white">
                            <tr className="bg-gray-50 border-b">
                                <th className="px-4 py-2 text-xs font-semibold uppercase">Select</th>
                                <th className="px-4 py-2 text-xs font-semibold uppercase">Invoice #</th>
                                <th className="px-4 py-2 text-xs font-semibold uppercase">Date</th>
                                <th className="px-4 py-2 text-xs font-semibold uppercase text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {bills.map(bill => (
                                <tr key={bill._id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedBills.some(s => s.refId === bill._id)}
                                            onChange={() => toggleBill(bill)}
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-sm">{bill.invoiceNumber}</td>
                                    <td className="px-4 py-2 text-sm">{new Date(bill.invoiceDate).toLocaleDateString()}</td>
                                    <td className="px-4 py-2 text-sm font-semibold text-right">₹{bill.roundedTotal - bill.paidAmount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {bills.length === 0 && !loading && <div className="p-10 text-center text-gray-400">No outstanding invoices</div>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button onClick={handleConfirm}>Confirm Adjustments</Button>
                </div>
            </div>
        );
    };

    const handleOpenAdjustment = (item) => {
        if (!item.ledgerId || !item.amount) return toast.error('Set ledger and amount first');
        if (item.ledgerType !== 'Customer') {
            handleItemChange(item.id, 'adjustments', [{ adjustmentType: 'On Account', amount: item.amount }]);
            return toast.success('Non-customer ledger: Adjusted on account');
        }
        openModal({
            title: `Bill Adjustment - ${item.ledgerName}`,
            content: <BillAdjustmentPopup itemId={item.id} ledgerId={item.ledgerId} amountToAdjust={item.amount} />,
            size: 'lg'
        });
    };

    const handleSave = async () => {
        if (!formData.cashBankAccountId) return toast.error('Select Cash/Bank account');
        if (formData.totalAmount <= 0) return toast.error('Entry amount must be greater than zero');

        const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
        if (invalidItem) return toast.error('All items must have a ledger and amount');

        // Validation against original invoice amount if linked
        if (location.state?.invoiceId && location.state?.amount) {
            const linkedItem = formData.items[0];
            if (linkedItem.amount > location.state.amount) {
                return toast.error(`Amount exceeding outstanding balance (${location.state.amount}). Advance receipt logic not enabled.`);
            }
        }

        setIsSubmitting(true);
        try {
            await createVoucher({ ...formData, nature: 'Receipt' });
            toast.success('Receipt saved successfully');
            navigate(PATHS.ACCOUNTS.VOUCHERS);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save receipt');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Receipt Entry</h1>
                    <p className="text-gray-500 text-sm mt-1">Record money received from customers or other sources</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSubmitting} className="flex items-center gap-2">
                        <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save Receipt'}
                    </Button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-t-4 border-t-green-500">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-gray-500">Voucher Type</label>
                        {location.state?.invoiceId ? (
                             <div className="font-bold text-gray-800 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 cursor-not-allowed text-sm h-10 flex items-center">
                                {voucherTypes.find(v => v._id === formData.voucherTypeId)?.name || 'Receipt'}
                             </div>
                        ) : (
                            <Select
                                name="voucherTypeId"
                                value={formData.voucherTypeId}
                                onChange={handleHeaderChange}
                                options={voucherTypes.map(v => ({ label: v.name, value: v._id }))}
                            />
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-gray-500">Voucher Date</label>
                        {location.state?.invoiceId ? (
                             <div className="font-bold text-gray-800 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 cursor-not-allowed text-sm h-10 flex items-center">
                                {formData.date}
                             </div>
                        ) : (
                            <Input
                                type="date"
                                name="date"
                                value={formData.date}
                                onChange={handleHeaderChange}
                            />
                        )}
                    </div>
                    <div className="space-y-2 col-span-2">
                        <label className="text-xs font-bold uppercase text-gray-500">Deposit Into (Cash/Bank Account)</label>
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
                        <Layers className="w-4 h-4 text-primary" /> Entry Details
                    </h3>
                    <Button variant="ghost" size="sm" onClick={addItem} className="text-primary hover:bg-primary/5">
                        <Plus className="w-4 h-4 mr-1" /> Add Multi-line
                    </Button>
                </div>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Received From (Ledger)</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase w-48">Amount (₹)</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase w-40">Adjustment</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Line Narration</th>
                            <th className="px-6 py-3 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {formData.items.map((item, index) => (
                            <tr key={item.id} className="group hover:bg-gray-50/30 transition-colors">
                                <td className="px-6 py-4">
                                    {(location.state?.source === 'sales_invoice' || location.state?.customerId) && index === 0 ? (
                                        <div className="font-bold text-gray-800 bg-gray-50 px-3 py-2 rounded-lg border border-teal-200 cursor-not-allowed text-sm flex items-center justify-between">
                                            <span>{item.ledgerName || (loading ? 'Loading...' : 'Not Linked')}</span>
                                            <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded uppercase tracking-tighter ml-2">Locked</span>
                                        </div>
                                    ) : (
                                        <SearchableSelect
                                            options={ledgers.map(l => ({ label: l.name, value: l._id, type: l.type }))}
                                            value={item.ledgerId}
                                            onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                            placeholder="Search ledger..."
                                        />
                                    )}
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
                                    <Button
                                        variant={item.adjustments.length > 0 ? 'primary' : 'outline'}
                                        size="sm"
                                        className="w-full text-xs"
                                        onClick={() => handleOpenAdjustment(item)}
                                        disabled={!item.ledgerId || !item.amount}
                                    >
                                        {item.adjustments.length > 0 ? `Adjusted (${item.adjustments.length})` : 'Auto / Bill'}
                                    </Button>
                                </td>
                                <td className="px-6 py-4 uppercase">
                                    <Input
                                        placeholder="Cheque No / Remarks"
                                        value={item.narration}
                                        onChange={(e) => handleItemChange(item.id, 'narration', e.target.value)}
                                        className="text-xs"
                                    />
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {!(location.state?.customerId && index === 0) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeItem(item.id)}
                                            className="text-gray-300 hover:text-red-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
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
                    <span className="text-sm text-gray-400 font-semibold uppercase">Total Receipt</span>
                    <span className="text-3xl font-bold">₹{formData.totalAmount.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
};

export default ReceiptEntryPage;
