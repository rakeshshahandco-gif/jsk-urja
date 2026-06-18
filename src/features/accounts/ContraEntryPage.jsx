import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
    getVoucherTypes, getCashBankAccounts, createVoucher, getVoucher, updateVoucher
} from '@/services/accountApi';
import { BrandedModuleLoader } from '@/components/ui/BrandedLoading/BrandedModuleLoader';
import { PATHS } from '@/routes/paths';
import VoucherEntryTallyLayout from './components/voucherEntryTally';

const inp = {
    padding: '9px 12px', background: '#fff', border: '1.5px solid #e2e8f0',
    borderRadius: '7px', color: '#1e293b', fontSize: '13px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
};

const lbl = {
    fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '0.05em', display: 'block', marginBottom: '5px',
};

const ContraEntryPage = () => {
    const { id } = useParams();
    const isEdit = !!id;
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [voucherTypes, setVoucherTypes] = useState([]);
    const [accounts, setAccounts] = useState([]);

    const [form, setForm] = useState({
        voucherTypeId: '',
        date: new Date().toISOString().split('T')[0],
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        narration: '',
    });

    useEffect(() => {
        const load = async () => {
            try {
                const [vTypes, accs] = await Promise.all([
                    getVoucherTypes({ nature: 'Contra', active: true }),
                    getCashBankAccounts({ status: 'Active' }),
                ]);
                setVoucherTypes(vTypes);
                setAccounts(accs);

                let defaultVTypeId = vTypes[0]?._id || '';

                if (id) {
                    const voucher = await getVoucher(id);
                    const fromAcc = accs.find(a =>
                        a._id?.toString() === voucher.cashBankAccountId?.toString() ||
                        a.ledgerId?.toString() === voucher.cashBankAccountId?.toString()
                    );
                    const toItem = voucher.items?.[0];
                    const toAcc = accs.find(a => a.ledgerId?.toString() === toItem?.ledgerId?.toString());

                    setForm({
                        voucherTypeId: voucher.voucherTypeId?._id || voucher.voucherTypeId || defaultVTypeId,
                        date: voucher.date?.split('T')[0] || new Date().toISOString().split('T')[0],
                        fromAccountId: fromAcc?._id || '',
                        toAccountId: toAcc?._id || '',
                        amount: voucher.totalAmount || '',
                        narration: voucher.narration || '',
                    });
                } else {
                    setForm(prev => ({ ...prev, voucherTypeId: defaultVTypeId }));
                }
            } catch (err) {
                toast.error('Failed to load data');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleSave = async (andNew = false) => {
        if (!form.fromAccountId) return toast.error('Select the source account (From)');
        if (!form.toAccountId) return toast.error('Select the destination account (To)');
        if (form.fromAccountId === form.toAccountId) return toast.error('From and To accounts must be different');
        if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount');

        const toAcc = accounts.find(a => a._id === form.toAccountId);
        const fromAcc = accounts.find(a => a._id === form.fromAccountId);

        if (!toAcc?.ledgerId) {
            return toast.error(`No accounting ledger linked to "${toAcc?.accountName}". Go to Cash/Bank Masters to fix.`);
        }
        if (!fromAcc?.ledgerId) {
            return toast.error(`No accounting ledger linked to "${fromAcc?.accountName}". Go to Cash/Bank Masters to fix.`);
        }

        const payload = {
            nature: 'Contra',
            voucherTypeId: form.voucherTypeId,
            date: form.date,
            cashBankAccountId: form.fromAccountId,
            totalAmount: Number(form.amount),
            narration: form.narration,
            items: [{
                ledgerId: toAcc.ledgerId,
                amount: Number(form.amount),
                type: 'Debit',
                narration: form.narration,
            }],
        };

        setIsSubmitting(true);
        try {
            if (isEdit) {
                await updateVoucher(id, payload);
                toast.success('Contra entry updated');
                navigate(PATHS.ACCOUNTS.VOUCHER_LIST);
            } else {
                const res = await createVoucher(payload);
                toast.success(`${res?.data?.voucherNo || 'Contra entry'} saved`);
                if (andNew) {
                    setForm(prev => ({
                        ...prev, fromAccountId: '', toAccountId: '', amount: '', narration: '',
                    }));
                } else {
                    navigate(PATHS.ACCOUNTS.VOUCHER_LIST);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save contra entry');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <BrandedModuleLoader />;

    const fromAcc = accounts.find(a => a._id === form.fromAccountId);
    const toAcc = accounts.find(a => a._id === form.toAccountId);
    const missingLedger = (fromAcc && !fromAcc.ledgerId) || (toAcc && !toAcc.ledgerId);

    return (
        <VoucherEntryTallyLayout>
        <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {isEdit ? 'Edit Contra Entry' : 'New Contra Entry'}
                </h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                    Transfer between Cash / Bank accounts — cash deposit, bank withdrawal, inter-bank transfer
                </p>
            </div>

            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Row 1: Type + Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <label style={lbl}>Voucher Type</label>
                        <select value={form.voucherTypeId} onChange={e => handleChange('voucherTypeId', e.target.value)} style={inp}>
                            {voucherTypes.length === 0 && <option value="">— No Contra type found —</option>}
                            {voucherTypes.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
                        </select>
                        {voucherTypes.length === 0 && (
                            <small style={{ color: '#ef4444', fontSize: 11, display: 'block', marginTop: 4 }}>
                                Create a voucher type with nature "Contra" in Series Master first.
                            </small>
                        )}
                    </div>
                    <div>
                        <label style={lbl}>Date</label>
                        <input type="date" value={form.date} onChange={e => handleChange('date', e.target.value)} style={inp} />
                    </div>
                </div>

                {/* Row 2: From → To */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end' }}>
                    <div>
                        <label style={lbl}>From Account (Credit — money going out)</label>
                        <select value={form.fromAccountId} onChange={e => handleChange('fromAccountId', e.target.value)} style={inp}>
                            <option value="">— Select account —</option>
                            {accounts.map(a => (
                                <option key={a._id} value={a._id} disabled={a._id === form.toAccountId}>
                                    {a.accountName} {!a.ledgerId ? '⚠ No Ledger' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 8 }}>
                        <ArrowRight size={20} color="#94a3b8" />
                    </div>
                    <div>
                        <label style={lbl}>To Account (Debit — money coming in)</label>
                        <select value={form.toAccountId} onChange={e => handleChange('toAccountId', e.target.value)} style={inp}>
                            <option value="">— Select account —</option>
                            {accounts.map(a => (
                                <option key={a._id} value={a._id} disabled={a._id === form.fromAccountId}>
                                    {a.accountName} {!a.ledgerId ? '⚠ No Ledger' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {missingLedger && (
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <AlertTriangle size={16} color="#f97316" />
                        <span style={{ fontSize: 12, color: '#9a3412' }}>
                            One or both accounts are missing their accounting ledger link. Go to <strong>Cash/Bank Masters</strong> and click "Auto-Link" to fix.
                        </span>
                    </div>
                )}

                {/* Row 3: Amount */}
                <div style={{ maxWidth: 280 }}>
                    <label style={lbl}>Amount (₹)</label>
                    <input
                        type="number" min="0.01" step="0.01"
                        value={form.amount}
                        onChange={e => handleChange('amount', e.target.value)}
                        placeholder="0.00"
                        style={{ ...inp, fontSize: 18, fontWeight: 800, color: '#0f172a', textAlign: 'right' }}
                    />
                </div>

                {/* Row 4: Narration */}
                <div>
                    <label style={lbl}>Narration</label>
                    <input
                        value={form.narration}
                        onChange={e => handleChange('narration', e.target.value.toUpperCase())}
                        placeholder="e.g. CASH DEPOSITED TO HDFC BANK"
                        style={{ ...inp, textTransform: 'uppercase' }}
                    />
                </div>

                {/* Summary */}
                {form.fromAccountId && form.toAccountId && Number(form.amount) > 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#166534', fontWeight: 600 }}>
                        {fromAcc?.accountName} → {toAcc?.accountName} &nbsp;|&nbsp; ₹{Number(form.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                    <button type="button" onClick={() => { if (window.confirm('Discard changes?')) navigate(PATHS.ACCOUNTS.VOUCHER_LIST); }}
                        style={{ padding: '10px 20px', borderRadius: 8, background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                        Discard
                    </button>
                    {!isEdit && (
                        <button type="button" onClick={() => handleSave(false)} disabled={isSubmitting}
                            style={{ padding: '10px 20px', borderRadius: 8, background: '#fff', color: '#475569', border: '1.5px solid #cbd5e1', cursor: 'pointer', fontWeight: 600 }}>
                            Save & Close
                        </button>
                    )}
                    <button type="button" onClick={() => handleSave(!isEdit)} disabled={isSubmitting}
                        style={{ padding: '10px 24px', borderRadius: 8, background: isSubmitting ? '#9ca3af' : '#0f172a', color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Save size={16} />
                        {isSubmitting ? 'Saving...' : isEdit ? 'Update Entry' : 'Post & New'}
                    </button>
                </div>
            </div>
        </div>
        </VoucherEntryTallyLayout>
    );
};

export default ContraEntryPage;
