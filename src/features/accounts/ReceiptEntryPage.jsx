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

const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };

const ReceiptEntryPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { openModal, closeModal } = useModal();

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [cashBankAccounts, setCashBankAccounts] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const INITIAL_FORM_STATE = {
        voucherTypeId: '',
        date: new Date().toISOString().split('T')[0],
        cashBankAccountId: '',
        totalAmount: 0,
        narration: '',
        instrumentType: 'Cash',
        instrumentNo: '',
        items: [
            { 
                id: Date.now(), 
                ledgerId: '', 
                ledgerName: '', 
                amount: 0, 
                type: 'Credit', 
                narration: '', 
                adjustments: []
            }
        ]
    };

    const [formData, setFormData] = useState(INITIAL_FORM_STATE);

    // Detect if launched from a Sales Invoice
    const fromInvoice = !!(location.state?.source === 'sales_invoice' || location.state?.invoiceId);

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
            } catch (error) {
                console.error('FetchData Error:', error);
                toast.error('Failed to load initial data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Effect for handling incoming state (e.g. from Sales Invoice)
    useEffect(() => {
        if (!location.state?.invoiceId && !location.state?.customerId) return;

        const defaultAmount = location.state?.amount || 0;
        const defaultInvoiceNo = location.state?.invoiceNumber;
        const defaultInvoiceId = location.state?.invoiceId;
        const customerId = location.state?.customerId;
        const customerName = location.state?.customerName;

        // Try to find the correct ledger in our loaded list
        let targetLedgerId = location.state?.ledgerId || '';
        let targetLedgerName = location.state?.ledgerName || '';

        if (!targetLedgerId && ledgers.length > 0) {
            // Match by referenceId (CustomerId)
            const matchedByRef = ledgers.find(l => l.referenceId?.toString() == customerId?.toString());
            if (matchedByRef) {
                targetLedgerId = matchedByRef._id;
                targetLedgerName = matchedByRef.name;
            } else {
                // Match by name
                const matchedByName = ledgers.find(l => l.name?.trim().toLowerCase() === customerName?.trim().toLowerCase());
                if (matchedByName) {
                    targetLedgerId = matchedByName._id;
                    targetLedgerName = matchedByName.name;
                }
            }
        }

        setFormData(prev => ({
            ...prev,
            totalAmount: defaultAmount,
            narration: defaultInvoiceNo ? `Receipt against Sales Invoice ${defaultInvoiceNo}` : prev.narration,
            items: [{
                ...prev.items[0],
                ledgerId: targetLedgerId,
                ledgerName: targetLedgerName,
                amount: defaultAmount,
                narration: defaultInvoiceNo ? `Against ${defaultInvoiceNo}` : prev.items[0].narration,
                adjustments: defaultInvoiceId ? [{
                    refId: defaultInvoiceId,
                    refNumber: defaultInvoiceNo,
                    amount: defaultAmount,
                    adjustmentType: 'Against Bill',
                    refModel: 'SalesInvoice'
                }] : []
            }]
        }));
    }, [location.state, ledgers]);

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
            items: [...prev.items, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Credit', narration: '', adjustments: [] }]
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

    const handleSave = async (shouldClose = false) => {
        if (!formData.cashBankAccountId) return toast.error('Select Cash/Bank account');
        if (formData.totalAmount <= 0) return toast.error('Entry amount must be greater than zero');

        if (!fromInvoice) {
            const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
            if (invalidItem) return toast.error('All items must have a ledger and amount');
        }

        const firstItem = formData.items[0];
        if (!firstItem?.ledgerId) return toast.error('Ledger selection required');

        setIsSubmitting(true);
        try {
            const response = await createVoucher({ 
                ...formData, 
                nature: 'Receipt',
                voucherType: formData.voucherTypeId 
            });
            const savedNo = response?.data?.voucherNo || 'Voucher';
            toast.success(`${savedNo} saved successfully`);
            
            if (fromInvoice || shouldClose) {
                navigate(-1);
            } else {
                // RESET FOR NEXT ENTRY (KEEP DATE/ACCOUNTS)
                setFormData(prev => ({
                    ...INITIAL_FORM_STATE,
                    voucherTypeId: prev.voucherTypeId,
                    date: prev.date,
                    cashBankAccountId: prev.cashBankAccountId,
                    instrumentType: prev.instrumentType,
                    items: [{ 
                        id: Date.now(), 
                        ledgerId: '', 
                        ledgerName: '', 
                        amount: 0, 
                        type: 'Credit', 
                        narration: '', 
                        adjustments: []
                    }]
                }));
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save receipt');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndNew = () => handleSave(false);
    const handleSaveAndClose = () => handleSave(true);

    // ── SIMPLIFIED VIEW when opened from Sales Invoice ──────────────────────
    if (fromInvoice) {
        const invNo = location.state?.invoiceNumber || '—';
        const custName = location.state?.customerName || formData.items[0]?.ledgerName || '—';
        const amount = formData.totalAmount || location.state?.amount || 0;
        const selectedAccount = cashBankAccounts.find(a => a._id === formData.cashBankAccountId);

        return (
            <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', padding: '32px 24px', color: '#1e293b' }}>
                <div style={{ maxWidth: 560, margin: '0 auto' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 24 }}>
                        <button
                            onClick={() => navigate(-1)}
                            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}
                        >← Back to Invoice</button>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Record Payment</h1>
                        <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Confirm payment details and select account</p>
                    </div>

                    {/* Invoice Summary Card */}
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 20 }}>
                        <div style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', padding: '18px 24px' }}>
                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Invoice Payment</div>
                            <div style={{ color: '#fff', fontSize: 26, fontWeight: 900 }}>₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>

                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Bill No */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Invoice No.</span>
                                <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '2px 12px' }}>{invNo}</span>
                            </div>

                            {/* Customer */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Customer / Party</span>
                                <div style={{ 
                                    width: 240, 
                                    padding: '8px 12px', 
                                    background: '#f0fdf4', 
                                    border: '1px solid #86efac', 
                                    borderRadius: 7, 
                                    fontSize: 14, 
                                    fontWeight: 700, 
                                    color: '#166534',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span>{custName}</span>
                                    <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Linked</span>
                                </div>
                            </div>
                            {/* Amount */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Amount to Receive</span>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ position: 'absolute', left: 10, fontWeight: 700, color: '#0d9488' }}>₹</span>
                                    <input
                                        type="number"
                                        value={formData.totalAmount || ''}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setFormData(prev => {
                                                const newItems = [...prev.items];
                                                if (newItems.length > 0) {
                                                    newItems[0].amount = val;
                                                    // Also update adjustment if it was automated
                                                    if (newItems[0].adjustments?.length === 1 && newItems[0].adjustments[0].adjustmentType === 'Against Bill') {
                                                        newItems[0].adjustments[0].amount = val;
                                                    }
                                                }
                                                return { ...prev, totalAmount: val, items: newItems };
                                            });
                                        }}
                                        style={{ ...inp, width: 140, padding: '6px 10px 6px 22px', fontSize: 15, fontWeight: 800, color: '#0d9488', textAlign: 'right', border: '2px solid #0d9488', background: '#f0fdfa' }}
                                    />
                                </div>
                            </div>
                            {/* Date */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Receipt Date</span>
                                <input
                                    type="date"
                                    name="date"
                                    value={formData.date}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, width: 140, padding: '6px 10px', fontSize: 13, fontWeight: 600, color: '#374151', textAlign: 'right' }}
                                />
                            </div>
                            {/* Instrument Mode */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Receipt Mode</span>
                                <select name="instrumentType" value={formData.instrumentType} onChange={handleHeaderChange}
                                    style={{ ...inp, width: 140, padding: '6px 10px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}>
                                    <option value="Cash">Cash</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="UPI">UPI/QR</option>
                                </select>
                            </div>
                            {/* Narration */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, paddingTop: 6 }}>Narration</span>
                                <textarea
                                    name="narration"
                                    value={formData.narration}
                                    onChange={handleHeaderChange}
                                    placeholder="Enter narration..."
                                    style={{ ...inp, width: '100%', maxWidth: 260, height: 60, padding: '8px 10px', fontSize: 12, color: '#4b5563', resize: 'vertical', textAlign: 'left' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Only user-fillable field: Cash/Bank Account */}
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '24px', marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151', marginBottom: 10 }}>
                            Deposit Into — Select Account *
                        </label>
                        <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14, marginTop: -6 }}>Choose how the payment was received (Cash, Bank, or Other)</p>
                        <select
                            name="cashBankAccountId"
                            value={formData.cashBankAccountId}
                            onChange={handleHeaderChange}
                            style={{ width: '100%', padding: '11px 14px', border: '2px solid #0d9488', borderRadius: 9, fontSize: 14, fontWeight: 600, background: '#f0fdfa', color: '#0d9488', outline: 'none', cursor: 'pointer', marginBottom: (formData.instrumentType !== 'Cash') ? 16 : 0 }}
                        >
                            {cashBankAccounts.map(a => (
                                <option key={a._id} value={a._id}>
                                    {a.accountName}  (Bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})
                                </option>
                            ))}
                        </select>
                        {(formData.instrumentType !== 'Cash') && (
                            <>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#374151', marginBottom: 8 }}>
                                    {formData.instrumentType} Ref / No.
                                </label>
                                <input name="instrumentNo" value={formData.instrumentNo} onChange={handleHeaderChange}
                                    placeholder={`Enter ${formData.instrumentType} number`}
                                    style={{ ...inp, borderRadius: 9, padding: '11px 14px' }} />
                            </>
                        )}
                        {selectedAccount && (
                            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                                Current balance: <strong>₹{(selectedAccount.currentBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }}
                            style={{ flex: 1, padding: '13px', border: '1px solid #e5e7eb', borderRadius: 9, background: '#fff', color: '#6b7280', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                        >Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={isSubmitting || loading}
                            style={{ flex: 2, padding: '13px', border: 'none', borderRadius: 9, background: isSubmitting ? '#9ca3af' : 'linear-gradient(135deg,#0d9488,#0891b2)', color: '#fff', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(13,148,136,0.35)' }}
                        >
                            {isSubmitting ? 'Saving...' : `💳  Save Receipt  ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── FULL FORM for normal (non-invoice) entry ────────────────────────────
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
                            🧾 Receipt Entry
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Record money received from customers or other sources</p>
                    </div>
                </div>

                <div style={{ pointerEvents: isSubmitting ? 'none' : 'auto', opacity: isSubmitting ? 0.7 : 1 }}>
                    {/* Header Info */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h2 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RECEIPT DETAILS</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Voucher Type *</span>
                                {location.state?.invoiceId ? (
                                    <div style={{ ...inp, background: '#f1f5f9', fontWeight: 700, borderColor: '#cbd5e1', color: '#475569' }}>
                                       {voucherTypes.find(v => v._id === formData.voucherTypeId)?.name || 'Receipt'}
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
                                {location.state?.invoiceId ? (
                                    <div style={{ ...inp, background: '#f1f5f9', fontWeight: 700, borderColor: '#cbd5e1', color: '#475569' }}>
                                       {formData.date}
                                    </div>
                                ) : (
                                    <input
                                        type="date"
                                        name="date"
                                        value={formData.date}
                                        onChange={handleHeaderChange}
                                        style={inp}
                                    />
                                )}
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Deposit Into (Cash/Bank Account) *</span>
                                <select
                                    name="cashBankAccountId"
                                    value={formData.cashBankAccountId}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: '#0d9488', background: '#f0fdfa', borderColor: '#0d9488' }}
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
                                    <option value="Cash">Cash</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="UPI">UPI/QR</option>
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
                                <Layers size={16} color="#2563eb" /> ENTRY DETAILS
                            </h2>
                            <button type="button" onClick={addItem} style={{ padding: '6px 14px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Multi-line</button>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '300px' }}>Received From (Ledger)</th>
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
                                                {(location.state?.source === 'sales_invoice' || location.state?.customerId) && index === 0 ? (
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
                                                    style={{ width: '100%', padding: '9px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: (!item.ledgerId || !item.amount) ? 'not-allowed' : 'pointer', border: item.adjustments.length > 0 ? 'none' : '1px solid #cbd5e1', background: item.adjustments.length > 0 ? '#3b82f6' : '#fff', color: item.adjustments.length > 0 ? '#fff' : '#475569', transition: 'all 0.2s' }}
                                                >
                                                    {item.adjustments.length > 0 ? `Adjusted (${item.adjustments.length})` : 'Auto / Bill'}
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
                                                {!(location.state?.customerId && index === 0) && (
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
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Receipt</span>
                            <span style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>₹{formData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '30px' }}>
                        <button type="button" onClick={() => { if (window.confirm('Discard changes and return to list?')) navigate(PATHS.ACCOUNTS.VOUCHERS); }}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                            Discard
                        </button>
                        <button type="button" onClick={handleSaveAndClose} disabled={isSubmitting}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            Save & Close
                        </button>
                        <button type="button" onClick={handleSaveAndNew} disabled={isSubmitting}
                            style={{ padding: '10px 28px', borderRadius: '8px', background: isSubmitting ? '#9ca3af' : '#2563eb', color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Save size={18} />
                            {isSubmitting ? 'Saving...' : 'Post & New Receipt'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReceiptEntryPage;
