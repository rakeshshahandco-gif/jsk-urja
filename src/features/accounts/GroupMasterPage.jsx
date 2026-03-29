import React, { useState, useEffect, useCallback } from 'react';
import { Plus, FolderTree, RefreshCw, Trash2, Pencil, ChevronRight, ChevronDown, ArrowDownToLine } from 'lucide-react';
import {
    getAccountGroups, createAccountGroup, updateAccountGroup,
    deleteAccountGroup, initializeAccounts
} from '@/services/accountApi';
import { toast } from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
//  Nature badge
// ─────────────────────────────────────────────────────────────────────────────
const NatureBadge = ({ nature }) => {
    const map = {
        Assets: 'bg-blue-100 text-blue-700',
        Liabilities: 'bg-red-100 text-red-700',
        Income: 'bg-green-100 text-green-700',
        Expenses: 'bg-orange-100 text-orange-700'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[nature] || 'bg-gray-100 text-gray-600'}`}>
            {nature}
        </span>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Inline Group Form (create / edit)
// ─────────────────────────────────────────────────────────────────────────────
const GroupForm = ({ initial = {}, groups = [], onSave, onCancel }) => {
    const [form, setForm] = useState({
        name: initial.name || '',
        parentGroup: initial.parentGroup?._id || initial.parentGroup || '',
        nature: initial.nature || 'Assets',
        affectGrossProfit: initial.affectGrossProfit || false,
        sortOrder: initial.sortOrder || 0
    });

    const change = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const styles = {
        label: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4, display: 'block' },
        input: { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', outline: 'none' },
        select: { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', background: '#fff' }
    };

    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <div>
                <label style={styles.label}>Group Name *</label>
                <input name="name" value={form.name} onChange={change} placeholder="e.g. Sundry Debtors" style={styles.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label style={styles.label}>Parent Group</label>
                    <select name="parentGroup" value={form.parentGroup} onChange={change} style={styles.select}>
                        <option value="">— Primary (No Parent) —</option>
                        {groups.filter(g => g._id !== initial._id).map(g => (
                            <option key={g._id} value={g._id}>{g.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={styles.label}>Nature *</label>
                    <select name="nature" value={form.nature} onChange={change} style={styles.select}>
                        {['Assets', 'Liabilities', 'Income', 'Expenses'].map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" name="affectGrossProfit" checked={form.affectGrossProfit} onChange={change} />
                Affects Gross Profit?
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button onClick={() => onSave(form)} style={{ padding: '8px 18px', borderRadius: 8, background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {initial._id ? 'Update Group' : 'Create Group'}
                </button>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Row (recursive)
// ─────────────────────────────────────────────────────────────────────────────
const GroupRow = ({ group, depth, childMap, onEdit, onDelete }) => {
    const [open, setOpen] = useState(depth < 2);
    const children = childMap[group._id] || [];
    const hasChildren = children.length > 0;

    const isSundryDebtors = group.name === 'Sundry Debtors';

    return (
        <>
            <tr style={{ background: depth === 0 ? '#f8fafc' : '#fff', borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 22 }}>
                        <button
                            onClick={() => setOpen(p => !p)}
                            style={{ background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: '#9ca3af', padding: 0, display: 'flex' }}
                        >
                            {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14 }} />}
                        </button>
                        <FolderTree size={14} color={depth === 0 ? '#2563eb' : isSundryDebtors ? '#059669' : '#9ca3af'} />
                        <span style={{ fontSize: 13, fontWeight: depth === 0 ? 700 : isSundryDebtors ? 700 : 500, color: isSundryDebtors ? '#059669' : '#1e293b' }}>
                            {group.name}
                            {isSundryDebtors && <span style={{ marginLeft: 6, fontSize: 10, background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 20, fontWeight: 700 }}>DEFAULT CUSTOMER GROUP</span>}
                        </span>
                    </div>
                </td>
                <td style={{ padding: '10px 16px' }}><NatureBadge nature={group.nature} /></td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>{group.parentGroup?.name || '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>{children.length}</td>
                <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => onEdit(group)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#374151' }}>
                            <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => onDelete(group)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626' }}>
                            <Trash2 size={12} /> Delete
                        </button>
                    </div>
                </td>
            </tr>
            {open && children.map(c => (
                <GroupRow key={c._id} group={c} depth={depth + 1} childMap={childMap} onEdit={onEdit} onDelete={onDelete} />
            ))}
        </>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────────────────────────────────────
const GroupMasterPage = () => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [panel, setPanel] = useState(null); // null | 'create' | { group }

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAccountGroups();
            setGroups(data || []);
        } catch {
            toast.error('Failed to fetch groups');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    // Build parent → children map
    const childMap = {};
    const roots = [];
    groups.forEach(g => {
        const pid = g.parentGroup?._id || g.parentGroup || null;
        if (!pid) {
            roots.push(g);
        } else {
            (childMap[pid] = childMap[pid] || []).push(g);
        }
    });

    const handleInitialize = async () => {
        if (!window.confirm('Initialize Tally-style default groups and migrate all customers to Sundry Debtors?')) return;
        setLoading(true);
        try {
            await initializeAccounts();
            toast.success('Groups initialized and customers migrated to Sundry Debtors!');
            fetchGroups();
        } catch {
            toast.error('Initialization failed');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (data) => {
        try {
            if (panel?.group?._id) {
                await updateAccountGroup(panel.group._id, data);
                toast.success('Group updated');
            } else {
                await createAccountGroup(data);
                toast.success('Group created');
            }
            setPanel(null);
            fetchGroups();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save group');
        }
    };

    const handleDelete = async (group) => {
        if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
        try {
            await deleteAccountGroup(group._id);
            toast.success('Group deleted');
            fetchGroups();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Cannot delete group');
        }
    };

    const s = {
        page: { padding: 28, fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh' },
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
        title: { fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 },
        sub: { fontSize: 13, color: '#6b7280', marginTop: 4 },
        btn: { padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 },
        card: { background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' },
        th: { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }
    };

    return (
        <div style={s.page}>
            <div style={s.header}>
                <div>
                    <h1 style={s.title}>Account Groups (Masters)</h1>
                    <p style={s.sub}>Tally-style chart of accounts hierarchy</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={handleInitialize} disabled={loading} style={{ ...s.btn, background: '#0f172a', color: '#fff' }}>
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        {loading ? 'Working...' : 'Initialize / Migrate'}
                    </button>
                    <button onClick={() => setPanel('create')} style={{ ...s.btn, background: '#2563eb', color: '#fff' }}>
                        <Plus size={15} /> Add Group
                    </button>
                </div>
            </div>

            {/* Inline panel */}
            {panel && (
                <div style={{ ...s.card, padding: 24, marginBottom: 20 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                        {panel === 'create' ? 'Create New Group' : `Edit: ${panel.group?.name}`}
                    </h3>
                    <GroupForm
                        initial={panel?.group || {}}
                        groups={groups}
                        onSave={handleSave}
                        onCancel={() => { if (window.confirm('Discard changes?')) setPanel(null); }}
                    />
                </div>
            )}

            {/* Sundry Debtors info banner */}
            <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#065f46', fontWeight: 600 }}>
                <ArrowDownToLine size={16} />
                All Customers are mapped under <strong>Sundry Debtors</strong> (under Current Assets) — just like Tally Prime.
                New customers automatically default to this group. Click "Initialize / Migrate" to sync existing records.
            </div>

            {/* Groups table */}
            <div style={s.card}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={s.th}>Group Name</th>
                            <th style={s.th}>Nature</th>
                            <th style={s.th}>Parent Group</th>
                            <th style={s.th}>Sub-groups</th>
                            <th style={s.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                                    No groups found. Click "Initialize / Migrate" to create Tally-style defaults.
                                </td>
                            </tr>
                        ) : (
                            roots.map(g => (
                                <GroupRow
                                    key={g._id}
                                    group={g}
                                    depth={0}
                                    childMap={childMap}
                                    onEdit={(group) => setPanel({ group })}
                                    onDelete={handleDelete}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GroupMasterPage;
