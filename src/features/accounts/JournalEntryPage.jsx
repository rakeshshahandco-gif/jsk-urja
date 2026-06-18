import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { Plus, Trash2, Save, BookOpen, AlertCircle } from 'lucide-react';
import {
    getVoucherTypes, getLedgers, getCashBankAccounts, getAccountGroups, createVoucher, createLedger, getVoucher, updateVoucher
} from '@/services/accountApi';
import LedgerForm from './components/LedgerForm';
import { toast } from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import VoucherEntryTallyLayout from './components/voucherEntryTally';

const inp = { padding: '9px 12px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '7px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' };

const JournalEntryPage = () => {

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { id } = useParams();
    const isEdit = !!id;

    const INITIAL_FORM_STATE = {
        voucherTypeId: '',
        date: new Date().toISOString().split('T')[0],
        narration: '',
        items: [
            { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '' },
            { id: Date.now() + 1, ledgerId: '', ledgerName: '', amount: 0, type: 'Credit', narration: '' }
        ]
    };

    const [formData, setFormData] = useState(INITIAL_FORM_STATE);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vTypes, allLedgers, allGroups] = await Promise.all([
                    getVoucherTypes({ nature: 'Journal', active: true }),
                    getLedgers(),
                    getAccountGroups()
                ]);
                setVoucherTypes(vTypes);
                setLedgers(allLedgers);
                setGroups(allGroups);

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

    // Load voucher for editing
    useEffect(() => {
        if (isEdit && ledgers.length > 0) {
            const fetchVoucherData = async () => {
                try {
                    const response = await getVoucher(id);
                    if (!response) throw new Error('Voucher not found');
                    
                    setFormData({
                        ...response,
                        date: response.date ? new Date(response.date).toISOString().split('T')[0] : '',
                        voucherTypeId: response.voucherType?._id || response.voucherType,
                        items: response.items.map(item => ({
                            ...item,
                            id: item._id || Date.now() + Math.random(),
                            ledgerId: item.ledgerId?._id || item.ledgerId,
                            ledgerName: item.ledgerId?.name || item.ledgerName
                        }))
                    });
                } catch (error) {
                    console.error('FetchVoucher Error:', error);
                    toast.error('Failed to load voucher for editing');
                    navigate(PATHS.ACCOUNTS.VOUCHERS);
                }
            };
            fetchVoucherData();
        }
    }, [id, isEdit, ledgers.length]);

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

    const handleQuickCreateLedger = (searchTerm, targetItemId) => {
        openModal({
            title: `Quick Create Ledger: ${searchTerm}`,
            size: 'lg',
            content: (
                <LedgerForm 
                    initial={{ name: searchTerm }}
                    groups={groups}
                    onCancel={closeModal}
                    onSave={async (data) => {
                        try {
                            const newLedger = await createLedger(data);
                            toast.success('Ledger created successfully');
                            
                            // Refresh lists
                            const [lData, cbData] = await Promise.all([
                                getLedgers(),
                                getCashBankAccounts({ status: 'Active' })
                            ]);
                            setLedgers(lData);

                            // Select it
                            handleItemChange(targetItemId, 'ledgerId', newLedger._id);
                            closeModal();
                        } catch (err) {
                            toast.error(err.response?.data?.message || 'Failed to create ledger');
                        }
                    }}
                />
            )
        });
    };

    const handleSave = async () => {
        if (!isBalanced) return toast.error('Journal entry must be balanced (Total Dr = Total Cr)');
        
        const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
        if (invalidItem) return toast.error('All items must have a ledger and amount');

        setIsSubmitting(true);
        try {
            if (isEdit) {
                await updateVoucher(id, { ...formData, nature: 'Journal', totalAmount: totals.debit });
                toast.success('Journal updated successfully');
                navigate(PATHS.ACCOUNTS.VOUCHERS);
            } else {
                const response = await createVoucher({ ...formData, nature: 'Journal', totalAmount: totals.debit });
                const savedNo = response?.data?.voucherNo || 'Voucher';
                toast.success(`${savedNo} saved successfully`);
                
                // Stay on page and reset (KEEP DATE)
                setFormData(prev => ({
                    ...INITIAL_FORM_STATE,
                    date: prev.date,
                    voucherTypeId: prev.voucherTypeId,
                items: [
                    { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '' },
                    { id: Date.now() + 1, ledgerId: '', ledgerName: '', amount: 0, type: 'Credit', narration: '' }
                ]
            }));

            if (shouldClose) {
                navigate(PATHS.ACCOUNTS.VOUCHERS);
            }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save journal');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndNew = () => handleSave(false);
    const handleSaveAndClose = () => handleSave(true);

    return (
        <VoucherEntryTallyLayout>
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.ACCOUNTS.VOUCHERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Back to Voucher Register
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                            ⚖️ {isEdit ? 'Edit Journal' : 'Journal Voucher'}
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Double-entry adjustments (Total Dr must equal Total Cr)</p>
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
                            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                                {!isBalanced && totals.debit > 0 && (
                                    <div style={{ padding: '10px 16px', background: '#fffbeb', border: '1px solid #fde68a', color: '#d97706', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <AlertCircle size={16} />
                                        OUT OF BALANCE: ₹{difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                )}
                                {isBalanced && totals.debit > 0 && (
                                    <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        ENTRY IS BALANCED
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Entry Details */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <BookOpen size={16} color="#0891b2" /> ENTRY LINES
                            </h2>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" onClick={() => addItem('Debit')} style={{ padding: '6px 14px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Dr</button>
                                <button type="button" onClick={() => addItem('Credit')} style={{ padding: '6px 14px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Cr</button>
                            </div>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '80px' }}>Dr / Cr</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '250px' }}>Account / Ledger</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '150px' }}>Amount (₹)</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Narration</th>
                                        <th style={{ padding: '12px 10px', borderBottom: '2px solid #e2e8f0', width: '50px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item) => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', borderLeft: item.type === 'Debit' ? '4px solid #60a5fa' : '4px solid #f87171' }}>
                                            <td style={{ padding: '10px' }}>
                                                <select
                                                    value={item.type}
                                                    onChange={(e) => handleItemChange(item.id, 'type', e.target.value)}
                                                    style={{ ...inp, border: 'none', background: 'transparent', padding: 0, fontWeight: 800, color: item.type === 'Debit' ? '#1d4ed8' : '#b91c1c', cursor: 'pointer' }}
                                                >
                                                    <option value="Debit">Dr</option>
                                                    <option value="Credit">Cr</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <SearchableSelect
                                                    options={ledgers.map(l => ({ 
                                                        label: l.name, 
                                                        value: l._id, 
                                                        group: l.groupName || l.accountGroupName || 'General',
                                                        balance: l.currentBalance || 0,
                                                        gst: l.gstNumber,
                                                        phone: l.phone,
                                                        type: l.type 
                                                    }))}
                                                    renderOption={(opt) => (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '2px 0' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{opt.label}</span>
                                                                <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>{opt.group}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                                                                <span>{opt.gst ? `GST: ${opt.gst}` : (opt.phone ? `📞 ${opt.phone}` : 'No details')}</span>
                                                                <span style={{ fontWeight: 800, color: opt.balance >= 0 ? '#10b981' : '#ef4444' }}>
                                                                    ₹{Math.abs(opt.balance).toLocaleString('en-IN')} {opt.balance >= 0 ? 'Dr' : 'Cr'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    value={item.ledgerId}
                                                    onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                                    placeholder="Search ledger..."
                                                    onCreateNew={(term) => handleQuickCreateLedger(term, item.id)}
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
                                                    placeholder="Line remarks"
                                                    value={item.narration}
                                                    onChange={(e) => handleItemChange(item.id, 'narration', e.target.value)}
                                                    style={inp}
                                                />
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                {formData.items.length > 2 && (
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
                                <tfoot>
                                    <tr style={{ background: '#0f172a', color: '#fff' }}>
                                        <td colSpan={2} style={{ padding: '12px 14px', textAlign: 'right', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>Totals</td>
                                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#60a5fa', fontWeight: 700, fontSize: '13px' }}>
                                                    <span>Dr:</span>
                                                    <span>₹{totals.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f87171', fontWeight: 700, fontSize: '13px' }}>
                                                    <span>Cr:</span>
                                                    <span>₹{totals.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td colSpan={2} style={{ padding: '12px 14px' }}>
                                            {isBalanced ? (
                                                <div style={{ color: '#4ade80', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>BALANCED</div>
                                            ) : (
                                                <div style={{ color: '#fbbf24', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                                                    Diff: ₹{difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '20px', alignItems: 'end' }}>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Main Narration</span>
                            <input
                                placeholder="Overall transaction reference..."
                                name="narration"
                                value={formData.narration}
                                onChange={handleHeaderChange}
                                style={inp}
                            />
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
                        <button type="button" onClick={handleSaveAndNew} disabled={isSubmitting || !isBalanced}
                            style={{ padding: '10px 28px', borderRadius: '8px', background: (isSubmitting || !isBalanced) ? '#9ca3af' : 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: '#fff', border: 'none', cursor: (isSubmitting || !isBalanced) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Save size={18} />
                            {isSubmitting ? 'Saving...' : (isEdit ? 'Update Journal' : 'Post & New Journal')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </VoucherEntryTallyLayout>
    );
};

export default JournalEntryPage;
