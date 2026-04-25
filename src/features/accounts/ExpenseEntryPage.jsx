import React, { useState, useEffect, useMemo } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { 
    Plus, Trash2, Save, Receipt, CreditCard, Landmark, Wallet, 
    Layers, Calendar, FileText, CheckCircle2, AlertCircle, Percent
} from 'lucide-react';
import {
    getVoucherTypes, getCashBankAccounts, getLedgers, getAccountGroups,
    createVoucher, createLedger, getVoucher, updateVoucher
} from '@/services/accountApi';
import LedgerForm from './components/LedgerForm';
import { toast } from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const inp = { padding: '10px 14px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'all 0.2s' };
const labelStyle = { fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' };

const ExpenseEntryPage = () => {
    const navigate = useNavigate();
    const { openModal, closeModal } = useModal();

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [cashBankAccounts, setCashBankAccounts] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { id } = useParams();
    const isEdit = !!id;

    const INITIAL_FORM_STATE = {
        voucherTypeId: '',
        expenseType: 'Cash', // Cash, Bank, Credit, Petty Cash
        date: new Date().toISOString().split('T')[0],
        cashBankAccountId: '',
        partyId: '', // Supplier ledger for Credit Expense
        partyName: '',
        supplierBillNo: '',
        supplierBillDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        
        // GST Fields
        isGstEnabled: false,
        gstType: 'CGST / SGST',
        placeOfSupply: '',
        supplierGstin: '',
        totalTaxableAmount: 0,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 0,

        totalAmount: 0, // Legacy/Simple Total
        narration: '',
        items: [
            { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', hsnCode: '', gstRate: 0 }
        ]
    };

    const [formData, setFormData] = useState(INITIAL_FORM_STATE);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vTypes, cbAccs, allLedgers, allGroups] = await Promise.all([
                    getVoucherTypes({ nature: 'Expense', active: true }),
                    getCashBankAccounts({ status: 'Active' }),
                    getLedgers(),
                    getAccountGroups()
                ]);
                setVoucherTypes(vTypes);
                setCashBankAccounts(cbAccs);
                setLedgers(allLedgers);
                setGroups(allGroups);

                if (vTypes.length > 0) {
                    setFormData(prev => ({ ...prev, voucherTypeId: vTypes[0]._id }));
                }
                const cashAcc = cbAccs.find(a => a.accountType === 'Cash');
                if (cashAcc) {
                    setFormData(prev => ({ ...prev, cashBankAccountId: cashAcc._id }));
                }
            } catch (error) {
                toast.error('Failed to load initial data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Effect for loading existing voucher data in edit mode
    useEffect(() => {
        if (isEdit && ledgers.length > 0) {
            const fetchVoucherData = async () => {
                try {
                    const response = await getVoucher(id);
                    if (!response) throw new Error('Voucher not found');
                    
                    setFormData({
                        ...response,
                        date: response.date ? new Date(response.date).toISOString().split('T')[0] : '',
                        supplierBillDate: response.supplierBillDate ? new Date(response.supplierBillDate).toISOString().split('T')[0] : '',
                        dueDate: response.dueDate ? new Date(response.dueDate).toISOString().split('T')[0] : '',
                        voucherTypeId: response.voucherType?._id || response.voucherType,
                        cashBankAccountId: response.cashBankAccountId?._id || response.cashBankAccountId,
                        partyId: response.partyId?._id || response.partyId,
                        items: response.items.map(item => ({
                            ...item,
                            id: item._id || Date.now() + Math.random(),
                            ledgerId: item.ledgerId?._id || item.ledgerId,
                            ledgerName: item.ledgerId?.name || item.ledgerName
                        }))
                    });
                } catch (error) {
                    console.error('FetchVoucher Error:', error);
                    toast.error('Failed to load expense for editing');
                    navigate(PATHS.ACCOUNTS.VOUCHERS);
                }
            };
            fetchVoucherData();
        }
    }, [id, isEdit, ledgers.length]);

    // Helper for Real-time Totals
    const calculateTotals = (items, isGst, gstType) => {
        let taxable = 0, cgst = 0, sgst = 0, igst = 0;
        const isIGST = gstType === 'IGST';

        items.forEach(item => {
            const amt = parseFloat(item.amount || 0);
            taxable += amt;
            if (isGst && item.gstRate > 0) {
                if (isIGST) {
                    igst += r2(amt * item.gstRate / 100);
                } else {
                    cgst += r2(amt * (item.gstRate / 2) / 100);
                    sgst += r2(amt * (item.gstRate / 2) / 100);
                }
            }
        });

        const rawTotal = taxable + cgst + sgst + igst;
        const rounded = Math.round(rawTotal);
        const ro = r2(rounded - rawTotal);

        return {
            totalTaxableAmount: r2(taxable),
            totalCgst: r2(cgst),
            totalSgst: r2(sgst),
            totalIgst: r2(igst),
            totalTax: r2(cgst + sgst + igst),
            roundOff: ro,
            grandTotal: rounded,
            totalAmount: isGst ? rounded : taxable
        };
    };

    // Combined Account List for Header (Cash + Bank + Suppliers)
    const combinedHeaderAccounts = useMemo(() => {
        const cb = cashBankAccounts.map(a => ({
            value: a._id,
            label: `${a.accountName} (${a.accountType})`,
            type: a.accountType, // Cash or Bank
            balance: a.currentBalance,
            isCB: true
        }));
        
        const suppliers = ledgers.filter(l => l.type === 'Supplier' || l.groupName?.includes('Creditors')).map(l => ({
            value: l._id,
            label: `${l.name} (Supplier)`,
            type: 'Credit',
            balance: l.currentBalance,
            isCB: false
        }));

        return [...cb, ...suppliers];
    }, [cashBankAccounts, ledgers]);

    const handleAccountChange = (val) => {
        const acc = combinedHeaderAccounts.find(a => a.value === val);
        if (!acc) return;

        const partyLedger = !acc.isCB ? ledgers.find(l => l._id === val) : null;
        const supplierState = (partyLedger?.state || '').trim().toUpperCase();
        const homeState = 'MAHARASHTRA';
        const isLocal = supplierState === homeState || supplierState === '';

        setFormData(prev => {
            const next = {
                ...prev,
                expenseType: acc.type === 'Cash' || acc.type === 'Bank' ? acc.type : 'Credit',
                cashBankAccountId: acc.isCB ? acc.value : null,
                partyId: !acc.isCB ? acc.value : null,
                partyName: !acc.isCB ? acc.label.replace(' (Supplier)', '') : '',
                placeOfSupply: partyLedger?.state || prev.placeOfSupply,
                gstType: isLocal ? 'CGST / SGST' : 'IGST'
            };
            const totals = calculateTotals(next.items, next.isGstEnabled, next.gstType);
            return { ...next, ...totals };
        });
    };

    const handleQuickCreateLedger = (searchTerm, targetField = 'expenseItem') => {
        const defaultGroupName = targetField === 'header' ? 'Sundry Creditors' : 'Indirect Expenses';
        const defaultGroup = groups.find(g => g.name === defaultGroupName);

        openModal({
            title: `Quick Create Ledger: ${searchTerm}`,
            size: 'lg',
            content: (
                <LedgerForm 
                    initial={{ name: searchTerm, underGroup: defaultGroup?._id }}
                    groups={groups}
                    onCancel={closeModal}
                    onSave={async (data) => {
                        try {
                            const newLedger = await createLedger(data);
                            toast.success('Ledger created successfully');
                            
                            // Refresh lists
                            const [lData, cbData] = await Promise.all([getLedgers(), getCashBankAccounts({ status: 'Active' })]);
                            setLedgers(lData);
                            setCashBankAccounts(cbData);

                            // Auto-select based on where it was created
                            if (targetField === 'header') {
                                // We need to determine if it's a CB or Supplier
                                const isCB = data.underGroup === groups.find(g => g.name === 'Bank Accounts' || g.name === 'Cash-in-hand')?._id;
                                setFormData(prev => ({
                                    ...prev,
                                    expenseType: isCB ? 'Cash' : 'Credit',
                                    cashBankAccountId: isCB ? newLedger._id : null,
                                    partyId: !isCB ? newLedger._id : null,
                                    partyName: !isCB ? newLedger.name : ''
                                }));
                            } else if (targetField.startsWith('item-')) {
                                const itemId = parseInt(targetField.split('-')[1]);
                                handleItemChange(itemId, 'ledgerId', newLedger._id);
                            }

                            closeModal();
                        } catch (err) {
                            toast.error(err.response?.data?.message || 'Failed to create ledger');
                        }
                    }}
                />
            )
        });
    };

    const handleHeaderChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        
        setFormData(prev => {
            const next = { ...prev, [name]: val };
            if (name === 'isGstEnabled' || name === 'gstType') {
                const totals = calculateTotals(next.items, next.isGstEnabled, next.gstType);
                return { ...next, ...totals };
            }
            return next;
        });
    };

    const handleItemChange = (id, field, value) => {
        setFormData(prev => {
            let isAnyGstEnabled = prev.isGstEnabled;
            const newItems = prev.items.map(item => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    
                    if (field === 'ledgerId') {
                        const ledger = ledgers.find(l => l._id === value);
                        updated.ledgerName = ledger ? ledger.name : '';
                        
                        // Auto-sync GST Rate and HSN from Ledger Master
                        if (ledger?.gstRate > 0 || ledger?.hsnCode) {
                            if (ledger.gstRate > 0) {
                                updated.gstRate = ledger.gstRate;
                                isAnyGstEnabled = true; // Auto-enable GST if rate found
                            }
                            if (ledger.hsnCode) {
                                updated.hsnCode = ledger.hsnCode;
                            }
                        }
                    }
                    return updated;
                }
                return item;
            });
            const totals = calculateTotals(newItems, isAnyGstEnabled, prev.gstType);
            return { ...prev, items: newItems, isGstEnabled: isAnyGstEnabled, ...totals };
        });
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', hsnCode: '', gstRate: 0 }]
        }));
    };

    const removeItem = (id) => {
        if (formData.items.length === 1) return;
        setFormData(prev => {
            const newItems = prev.items.filter(item => item.id !== id);
            const totals = calculateTotals(newItems, prev.isGstEnabled, prev.gstType);
            return { ...prev, items: newItems, ...totals };
        });
    };

    const handleSave = async (shouldClose = false) => {
        // Validation
        if (!formData.partyId && !formData.cashBankAccountId) {
            return toast.error('Please select an Account or Party (where the expense is paid from or booked to)');
        }

        if (formData.totalAmount <= 0) return toast.error('Total amount must be greater than zero');

        const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
        if (invalidItem) return toast.error('All items must have a ledger and amount');

        setIsSubmitting(true);
        try {
            // Sanitize payload: Ensure empty IDs are null
            const payload = {
                ...formData,
                nature: 'Expense',
                partyId: formData.partyId || null,
                cashBankAccountId: formData.cashBankAccountId || null,
                items: formData.items.map(item => ({
                    ...item,
                    ledgerId: item.ledgerId || null
                }))
            };

            if (isEdit) {
                await updateVoucher(id, payload);
                toast.success('Expense updated successfully');
                navigate(PATHS.ACCOUNTS.VOUCHERS);
            } else {
                const response = await createVoucher(payload);
                const savedNo = response?.data?.voucherNo || 'Voucher';
                toast.success(`${savedNo} saved successfully`);
                
                // STAY ON PAGE FOR FAST ENTRY (Reset but keep date and vType)
                setFormData(prev => ({
                    ...INITIAL_FORM_STATE,
                    date: prev.date,
                    voucherTypeId: prev.voucherTypeId,
                    expenseType: prev.expenseType,
                    cashBankAccountId: prev.cashBankAccountId,
                    items: [{ id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', hsnCode: '', gstRate: 0 }]
                }));
                
                // If explicit close requested (optional flag)
                if (shouldClose) {
                    navigate(PATHS.ACCOUNTS.VOUCHER_LIST || PATHS.ACCOUNTS.VOUCHERS);
                }
            }
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.response?.data?.message || 'Failed to save expense');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndNew = () => handleSave(false);
    const handleSaveAndClose = () => handleSave(true);


    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.ACCOUNTS.VOUCHER_LIST || PATHS.ACCOUNTS.VOUCHERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Back to Voucher Register
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                            💸 {isEdit ? 'Edit Expense' : 'Expense Voucher'}
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Record business expenses with optional GST Input Credit</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '8px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: formData.isGstEnabled ? '#8b5cf6' : '#64748b' }}>
                            {formData.isGstEnabled ? 'GST Enabled' : 'Simple Mode'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                name="isGstEnabled"
                                checked={formData.isGstEnabled}
                                onChange={handleHeaderChange}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>
                </div>

                <div style={{ pointerEvents: isSubmitting ? 'none' : 'auto', opacity: isSubmitting ? 0.7 : 1 }}>
                    

                    {/* Header Info */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                            <div>
                                <span style={labelStyle}>Series Type *</span>
                                <select name="voucherTypeId" value={formData.voucherTypeId} onChange={handleHeaderChange} style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>
                                    {voucherTypes.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={labelStyle}>Voucher Date *</span>
                                <input type="date" name="date" value={formData.date} onChange={handleHeaderChange} style={{ ...inp, fontWeight: 600 }} />
                            </div>
                            
                             <div style={{ gridColumn: 'span 2' }}>
                                <span style={labelStyle}>Account / Party (Cash, Bank or Supplier) *</span>
                                <SearchableSelect
                                    options={combinedHeaderAccounts}
                                    value={formData.cashBankAccountId || formData.partyId}
                                    onChange={handleAccountChange}
                                    placeholder="Search Cash/Bank or Supplier..."
                                    onCreateNew={(term) => handleQuickCreateLedger(term, 'header')}
                                />
                            </div>
                        </div>

                        {(formData.expenseType === 'Credit' || formData.isGstEnabled) && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                <div>
                                    <span style={labelStyle}>Supplier Bill No</span>
                                    <input placeholder="INV-123" name="supplierBillNo" value={formData.supplierBillNo} onChange={handleHeaderChange} style={inp} />
                                </div>
                                <div>
                                    <span style={labelStyle}>Bill Date</span>
                                    <input type="date" name="supplierBillDate" value={formData.supplierBillDate} onChange={handleHeaderChange} style={inp} />
                                </div>
                                {formData.isGstEnabled && (
                                    <div>
                                        <span style={labelStyle}>GST Type *</span>
                                        <select name="gstType" value={formData.gstType} onChange={handleHeaderChange} style={{ ...inp, fontWeight: 700, color: '#4f46e5' }}>
                                            <option value="CGST / SGST">Intra-state (CGST/SGST)</option>
                                            <option value="IGST">Inter-state (IGST)</option>
                                        </select>
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                                    {formData.isGstEnabled ? <CheckCircle2 size={20} color="#10b981" /> : <FileText size={20} />}
                                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                                        {formData.isGstEnabled ? 'GST Invoice Mode' : 'Bill Booking Mode'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Entry Details */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Layers size={18} color="#6366f1" /> {formData.isGstEnabled ? 'TAXABLE EXPENSES' : 'EXPENSE HEADS (DR)'}
                            </h2>
                            <button type="button" onClick={addItem} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Plus size={14} /> Add Line
                            </button>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                    <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Expense Ledger</th>
                                        {formData.isGstEnabled && <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, width: '120px' }}>HSN/SAC</th>}
                                        <th style={{ padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, width: '160px' }}>{formData.isGstEnabled ? 'Taxable Amt' : 'Amount'} (₹)</th>
                                        {formData.isGstEnabled && <th style={{ padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, width: '100px' }}>GST %</th>}
                                        <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Narration</th>
                                        <th style={{ padding: '12px 10px', borderBottom: '2px solid #f1f5f9', width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item) => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 10px' }}>
                                                <SearchableSelect
                                                    options={ledgers.filter(l => 
                                                        ['Expenses', 'Income'].includes(l.nature) || 
                                                        ['Expense', 'Income'].includes(l.type) || 
                                                        l.groupName?.toLowerCase().includes('expenses') || 
                                                        l.groupName?.toLowerCase().includes('income') ||
                                                        !['Cash', 'Bank', 'Customer', 'Supplier'].includes(l.type) // Fallback: show general ledgers
                                                    ).map(l => ({ label: l.name, value: l._id }))}
                                                    value={item.ledgerId}
                                                    onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                                    placeholder="Select Expense..."
                                                    onCreateNew={(term) => handleQuickCreateLedger(term, `item-${item.id}`)}
                                                />
                                            </td>
                                            {formData.isGstEnabled && (
                                                <td style={{ padding: '12px 10px' }}>
                                                    <input placeholder="Code" value={item.hsnCode} onChange={(e) => handleItemChange(item.id, 'hsnCode', e.target.value)} style={inp} />
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 10px' }}>
                                                <input
                                                    type="number"
                                                    min="0.01" step="0.01"
                                                    placeholder="0.00"
                                                    value={item.amount || ''}
                                                    onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                                                    style={{ ...inp, fontWeight: 900, color: '#0f172a', textAlign: 'right' }}
                                                />
                                            </td>
                                            {formData.isGstEnabled && (
                                                <td style={{ padding: '12px 10px' }}>
                                                    <select 
                                                        value={item.gstRate} 
                                                        onChange={(e) => handleItemChange(item.id, 'gstRate', Number(e.target.value))} 
                                                        style={{ ...inp, fontWeight: 700, textAlign: 'center' }}
                                                    >
                                                        <option value="0">0%</option>
                                                        <option value="5">5%</option>
                                                        <option value="12">12%</option>
                                                        <option value="18">18%</option>
                                                        <option value="28">28%</option>
                                                    </select>
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 10px' }}>
                                                <input
                                                    placeholder="Remarks"
                                                    value={item.narration}
                                                    onChange={(e) => handleItemChange(item.id, 'narration', e.target.value)}
                                                    style={inp}
                                                />
                                            </td>
                                            <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                {formData.items.length > 1 && (
                                                    <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
                        <div>
                            <span style={labelStyle}>Overall Voucher Narration</span>
                            <textarea
                                placeholder="Details about this expense (shown in reports)..."
                                name="narration"
                                value={formData.narration}
                                onChange={handleHeaderChange}
                                style={{ ...inp, minHeight: '80px', resize: 'none' }}
                            />
                        </div>

                        {formData.isGstEnabled ? (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                        <span>Sub-total (Taxable)</span>
                                        <span style={{ fontWeight: 600 }}>₹{formData.totalTaxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {formData.gstType === 'CGST / SGST' ? (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                                <span>Input CGST</span>
                                                <span style={{ fontWeight: 600 }}>₹{formData.totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                                <span>Input SGST</span>
                                                <span style={{ fontWeight: 600 }}>₹{formData.totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                            <span>Input IGST</span>
                                            <span style={{ fontWeight: 600 }}>₹{formData.totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                                        <span>Round Off</span>
                                        <span>{formData.roundOff >= 0 ? '+' : ''}{formData.roundOff.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', margin: '8px -20px -20px', padding: '16px 20px', borderRadius: '0 0 16px 16px' }}>
                                        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>Grand Total</span>
                                        <span style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>₹{formData.grandTotal.toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#0f172a', color: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</span>
                                <span style={{ fontSize: '32px', fontWeight: 900, color: '#fca5a5', letterSpacing: '-0.02em' }}>₹{formData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-end', marginTop: '36px' }}>
                        <button type="button" onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }}
                            style={{ padding: '12px 28px', borderRadius: '10px', background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', cursor: 'pointer', fontWeight: 700 }}>
                            Discard
                        </button>
                        <button type="button" onClick={handleSaveAndClose} disabled={isSubmitting}
                            style={{ padding: '12px 28px', borderRadius: '10px', background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                            Save & Close
                        </button>
                        <button type="button" onClick={handleSaveAndNew} disabled={isSubmitting}
                            style={{ padding: '12px 40px', borderRadius: '10px', background: isSubmitting ? '#9ca3af' : 'linear-gradient(135deg,#4f46e5,#3730a3)', color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '15px', boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Save size={18} />
                            {isSubmitting ? 'Posting...' : (isEdit ? 'Update Expense' : 'Post & New Entry')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExpenseEntryPage;
