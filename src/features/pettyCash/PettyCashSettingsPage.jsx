import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { pettyCashApi } from '@/services/pettyCashApi';
import { getLedgers, getCashBankAccounts } from '@/services/accountApi';
import { useFinancialYear } from '@/contexts/FinancialYearContext';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, maxWidth: 640 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const lbl = { fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' };

export default function PettyCashSettingsPage() {
    const { selectedFY } = useFinancialYear();
    const [ledgers, setLedgers] = useState([]);
    const [cashBanks, setCashBanks] = useState([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        openingBalance: 0,
        pettyCashLedgerId: '',
        pettyCashCashBankAccountId: '',
        replenishmentCashBankAccountId: '',
    });

    useEffect(() => {
        (async () => {
            try {
                const [lg, cb, settings] = await Promise.all([
                    getLedgers(),
                    getCashBankAccounts(),
                    pettyCashApi.getSettings(selectedFY),
                ]);
                setLedgers(lg?.data || lg || []);
                setCashBanks(cb?.data || cb || []);
                if (settings) {
                    const pettyLedger =
                        settings.pettyCashLedgerId
                        || (lg?.data || lg || []).find((l) => /^petty cash$/i.test(l.name || ''))?._id
                        || '';
                    const cashList = cb?.data || cb || [];
                    const defaultCash = cashList.find((c) => /cash/i.test(c.accountType || '')) || cashList[0];
                    setForm({
                        openingBalance: settings.openingBalance || 0,
                        pettyCashLedgerId: pettyLedger,
                        pettyCashCashBankAccountId: settings.pettyCashCashBankAccountId || defaultCash?._id || '',
                        replenishmentCashBankAccountId: settings.replenishmentCashBankAccountId || defaultCash?._id || '',
                    });
                }
            } catch (err) {
                toast.error(err.response?.data?.message || 'Failed to load settings');
            }
        })();
    }, [selectedFY]);

    const onSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await pettyCashApi.saveSettings({ ...form, financialYear: selectedFY });
            toast.success('Settings saved');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const cashLedgers = ledgers.filter((l) => l.type === 'Cash' || l.isCashLedger || l.groupName?.toLowerCase().includes('cash'));

    return (
        <div style={page}>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>Petty Cash Settings</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>FY {selectedFY} — company-wise configuration</p>

            <form onSubmit={onSave} style={card}>
                <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Opening Balance</label>
                    <input type="number" step="0.01" style={inp} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
                </div>
                <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Petty Cash Ledger</label>
                    <select style={inp} value={form.pettyCashLedgerId} onChange={(e) => setForm({ ...form, pettyCashLedgerId: e.target.value })}>
                        <option value="">— Select ledger —</option>
                        {cashLedgers.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                        {ledgers.filter((l) => l.name?.toLowerCase().includes('petty')).map((l) => (
                            <option key={l._id} value={l._id}>{l.name}</option>
                        ))}
                    </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Petty Cash Fund (Cash/Bank Account)</label>
                    <select style={inp} value={form.pettyCashCashBankAccountId} onChange={(e) => setForm({ ...form, pettyCashCashBankAccountId: e.target.value })}>
                        <option value="">— Select —</option>
                        {cashBanks.map((c) => <option key={c._id} value={c._id}>{c.accountName} ({c.accountType})</option>)}
                    </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Replenishment Source (Cash/Bank for receipts)</label>
                    <select style={inp} value={form.replenishmentCashBankAccountId} onChange={(e) => setForm({ ...form, replenishmentCashBankAccountId: e.target.value })}>
                        <option value="">— Select —</option>
                        {cashBanks.map((c) => <option key={c._id} value={c._id}>{c.accountName} ({c.accountType})</option>)}
                    </select>
                </div>
                <button type="submit" disabled={saving} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                    {saving ? 'Saving…' : 'Save Settings'}
                </button>
            </form>
        </div>
    );
}
