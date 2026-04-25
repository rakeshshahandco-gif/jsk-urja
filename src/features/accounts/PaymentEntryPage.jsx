import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { Plus, Trash2, Save, Layers } from 'lucide-react';
import {
    getVoucherTypes, getCashBankAccounts, getLedgers,
    getOutstandingBills, createVoucher, getVoucher, updateVoucher
} from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const inp = { padding: '9px 12px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '7px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' };

const PaymentEntryPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { openModal, closeModal } = useModal();

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [cashBankAccounts, setCashBankAccounts] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { id } = useParams();
    const isEdit = !!id;

    const INITIAL_FORM_STATE = {
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
    };

    const [formData, setFormData] = useState(INITIAL_FORM_STATE);

    // Detect if launched from a Purchase Invoice
    const fromInvoice = !!(location.state?.source === 'purchase_invoice' || location.state?.invoiceId);

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

                if (vTypes.length > 0) {
                    const defaultType = vTypes.find(v => v.name.toUpperCase() === 'PAYMENT VOUCHER' || v.name.toUpperCase() === 'PAYMENT') || vTypes[0];
                    setFormData(prev => ({ ...prev, voucherTypeId: defaultType._id }));
                }
                if (cbAccs.length > 0) {
                    setFormData(prev => ({ ...prev, cashBankAccountId: cbAccs[0]._id }));
                }

                // If launched from Invoice Detail, pre-fill details
                const defaultSupplierId = location.state?.supplierId;
                const defaultSupplierName = location.state?.supplierName || 'Supplier';
                const defaultAmount = location.state?.amount || 0;
                const defaultInvoiceId = location.state?.invoiceId;
                const defaultInvoiceNo = location.state?.invoiceNumber;

                let suppLedger = null;

                if (defaultSupplierId) {
                    suppLedger = allLedgers.find(l => 
                        (l.referenceId?.toString() === defaultSupplierId?.toString() && l.referenceModel === 'Supplier') || 
                        l._id?.toString() === defaultSupplierId?.toString()
                    );
                }
                
                if (!suppLedger && defaultSupplierName) {
                    suppLedger = allLedgers.find(l => l.name?.trim().toLowerCase() === defaultSupplierName?.trim().toLowerCase());
                }

                if (suppLedger) {
                        setFormData(prev => {
                            const newItems = [...prev.items];
                            newItems[0].ledgerId = suppLedger._id;
                            newItems[0].ledgerName = suppLedger.name;
                            newItems[0].ledgerType = suppLedger.type;
                            newItems[0].amount = defaultAmount;
                            newItems[0].narration = `Against ${defaultInvoiceNo}`;

                            if (defaultInvoiceId && defaultAmount) {
                                newItems[0].adjustments = [{
                                    refId: defaultInvoiceId,
                                    refNumber: defaultInvoiceNo,
                                    amount: defaultAmount,
                                    adjustmentType: 'Against Bill',
                                    refModel: 'PurchaseInvoice'
                                }];
                            }

                            return { 
                                ...prev, 
                                items: newItems, 
                                totalAmount: defaultAmount,
                                narration: `Payment against Purchase Invoice ${defaultInvoiceNo}`
                            };
                        });
                    } else if (defaultSupplierId || defaultSupplierName) {
                        toast.error(`Supplier ledger for "${defaultSupplierName}" is not mapped. Please create or link ledger first.`, { duration: 6000 });
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
            items: [...prev.items, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', adjustments: [] }]
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

    const handleSave = async (shouldClose = false) => {
        if (!formData.cashBankAccountId) return toast.error('Select Cash/Bank account to pay from');
        if (formData.totalAmount <= 0) return toast.error('Payment amount must be greater than zero');

        if (!fromInvoice) {
            const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
            if (invalidItem) return toast.error('All payment lines must have a ledger and amount');
        }

        // Validation against original invoice amount if linked
        if (location.state?.invoiceId && location.state?.amount) {
            const linkedItem = formData.items[0];
            if (linkedItem.amount > location.state.amount) {
                return toast.error(`Amount exceeding outstanding balance (${location.state.amount}). Advance payment logic not enabled.`);
            }
        }

        setIsSubmitting(true);
        try {
            if (isEdit) {
                await updateVoucher(id, { ...formData, nature: 'Payment' });
                toast.success('Voucher updated successfully');
                navigate(PATHS.ACCOUNTS.VOUCHERS);
            } else {
                const response = await createVoucher({ ...formData, nature: 'Payment' });
                const savedNo = response?.data?.voucherNo || 'Voucher';
                toast.success(`${savedNo} saved successfully`);
                
                // If linked to an invoice, always return back
                if (fromInvoice || shouldClose) {
                    navigate(-1);
                } else {
                // RESET FORM FOR NEXT ENTRY
                setFormData(prev => ({
                    ...INITIAL_FORM_STATE,
                    voucherTypeId: prev.voucherTypeId,
                    date: prev.date,
                    cashBankAccountId: prev.cashBankAccountId,
                    instrumentType: prev.instrumentType,
                    items: [
                        { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', adjustments: [] }
                    ]
                }));
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndNew = () => handleSave(false);
    const handleSaveAndClose = () => handleSave(true);

    // ── SIMPLIFIED VIEW when opened from Purchase Invoice ───────────────────
    if (fromInvoice) {
        const invNo = location.state?.invoiceNumber || '—';
        const supplierName = location.state?.supplierName || formData.items[0]?.ledgerName || '—';
        const amount = formData.totalAmount || location.state?.amount || 0;
        const selectedAccount = cashBankAccounts.find(a => a._id === formData.cashBankAccountId);

        return (
            <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', padding: '32px 24px', color: '#1e293b' }}>
                <div style={{ maxWidth: 560, margin: '0 auto' }}>
                    <div style={{ marginBottom: 24 }}>
                        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Back to Invoice</button>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Make Payment</h1>
                        <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Confirm payment details and select account to pay from</p>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 20 }}>
                        <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', padding: '18px 24px' }}>
                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Purchase Invoice Payment</div>
                            <div style={{ color: '#fff', fontSize: 26, fontWeight: 900 }}>₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Invoice No.</span>
                                <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 6, padding: '2px 12px' }}>{invNo}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Supplier</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{supplierName}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Amount to Pay</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: '#4f46e5' }}>₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Payment Date</span>
                                <input 
                                    type="date" 
                                    name="date" 
                                    value={formData.date} 
                                    onChange={handleHeaderChange} 
                                    style={{ ...inp, width: 'auto', padding: '4px 8px', borderColor: '#4f46e5' }} 
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Narration</span>
                                <span style={{ fontSize: 12, color: '#6b7280', textAlign: 'right', maxWidth: 260 }}>{formData.narration}</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '24px', marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151', marginBottom: 10 }}>Pay From — Select Account *</label>
                        <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14, marginTop: -6 }}>Choose the bank or cash account to pay from</p>
                        <select name="cashBankAccountId" value={formData.cashBankAccountId} onChange={handleHeaderChange}
                            style={{ width: '100%', padding: '11px 14px', border: '2px solid #4f46e5', borderRadius: 9, fontSize: 14, fontWeight: 600, background: '#f5f3ff', color: '#4f46e5', outline: 'none', cursor: 'pointer', marginBottom: 16 }}>
                            {cashBankAccounts.map(a => (
                                <option key={a._id} value={a._id}>{a.accountName}  (Bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})</option>
                            ))}
                        </select>
                        {selectedAccount && <div style={{ marginBottom: 16, fontSize: 12, color: '#6b7280' }}>Current balance: <strong>₹{(selectedAccount.currentBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>}

                        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151', marginBottom: 10 }}>Payment Mode</label>
                        <select name="instrumentType" value={formData.instrumentType} onChange={handleHeaderChange}
                            style={{ width: '100%', padding: '11px 14px', border: '2px solid #e5e7eb', borderRadius: 9, fontSize: 14, fontWeight: 600, background: '#f9fafb', color: '#374151', outline: 'none', cursor: 'pointer', marginBottom: 16 }}>
                            <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                            <option value="Cash">Cash</option>
                            <option value="Cheque">Cheque</option>
                            <option value="UPI">UPI</option>
                        </select>

                        {(formData.instrumentType === 'Cheque' || formData.instrumentType === 'Bank Transfer') && (
                            <>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151', marginBottom: 8 }}>
                                    {formData.instrumentType === 'Cheque' ? 'Cheque No.' : 'UTR / Reference No.'}
                                </label>
                                <input name="instrumentNo" value={formData.instrumentNo} onChange={handleHeaderChange}
                                    placeholder={formData.instrumentType === 'Cheque' ? 'Enter cheque number' : 'Enter UTR / ref number'}
                                    style={{ width: '100%', padding: '11px 14px', border: '2px solid #e5e7eb', borderRadius: 9, fontSize: 14, background: '#f9fafb', color: '#374151', outline: 'none', boxSizing: 'border-box' }} />
                            </>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ flex: 1, padding: '13px', border: '1px solid #e5e7eb', borderRadius: 9, background: '#fff', color: '#6b7280', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Cancel</button>
                        <button onClick={handleSave} disabled={isSubmitting || loading}
                            style={{ flex: 2, padding: '13px', border: 'none', borderRadius: 9, background: isSubmitting ? '#9ca3af' : 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}>
                            {isSubmitting ? 'Saving...' : `💸  Save Payment  ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── FULL FORM for normal (non-invoice) payment entry ────────────────────
    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Back to Voucher Register
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                            💸 {isEdit ? 'Edit Payment' : 'Payment Entry'}
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Record money paid to suppliers or for expenses</p>
                    </div>
                </div>

                <div style={{ pointerEvents: isSubmitting ? 'none' : 'auto', opacity: isSubmitting ? 0.7 : 1 }}>
                    {/* Header Info */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h2 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VOUCHER DETAILS</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Voucher Type *</span>
                                {location.state?.invoiceId ? (
                                    <div style={{ ...inp, background: '#f1f5f9', fontWeight: 700, borderColor: '#cbd5e1', color: '#475569' }}>
                                       {voucherTypes.find(v => v._id === formData.voucherTypeId)?.name || 'Payment'}
                                    </div>
                                ) : (
                                    <select
                                        name="voucherTypeId"
                                        value={formData.voucherTypeId}
                                        onChange={handleHeaderChange}
                                        style={{ ...inp, cursor: 'pointer' }}
                                    >
                                        {voucherTypes.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
                                    </select>
                                )}
                            </div>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Voucher Date *</span>
                                <input
                                    type="date"
                                    name="date"
                                    value={formData.date}
                                    onChange={handleHeaderChange}
                                    style={inp}
                                />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Paid From (Cash/Bank Account) *</span>
                                <select
                                    name="cashBankAccountId"
                                    value={formData.cashBankAccountId}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: '#4f46e5', background: '#eef2ff', borderColor: '#4f46e5' }}
                                >
                                    {cashBankAccounts.map(a => (
                                        <option key={a._id} value={a._id}>
                                            {a.accountName} (Bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Instrument Type</span>
                                <select
                                    name="instrumentType"
                                    value={formData.instrumentType}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, cursor: 'pointer' }}
                                >
                                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="UPI">UPI</option>
                                </select>
                            </div>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Instrument / Ref No.</span>
                                <input name="instrumentNo" value={formData.instrumentNo} onChange={handleHeaderChange} placeholder="UTR / Cheque No" style={inp} />
                            </div>
                        </div>
                    </div>

                    {/* Entry Details */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Layers size={16} color="#4f46e5" /> ENTRY DETAILS
                            </h2>
                            <button type="button" onClick={addItem} style={{ padding: '6px 14px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Ledger Line</button>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '300px' }}>Paid To (Ledger)</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '150px' }}>Amount (₹)</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '160px' }}>Adjustment</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Narration</th>
                                        <th style={{ padding: '12px 10px', borderBottom: '2px solid #e2e8f0', width: '50px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item, index) => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px' }}>
                                                {location.state?.supplierId && index === 0 ? (
                                                    <div style={{ ...inp, background: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{item.ledgerName || (loading ? 'Loading...' : 'Not Linked')}</span>
                                                        <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Locked</span>
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
                                            <td style={{ padding: '10px' }}>
                                                <input
                                                    type="number"
                                                    min="0.01" step="0.01"
                                                    placeholder="0.00"
                                                    value={item.amount || ''}
                                                    onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                                                    style={{ ...inp, fontWeight: 800, color: '#0f172a', textAlign: 'right' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenAdjustment(item)}
                                                    disabled={!item.ledgerId || !item.amount}
                                                    style={{ width: '100%', padding: '9px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: (!item.ledgerId || !item.amount) ? 'not-allowed' : 'pointer', border: item.adjustments.length > 0 ? 'none' : '1px solid #cbd5e1', background: item.adjustments.length > 0 ? '#4f46e5' : '#fff', color: item.adjustments.length > 0 ? '#fff' : '#475569', transition: 'all 0.2s' }}
                                                >
                                                    {item.adjustments.length > 0 ? `Bill Settled` : 'Bill-Wise'}
                                                </button>
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <input
                                                    placeholder="Cheque No / Remarks"
                                                    value={item.narration}
                                                    onChange={(e) => handleItemChange(item.id, 'narration', e.target.value)}
                                                    style={inp}
                                                />
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                {formData.items.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.id)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'end' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Main Narration</span>
                            <input
                                placeholder="Overall transaction reference..."
                                name="narration"
                                value={formData.narration}
                                onChange={handleHeaderChange}
                                style={inp}
                            />
                        </div>
                        <div style={{ background: '#0f172a', color: '#fff', padding: '20px 24px', borderRadius: '14px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Payment</span>
                            <span style={{ fontSize: '28px', fontWeight: 800, color: '#f87171' }}>₹{formData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '30px' }}>
                        <button type="button" onClick={() => { if (window.confirm('Discard changes and return to list?')) navigate(PATHS.ACCOUNTS.VOUCHER_LIST); }}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                            Discard
                        </button>
                        <button type="button" onClick={handleSaveAndClose} disabled={isSubmitting}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            Save & Close
                        </button>
                        <button type="button" onClick={handleSaveAndNew} disabled={isSubmitting}
                            style={{ padding: '10px 28px', borderRadius: '8px', background: isSubmitting ? '#9ca3af' : 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Save size={18} />
                            {isSubmitting ? 'Saving...' : (isEdit ? 'Update Payment' : 'Post & New Payment')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentEntryPage;
