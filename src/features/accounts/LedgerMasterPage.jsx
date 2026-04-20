import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, BookOpen, Search, Pencil, Trash2, X, ChevronDown, ShieldCheck, Landmark, MapPin, CreditCard, Loader2 } from 'lucide-react';
import { getAccountGroups, getLedgers, createLedger, updateLedger, deleteLedger } from '@/services/accountApi';
import { getSuppliers } from '@/services/purchaseApi';
import { fetchGeocodeAddress } from '@/services/locationApi';
import { toast } from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
//  Shared style tokens
// ─────────────────────────────────────────────────────────────────────────────
const s = {
    label: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' },
    input: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', outline: 'none', background: '#fff', boxSizing: 'border-box' },
    select: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', background: '#fff', boxSizing: 'border-box' },
    sectionTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #dbeafe', paddingBottom: 8, marginBottom: 14 },
};

import LedgerForm, { EMPTY } from './components/LedgerForm';

// ─────────────────────────────────────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────────────────────────────────────
const LedgerMasterPage = () => {
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [panel, setPanel] = useState(null); // null | 'create' | { ledger }
    const [search, setSearch] = useState('');
    const [filterGroup, setFilterGroup] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [gData, lData] = await Promise.all([getAccountGroups(), getLedgers()]);
            setGroups(gData || []);
            setLedgers(lData || []);
        } catch {
            toast.error('Failed to fetch ledger data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filtered = useMemo(() => {
        let list = ledgers;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(l => l.name?.toLowerCase().includes(q) || l.gstin?.toLowerCase().includes(q));
        }
        if (filterGroup) list = list.filter(l => l.underGroup?._id === filterGroup || l.underGroup === filterGroup);
        return list;
    }, [ledgers, search, filterGroup]);

    const handleSave = async (data) => {
        setSaving(true);
        try {
            if (panel?.ledger?._id) {
                await updateLedger(panel.ledger._id, data);
                toast.success('Ledger updated successfully');
            } else {
                await createLedger(data);
                toast.success('Ledger created successfully');
            }
            setPanel(null);
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save ledger');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (l) => {
        if (!window.confirm(`Delete ledger "${l.name}"?`)) return;
        try {
            await deleteLedger(l._id);
            toast.success('Ledger deleted');
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Cannot delete ledger');
        }
    };

    const page = { padding: '28px 32px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh' };
    const th = { padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#f8fafc', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };

    return (
        <div style={page}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1e293b', margin: 0 }}>Ledger Master</h1>
                    <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Manage account ledgers — customers, suppliers, banks & tax accounts</p>
                </div>
                <button
                    onClick={() => setPanel('create')}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}
                >
                    <Plus size={16} /> New Ledger
                </button>
            </div>

            {/* Inline Panel */}
            {panel && (
                <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #dbeafe', padding: '22px 24px', marginBottom: 20, boxShadow: '0 4px 24px rgba(37,99,235,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e293b' }}>
                            {panel === 'create' ? '+ Create New Ledger' : `✎ Edit: ${panel.ledger?.name}`}
                        </h3>
                        <button onClick={() => setPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
                    </div>
                    <LedgerForm
                        initial={panel?.ledger || EMPTY}
                        groups={groups}
                        onSave={handleSave}
                        onCancel={() => { if (window.confirm('Discard changes?')) setPanel(null); }}
                        loading={saving}
                    />
                </div>
            )}

            {/* Search & Filter Bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by ledger name or GSTIN..."
                        style={{ ...s.input, paddingLeft: 36 }}
                    />
                </div>
                <div style={{ position: 'relative', minWidth: 200 }}>
                    <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{ ...s.select, paddingRight: 30 }}>
                        <option value="">All Groups</option>
                        {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                </div>
                <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {filtered.length} ledger{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={th}>Ledger Name</th>
                            <th style={th}>Under Group</th>
                            <th style={{ ...th, textAlign: 'right' }}>Balance</th>
                            <th style={th}>GSTIN</th>
                            <th style={th}>Contact</th>
                            <th style={th}>Status</th>
                            <th style={{ ...th, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading ledgers...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                                {search ? 'No ledgers match your search.' : 'No ledgers found. Click "+ New Ledger" to create one.'}
                            </td></tr>
                        ) : filtered.map((l, idx) => {
                            const bal = l.currentBalance ?? 0;
                            const isDebit = bal >= 0;
                            return (
                                <tr key={l._id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'}
                                >
                                    {/* Ledger Name */}
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <BookOpen size={14} color="#2563eb" />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{l.name}</div>
                                                {l.alias && <div style={{ fontSize: 10, color: '#9ca3af' }}>Alias: {l.alias}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    {/* Group */}
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', background: '#f1f5f9', padding: '3px 10px', borderRadius: 20 }}>
                                            {l.underGroup?.name || '—'}
                                        </span>
                                    </td>
                                    {/* Balance */}
                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                        <span style={{ fontWeight: 800, fontSize: 13, color: isDebit ? '#059669' : '#dc2626' }}>
                                            ₹{Math.abs(bal).toLocaleString('en-IN')}
                                        </span>
                                        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>{l.drCr || 'Dr'}</span>
                                    </td>
                                    {/* GSTIN */}
                                    <td style={{ padding: '12px 16px' }}>
                                        {l.gstin
                                            ? <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151', background: '#f0fdf4', padding: '2px 8px', borderRadius: 6, border: '1px solid #bbf7d0' }}>{l.gstin}</span>
                                            : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                                        }
                                    </td>
                                    {/* Contact */}
                                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
                                        {l.mobile || l.email || '—'}
                                    </td>
                                    {/* Status */}
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', background: l.isActive !== false ? '#d1fae5' : '#f3f4f6', color: l.isActive !== false ? '#065f46' : '#6b7280' }}>
                                            {l.isActive !== false ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    {/* Actions */}
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                            <button
                                                onClick={() => setPanel({ ledger: l })}
                                                title="Edit Ledger"
                                                style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#2563eb', fontWeight: 600 }}
                                            >
                                                <Pencil size={12} /> Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(l)}
                                                title="Delete Ledger"
                                                style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#dc2626' }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LedgerMasterPage;
