import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { fetchModuleLocks, updateModuleLock } from '@/services/moduleLockApi';
import { useAuth } from '@/hooks/useAuth';

const LOCK_REASON_PRESETS = [
    'Approved / Final',
    'Golden Module',
    'Tested and Final',
];

function formatDate(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString('en-GB');
    } catch {
        return '—';
    }
}

function ConfirmModal({
    open,
    title,
    body,
    requireReason,
    reasonPresets,
    confirmLabel,
    confirmTone,
    onCancel,
    onConfirm,
    busy,
}) {
    const [reason, setReason] = useState('');
    const [custom, setCustom] = useState('');

    useEffect(() => {
        if (open) {
            setReason(requireReason ? '' : (reasonPresets?.[0] || 'Approved Golden Module'));
            setCustom('');
        }
    }, [open, requireReason, reasonPresets]);

    if (!open) return null;

    const resolvedReason =
        reason === '__custom__' ? custom.trim() : String(reason || '').trim();

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 16,
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 480,
                    background: '#fff',
                    borderRadius: 8,
                    padding: 20,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
                }}
            >
                <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#0f172a' }}>{title}</h3>
                <p style={{ margin: '0 0 16px', fontSize: 14, color: '#334155', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {body}
                </p>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    {requireReason ? 'Unlock reason (required)' : 'Reason (optional)'}
                </label>
                <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', marginBottom: 8, fontSize: 14 }}
                >
                    {requireReason ? <option value="">Select reason…</option> : null}
                    {(reasonPresets || []).map((p) => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="__custom__">Custom reason</option>
                </select>
                {reason === '__custom__' && (
                    <input
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder="Enter custom reason"
                        style={{ width: '100%', padding: '8px 10px', marginBottom: 12, fontSize: 14, boxSizing: 'border-box' }}
                    />
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={onCancel} disabled={busy} style={{ padding: '8px 14px' }}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy || (requireReason && !resolvedReason)}
                        onClick={() => onConfirm(resolvedReason)}
                        style={{
                            padding: '8px 14px',
                            background: confirmTone === 'danger' ? '#b91c1c' : '#1d4ed8',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer',
                        }}
                    >
                        {busy ? 'Saving…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ModuleLockPage() {
    const { hasRole } = useAuth();
    const isSuperAdmin = hasRole('superadmin');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [modal, setModal] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchModuleLocks();
            setRows(Array.isArray(data?.locks) ? data.locks : []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load module locks');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openLockModal = (row) => {
        setModal({
            mode: 'lock',
            row,
            title: `Lock ${row.moduleName}?`,
            body:
                'Once locked, this module is treated as a Golden Module.\n' +
                'Future development must not modify the protected module\n' +
                'unless it is explicitly unlocked.',
            requireReason: false,
            reasonPresets: LOCK_REASON_PRESETS,
            confirmLabel: 'Lock module',
            confirmTone: 'primary',
        });
    };

    const openUnlockModal = (row) => {
        setModal({
            mode: 'unlock',
            row,
            title: `${row.moduleName} is currently LOCKED.`,
            body:
                'Unlocking allows development changes to this module.\n\n' +
                'Are you sure?',
            requireReason: true,
            reasonPresets: ['Adding feature', 'Bug fix', 'Print correction', 'Regression fix'],
            confirmLabel: 'Unlock module',
            confirmTone: 'danger',
        });
    };

    const handleConfirm = async (reason) => {
        if (!modal?.row) return;
        setBusy(true);
        try {
            const locked = modal.mode === 'lock';
            await updateModuleLock(modal.row.moduleKey, {
                locked,
                scope: modal.row.scope,
                reason: reason || (locked ? 'Approved Golden Module' : ''),
            });
            toast.success(locked ? `${modal.row.moduleName} locked` : `${modal.row.moduleName} unlocked`);
            setModal(null);
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to update lock');
        } finally {
            setBusy(false);
        }
    };

    if (!isSuperAdmin) {
        return (
            <div style={{ padding: 24 }}>
                <h2>Module Lock</h2>
                <p>Only Super Admin / Platform Admin can access System Protection.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: 24, maxWidth: 1100 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#0f172a' }}>Module Lock</h1>
            <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: 14 }}>
                Settings → System Protection → Module Lock
            </p>
            <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
                Development / Golden Module protection only. Locking does not disable CRM runtime —
                users can still create, edit, print, and send WhatsApp as permissions allow.
            </p>

            {loading ? (
                <p>Loading…</p>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px' }}>MODULE</th>
                                <th style={{ padding: '10px 12px' }}>SCOPE</th>
                                <th style={{ padding: '10px 12px' }}>STATUS</th>
                                <th style={{ padding: '10px 12px' }}>LOCK</th>
                                <th style={{ padding: '10px 12px' }}>LOCKED BY</th>
                                <th style={{ padding: '10px 12px' }}>LOCKED DATE</th>
                                <th style={{ padding: '10px 12px' }}>REASON</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const locked = row.locked === true;
                                return (
                                    <tr
                                        key={row.moduleKey}
                                        style={{
                                            borderTop: '1px solid #e2e8f0',
                                            background: row.parentKey ? '#fcfcfd' : '#fff',
                                        }}
                                    >
                                        <td style={{ padding: '10px 12px', fontWeight: row.parentKey ? 500 : 600, paddingLeft: row.parentKey ? 28 : 12 }}>
                                            {row.moduleName}
                                            {row.testOnly ? (
                                                <span style={{ marginLeft: 8, fontSize: 11, color: '#b45309', fontWeight: 600 }}>TEST</span>
                                            ) : null}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{row.scope}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {locked ? '🔒 LOCKED' : '🔓 OPEN'}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={locked}
                                                    onChange={() => (locked ? openUnlockModal(row) : openLockModal(row))}
                                                />
                                                <span>{locked ? 'LOCKED' : 'OPEN'}</span>
                                            </label>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>{locked ? (row.lockedByName || '—') : '—'}</td>
                                        <td style={{ padding: '10px 12px' }}>{locked ? formatDate(row.lockedAt) : '—'}</td>
                                        <td style={{ padding: '10px 12px', color: '#475569', maxWidth: 220 }}>
                                            {locked ? (row.lockReason || '—') : (row.unlockReason ? `Last unlock: ${row.unlockReason}` : '—')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <ConfirmModal
                open={Boolean(modal)}
                title={modal?.title}
                body={modal?.body}
                requireReason={modal?.requireReason}
                reasonPresets={modal?.reasonPresets}
                confirmLabel={modal?.confirmLabel}
                confirmTone={modal?.confirmTone}
                onCancel={() => !busy && setModal(null)}
                onConfirm={handleConfirm}
                busy={busy}
            />
        </div>
    );
}
