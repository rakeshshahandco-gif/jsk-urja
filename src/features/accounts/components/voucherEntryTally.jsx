import React, { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    ArrowLeftRight,
    Banknote,
    BookOpen,
    FileMinus,
    FilePlus,
    Wallet,
    Receipt,
} from 'lucide-react';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { PATHS } from '@/routes/paths';

const CREDIT_NOTE_NEW = '/voucher-entry/credit-notes/new';
const DEBIT_NOTE_NEW = '/voucher-entry/debit-notes/new';

const VOUCHER_ITEMS = [
    { id: 'contra', keyLabel: 'F4', label: 'Contra', sub: 'Cash ↔ Bank', path: PATHS.ACCOUNTS.CONTRA_ENTRY, icon: ArrowLeftRight, color: '#7c3aed' },
    { id: 'payment', keyLabel: 'F5', label: 'Payment', sub: 'Money paid out', path: PATHS.ACCOUNTS.PAYMENT_ENTRY, icon: Banknote, color: '#dc2626' },
    { id: 'receipt', keyLabel: 'F6', label: 'Receipt', sub: 'Money received', path: PATHS.ACCOUNTS.RECEIPT_ENTRY, icon: Wallet, color: '#059669' },
    { id: 'journal', keyLabel: 'F7', label: 'Journal', sub: 'Adjustments', path: PATHS.ACCOUNTS.JOURNAL_ENTRY, icon: BookOpen, color: '#2563eb' },
    { id: 'expense', keyLabel: 'Alt+E', label: 'Expense', sub: 'Expense voucher', path: PATHS.ACCOUNTS.EXPENSE_ENTRY, icon: Receipt, color: '#d97706' },
    { id: 'credit', keyLabel: 'Ctrl+F8', label: 'Credit Note', sub: 'Sales return / CN', path: CREDIT_NOTE_NEW, icon: FileMinus, color: '#0d9488' },
    { id: 'debit', keyLabel: 'Ctrl+F9', label: 'Debit Note', sub: 'Purchase return / DN', path: DEBIT_NOTE_NEW, icon: FilePlus, color: '#b45309' },
];

function pathToVoucherId(pathname) {
    const p = pathname || '';
    if (p.includes('/receipt-entry')) return 'receipt';
    if (p.includes('/payment-entry')) return 'payment';
    if (p.includes('/journal-entry')) return 'journal';
    if (p.includes('/contra-entry')) return 'contra';
    if (p.includes('/expense-entry')) return 'expense';
    if (p.includes('/credit-notes')) return 'credit';
    if (p.includes('/debit-notes')) return 'debit';
    return 'other';
}

function matchesShortcut(e, spec) {
    const key = e.key?.length === 1 ? e.key.toLowerCase() : e.key;
    if (key !== spec.key) return false;
    if (Boolean(spec.ctrl) !== e.ctrlKey) return false;
    if (Boolean(spec.alt) !== e.altKey) return false;
    if (spec.ctrl || spec.alt) return true;
    return !e.ctrlKey && !e.altKey;
}

const KEY_MAP = [
    { key: 'F4', ctrl: false, alt: false, id: 'contra' },
    { key: 'F5', ctrl: false, alt: false, id: 'payment' },
    { key: 'F6', ctrl: false, alt: false, id: 'receipt' },
    { key: 'F7', ctrl: false, alt: false, id: 'journal' },
    { key: 'e', ctrl: false, alt: true, id: 'expense' },
    { key: 'F8', ctrl: true, alt: false, id: 'credit' },
    { key: 'F9', ctrl: true, alt: false, id: 'debit' },
];

function TallyVoucherShortcutPanel({ current, onNavigate }) {
    const row = (item, active) => {
        const Icon = item.icon;
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                title={`${item.label} (${item.keyLabel})`}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    width: '100%',
                    padding: '10px 10px',
                    borderRadius: 10,
                    border: active ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: active ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', lineHeight: 1.2 }}>{item.keyLabel}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <Icon size={15} color={item.color} />
                    <span style={{ fontSize: 12, fontWeight: 800 }}>{item.label}</span>
                </span>
                <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>{item.sub}</span>
            </button>
        );
    };

    return (
        <aside style={{ width: 176, flexShrink: 0, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)' }}>
            <div
                style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 12,
                    maxHeight: 'calc(100vh - 32px)',
                    overflowY: 'auto',
                }}
            >
                <div
                    style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: '#475569',
                        marginBottom: 10,
                        borderBottom: '1px solid #e2e8f0',
                        paddingBottom: 8,
                    }}
                >
                    VOUCHER (TALLY)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {VOUCHER_ITEMS.map((item) => row(item, current === item.id))}
                </div>
            </div>
        </aside>
    );
}

export default function VoucherEntryTallyLayout({ children, fromInvoice = false, transferContext = null }) {
    const { isFeatureEnabled } = useFeatureSettings();
    const location = useLocation();
    const navigate = useNavigate();
    const enabled = isFeatureEnabled('accounting.tallyVoucherShortcutsEnabled');
    const current = useMemo(() => pathToVoucherId(location.pathname), [location.pathname]);

    const buildNavigateState = useCallback(() => {
        if (!transferContext?.ledgerId) return { tallyPrefill: true };
        return {
            tallyPrefill: true,
            ledgerId: transferContext.ledgerId,
            ledgerName: transferContext.ledgerName || '',
            amount: Number(transferContext.amount) || 0,
        };
    }, [transferContext]);

    const navigators = useMemo(() => {
        const state = buildNavigateState();
        const map = {};
        VOUCHER_ITEMS.forEach((item) => {
            const useState = ['payment', 'receipt', 'journal', 'contra', 'expense'].includes(item.id);
            map[item.id] = () => navigate(item.path, useState ? { state } : undefined);
        });
        return map;
    }, [navigate, buildNavigateState]);

    const onNavigate = useCallback((id) => {
        navigators[id]?.();
    }, [navigators]);

    useEffect(() => {
        if (!enabled || fromInvoice) return undefined;
        const onKeyDown = (e) => {
            if (e.defaultPrevented) return;
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
            const hit = KEY_MAP.find((spec) => matchesShortcut(e, spec));
            if (!hit) return;
            e.preventDefault();
            navigators[hit.id]?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled, fromInvoice, navigators]);

    if (!enabled || fromInvoice) return children;

    return (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
            <TallyVoucherShortcutPanel current={current} onNavigate={onNavigate} />
        </div>
    );
}
