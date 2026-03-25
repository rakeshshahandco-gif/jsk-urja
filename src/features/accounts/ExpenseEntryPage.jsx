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

const inp = { padding: '9px 12px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '7px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' };

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
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Back to Voucher Register
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                            💸 Expense Voucher
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Record business expenses (Multi-line supported)</p>
                    </div>
                </div>

                <div style={{ pointerEvents: isSubmitting ? 'none' : 'auto', opacity: isSubmitting ? 0.7 : 1 }}>
                    {/* Header Info */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h2 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VOUCHER DETAILS</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Voucher Type *</span>
                                <select
                                    name="voucherTypeId"
                                    value={formData.voucherTypeId}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, cursor: 'pointer' }}
                                >
                                    {voucherTypes.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
                                </select>
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
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Paid from (Cash/Bank Account) *</span>
                                <select
                                    name="cashBankAccountId"
                                    value={formData.cashBankAccountId}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: '#e11d48', background: '#fff1f2', borderColor: '#e11d48' }}
                                >
                                    {cashBankAccounts.map(a => (
                                        <option key={a._id} value={a._id}>
                                            {a.accountName} (Bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Entry Details */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Receipt size={16} color="#e11d48" /> EXPENSE DETAILS
                            </h2>
                            <button type="button" onClick={addItem} style={{ padding: '6px 14px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Expense Line</button>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '300px' }}>Expense / Ledger</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '200px' }}>Amount (₹)</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Narration</th>
                                        <th style={{ padding: '12px 10px', borderBottom: '2px solid #e2e8f0', width: '50px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item) => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px' }}>
                                                <SearchableSelect
                                                    options={ledgers.map(l => ({ label: l.name, value: l._id }))}
                                                    value={item.ledgerId}
                                                    onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                                    placeholder="Search expense head..."
                                                />
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
                                                <input
                                                    placeholder="Bill No / Remarks"
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
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Expense</span>
                            <span style={{ fontSize: '28px', fontWeight: 800, color: '#fda4af' }}>₹{formData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '30px' }}>
                        <button type="button" onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                            Cancel
                        </button>
                        <button type="button" onClick={handleSave} disabled={isSubmitting}
                            style={{ padding: '10px 28px', borderRadius: '8px', background: isSubmitting ? '#9ca3af' : 'linear-gradient(135deg,#e11d48,#be123c)', color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Save size={18} />
                            {isSubmitting ? 'Saving...' : 'Save Expense'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExpenseEntryPage;
