import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    getCreditNoteLedgerConfig,
    searchCreditNoteMappingLedgers,
    selectCreditNoteExistingLedger,
    createCreditNoteConfigLedger,
    useCreditNoteDefaultSystemLedger,
    updateCreditNoteReasonMappings,
} from '@/services/creditDebitNoteApi';
import { useAuth } from '@/hooks/useAuth';

const page = { padding: '24px 28px', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16, maxWidth: 880 };
const lbl = { fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const btn = (primary) => ({
    padding: '9px 14px',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid #cbd5e1',
    background: primary ? '#0f766e' : '#fff',
    color: primary ? '#fff' : '#334155',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 12,
});
const MODE_OPTIONS = [
    { id: 'default_system', title: 'Use Default System Ledger', desc: 'CRM uses the mapped SALES_RETURN ledger automatically.' },
    { id: 'select_existing', title: 'Use Existing Ledger', desc: 'Search and map any suitable ledger (keeps its display name).' },
    { id: 'create_new', title: 'Create New Ledger', desc: 'Create Sales Return under Sales Accounts with system code SALES_RETURN.' },
];

const DEFAULT_REASONS = [
    { reasonKey: 'Sales Return', systemCode: 'SALES_RETURN' },
    { reasonKey: 'Quantity Difference', systemCode: 'SALES_RETURN' },
    { reasonKey: 'Post Sale Discount', systemCode: 'DISCOUNT_ALLOWED' },
    { reasonKey: 'Rate Difference', systemCode: 'SALES_RATE_DIFFERENCE' },
    { reasonKey: 'Other', systemCode: 'SALES_RETURN' },
];

export default function CreditNoteLedgerConfigPage() {
    const [searchParams] = useSearchParams();
    const { user, hasPermission } = useAuth();
    const canConfigure = (() => {
        const role = String(user?.roleName || user?.role?.name || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin') return true;
        return Boolean(
            hasPermission?.('accounts.system_ledger.configure') ||
            hasPermission?.('accounts.ledger_master.add') ||
            hasPermission?.('accounts.ledger_master.edit'),
        );
    })();

    const [status, setStatus] = useState(null);
    const initialMode = (() => {
        const m = searchParams.get('mode');
        if (m === 'select_existing' || m === 'create_new' || m === 'default_system') return m;
        return 'default_system';
    })();
    const [mode, setMode] = useState(initialMode);
    const [busy, setBusy] = useState(false);
    const [q, setQ] = useState('');
    const [ledgers, setLedgers] = useState([]);
    const [selectedLedgerId, setSelectedLedgerId] = useState('');
    const [newName, setNewName] = useState('Sales Return');
    const [newGroup, setNewGroup] = useState('Sales Accounts');
    const [reasonMappings, setReasonMappings] = useState(DEFAULT_REASONS);

    const load = useCallback(async () => {
        try {
            const data = await getCreditNoteLedgerConfig();
            setStatus(data);
            const urlMode = searchParams.get('mode');
            if (urlMode === 'select_existing' || urlMode === 'create_new' || urlMode === 'default_system') {
                setMode(urlMode);
            } else {
                setMode(data?.mode || 'default_system');
            }
            if (data?.reasonMappings?.length) {
                setReasonMappings(data.reasonMappings.map((r) => ({
                    reasonKey: r.reasonKey,
                    systemCode: r.systemCode || 'SALES_RETURN',
                    ledgerId: r.ledger?._id || null,
                })));
            }
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load Credit Note ledger config');
        }
    }, [searchParams]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (mode !== 'select_existing') return undefined;
        const t = setTimeout(async () => {
            try {
                const data = await searchCreditNoteMappingLedgers(q);
                setLedgers(data?.ledgers || []);
            } catch {
                setLedgers([]);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [mode, q]);

    const applyMode = async () => {
        if (!canConfigure) return toast.error('Permission denied: accounts.system_ledger.configure');
        setBusy(true);
        try {
            if (mode === 'default_system') {
                await useCreditNoteDefaultSystemLedger();
                toast.success('Using default SALES_RETURN system ledger');
            } else if (mode === 'select_existing') {
                if (!selectedLedgerId) {
                    toast.error('Select a ledger first');
                    setBusy(false);
                    return;
                }
                await selectCreditNoteExistingLedger(selectedLedgerId);
                toast.success('Existing ledger mapped to SALES_RETURN');
            } else if (mode === 'create_new') {
                await createCreditNoteConfigLedger({ name: newName, groupName: newGroup });
                toast.success('Sales Return ledger created / mapped');
            }
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Configuration failed');
        } finally {
            setBusy(false);
        }
    };

    const saveReasons = async () => {
        if (!canConfigure) return toast.error('Permission denied: accounts.system_ledger.configure');
        setBusy(true);
        try {
            await updateCreditNoteReasonMappings(reasonMappings);
            toast.success('Reason mappings saved');
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not save reason mappings');
        } finally {
            setBusy(false);
        }
    };

    const mapped = status?.mappedLedger;

    return (
        <div style={page}>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>Credit Note Ledger Configuration</h1>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13, maxWidth: 720 }}>
                Map company ledgers by stable system code (<strong>SALES_RETURN</strong>). Display names can differ; posting never depends on name matching alone.
            </p>

            <div style={card}>
                <div style={{
                    padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                    background: status?.ready ? '#ecfdf5' : '#fff7ed',
                    border: `1px solid ${status?.ready ? '#a7f3d0' : '#fed7aa'}`,
                    fontSize: 13,
                }}>
                    {status?.ready
                        ? <>Ready — <strong>{mapped?.name}</strong> · code <strong>{status.defaultSystemCode || 'SALES_RETURN'}</strong> · mode <strong>{status.mode}</strong></>
                        : <strong>Credit Note ledger is not configured.</strong>}
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#334155' }}>Configuration mode</div>
                <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                    {MODE_OPTIONS.map((opt) => (
                        <label
                            key={opt.id}
                            style={{
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                padding: 12, borderRadius: 8, cursor: 'pointer',
                                border: `1px solid ${mode === opt.id ? '#0f766e' : '#e2e8f0'}`,
                                background: mode === opt.id ? '#f0fdfa' : '#fff',
                            }}
                        >
                            <input
                                type="radio"
                                name="cnLedgerMode"
                                checked={mode === opt.id}
                                onChange={() => setMode(opt.id)}
                                disabled={!canConfigure}
                                style={{ marginTop: 3 }}
                            />
                            <span>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.title}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{opt.desc}</div>
                            </span>
                        </label>
                    ))}
                </div>

                {mode === 'select_existing' && (
                    <div style={{ marginBottom: 16 }}>
                        <label style={lbl}>Search ledger</label>
                        <input style={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sales Return, Return Inward, Discount…" />
                        <div style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            {(ledgers || []).map((l) => (
                                <label
                                    key={String(l._id)}
                                    style={{
                                        display: 'flex', gap: 8, padding: '8px 10px',
                                        borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 12,
                                        background: selectedLedgerId === String(l._id) ? '#f0fdfa' : '#fff',
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="cnLedgerPick"
                                        checked={selectedLedgerId === String(l._id)}
                                        onChange={() => setSelectedLedgerId(String(l._id))}
                                    />
                                    <span>
                                        <strong>{l.name}</strong>
                                        <span style={{ color: '#94a3b8' }}>
                                            {' '}· {l.groupName || '—'} · {l.nature || l.type || '—'}
                                            {l.systemCode ? ` · ${l.systemCode}` : ''} · {l.status || 'Active'}
                                        </span>
                                    </span>
                                </label>
                            ))}
                            {!ledgers?.length && (
                                <div style={{ padding: 12, fontSize: 12, color: '#94a3b8' }}>No matching ledgers</div>
                            )}
                        </div>
                    </div>
                )}

                {mode === 'create_new' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                            <label style={lbl}>Ledger Name</label>
                            <input style={inp} value={newName} onChange={(e) => setNewName(e.target.value)} />
                        </div>
                        <div>
                            <label style={lbl}>Group</label>
                            <input style={inp} value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
                        </div>
                        <div>
                            <label style={lbl}>System Code</label>
                            <input style={{ ...inp, background: '#f8fafc' }} value="SALES_RETURN" readOnly />
                        </div>
                        <div>
                            <label style={lbl}>Nature / Company-wise / Active</label>
                            <div style={{ fontSize: 12, color: '#475569', paddingTop: 8 }}>Income · Company-wise Yes · Active Yes</div>
                        </div>
                    </div>
                )}

                <button type="button" style={btn(true)} disabled={busy || !canConfigure} onClick={applyMode}>
                    {busy ? 'Saving…' : 'Apply configuration'}
                </button>
                {!canConfigure && (
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: '#b45309' }}>
                        Requires permission <code>accounts.system_ledger.configure</code>.
                    </p>
                )}
            </div>

            <div style={card}>
                <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>Reason-wise mapping (optional)</h2>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                    If a reason-specific ledger is not mapped, posting falls back to <strong>SALES_RETURN</strong>.
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            <th style={{ padding: 8 }}>Reason</th>
                            <th style={{ padding: 8 }}>System Code</th>
                            <th style={{ padding: 8 }}>Mapped ledger</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reasonMappings.map((rm, idx) => {
                            const live = status?.reasonMappings?.find((r) => r.reasonKey === rm.reasonKey);
                            return (
                                <tr key={rm.reasonKey} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8 }}>{rm.reasonKey}</td>
                                    <td style={{ padding: 8 }}>
                                        <select
                                            style={{ ...inp, width: 'auto', minWidth: 200 }}
                                            value={rm.systemCode}
                                            disabled={!canConfigure}
                                            onChange={(e) => {
                                                const next = [...reasonMappings];
                                                next[idx] = { ...next[idx], systemCode: e.target.value };
                                                setReasonMappings(next);
                                            }}
                                        >
                                            <option value="SALES_RETURN">SALES_RETURN</option>
                                            <option value="DISCOUNT_ALLOWED">DISCOUNT_ALLOWED</option>
                                            <option value="SALES_RATE_DIFFERENCE">SALES_RATE_DIFFERENCE</option>
                                        </select>
                                    </td>
                                    <td style={{ padding: 8, color: live?.ready ? '#047857' : '#b45309' }}>
                                        {live?.ledger?.name || '— not mapped —'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <button type="button" style={btn(false)} disabled={busy || !canConfigure} onClick={saveReasons}>
                    Save reason mappings
                </button>
            </div>
        </div>
    );
}
