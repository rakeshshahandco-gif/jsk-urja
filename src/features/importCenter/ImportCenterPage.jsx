import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { importCenterApi } from '@/services/importCenterApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' };
const cardDisabled = { ...card, opacity: 0.55, pointerEvents: 'none' };

const IMPORT_TYPES = [
    { id: 'tally_ledger', title: 'Ledger Master Import', desc: 'Tally Excel → ledgers / customers / suppliers', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_ledger_master'), flag: 'ai', perm: 'upload' },
    { id: 'customer', title: 'Customer Import', desc: 'Customer master Excel / GST import', path: () => PATHS.CUSTOMERS.LIST, flag: 'any', perm: null },
    { id: 'supplier', title: 'Supplier Import', desc: 'Via Tally Ledger Master (Sundry Creditors)', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_ledger_master'), flag: 'ai', perm: 'upload' },
    { id: 'item', title: 'Item Master Import', desc: 'Inventory → Item list → Import Excel', path: () => PATHS.INVENTORY.ITEMS, flag: 'any', perm: null },
    { id: 'opening_stock', title: 'Opening Stock Import', desc: 'Planned — use Inventory stock adjustment', path: null, flag: 'any', perm: null, soon: true },
    { id: 'opening_balance', title: 'Opening Balance Import', desc: 'Via Tally Ledger Master opening balance column', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_ledger_master'), flag: 'ai', perm: 'upload' },
    { id: 'petty_cash', title: 'Petty Cash Import', desc: 'Upload → map → validate → approve (reference flow)', path: () => PATHS.ACCOUNTS.PETTY_CASH_IMPORT, flag: 'petty', perm: 'petty_import' },
    { id: 'expense', title: 'Expense Import', desc: 'Tally Day Book / OCR expense bills', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_day_book'), flag: 'ai', perm: 'upload' },
    { id: 'sales_inv', title: 'Sales Invoice Import', desc: 'OCR / manual — Scan Entry sales module', path: () => `${PATHS.DOCUMENTS.SCAN_ENTRY_BULK}?module=sales_invoice`, flag: 'ai', perm: 'upload' },
    { id: 'purchase_inv', title: 'Purchase Invoice Import', desc: 'OCR purchase invoice + GSTR-2B', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('gstr2b_itc'), flag: 'ai', perm: 'upload' },
    { id: 'receipt', title: 'Receipt Voucher Import', desc: 'Tally Day Book → receipt drafts', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_day_book'), flag: 'ai', perm: 'upload' },
    { id: 'payment', title: 'Payment Voucher Import', desc: 'Tally Day Book → payment drafts', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_day_book'), flag: 'ai', perm: 'upload' },
    { id: 'journal', title: 'Journal Voucher Import', desc: 'Tally Day Book → journal drafts', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_day_book'), flag: 'ai', perm: 'upload' },
    { id: 'tally_daybook', title: 'Tally Day Book Import', desc: 'Excel day book grouped by voucher no', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_day_book'), flag: 'ai', perm: 'upload' },
    { id: 'ocr_purchase', title: 'OCR Purchase Invoice', desc: 'PDF/JPG/PNG → review → post', path: () => `${PATHS.DOCUMENTS.SCAN_ENTRY_BULK}?module=purchase_invoice`, flag: 'ai', perm: 'upload' },
    { id: 'ocr_sales', title: 'OCR Sales Invoice', desc: 'PDF/image sales invoice scan', path: () => `${PATHS.DOCUMENTS.SCAN_ENTRY_BULK}?module=sales_invoice`, flag: 'ai', perm: 'upload' },
    { id: 'ocr_expense', title: 'OCR Expense Bill', desc: 'Scanned expense bills', path: () => `${PATHS.DOCUMENTS.SCAN_ENTRY_BULK}?module=expense_bill`, flag: 'ai', perm: 'upload' },
    { id: 'gstr2b', title: 'GSTR-2B Import', desc: 'ITC purchase drafts (no stock)', path: () => PATHS.DOCUMENTS.SMART_IMPORT_BATCH('gstr2b_itc'), flag: 'ai', perm: 'upload' },
];

export default function ImportCenterPage() {
    const { hasPermission } = useAuth();
    const { isFeatureEnabled } = useFeatureSettings();
    const [history, setHistory] = useState([]);

    const aiOn = isFeatureEnabled('accounting.enableAiSmartImport');
    const pettyOn = isFeatureEnabled('accounting.enablePettyCash');

    useEffect(() => {
        importCenterApi.getHistory({ limit: 30 }).then((d) => setHistory(d?.results || [])).catch(() => setHistory([]));
    }, []);

    const canOpen = (item) => {
        if (item.soon || !item.path) return false;
        if (item.flag === 'petty') return pettyOn && hasPermission('voucher_entry.petty_cash.import');
        if (item.flag === 'ai') return aiOn && hasPermission('import_utility.import_utility.upload');
        return true;
    };

    return (
        <div style={page}>
            <h1 style={{ margin: '0 0 8px' }}>Import Center</h1>
            <p style={{ color: '#64748b', maxWidth: 720, marginBottom: 20 }}>
                Unified entry for all imports. Flow: Upload → mapping → validation → missing master detection → preview → approval → posting.
                Smart matching: GSTIN → PAN → exact name → fuzzy name → learned mapping → draft master (no duplicate auto-create).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 28 }}>
                {IMPORT_TYPES.map((item) => {
                    const ok = canOpen(item);
                    const inner = (
                        <>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{item.desc}</div>
                            {item.soon && <span style={{ fontSize: 11, color: '#b45309' }}>Coming soon</span>}
                        </>
                    );
                    if (!ok) {
                        return (
                            <div key={item.id} style={cardDisabled} title="Enable feature or permission in settings">
                                {inner}
                            </div>
                        );
                    }
                    return (
                        <Link key={item.id} to={item.path()} style={card}>
                            {inner}
                        </Link>
                    );
                })}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                <h3 style={{ marginTop: 0 }}>Import history</h3>
                <p style={{ fontSize: 13, color: '#64748b' }}>Company + FY scoped. Dry run imports are logged without posting.</p>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                            <th style={{ padding: 8 }}>Date</th>
                            <th style={{ padding: 8 }}>Type</th>
                            <th style={{ padding: 8 }}>File</th>
                            <th style={{ padding: 8 }}>Records</th>
                            <th style={{ padding: 8 }}>Status</th>
                            <th style={{ padding: 8 }}>Errors</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length === 0 && (
                            <tr><td colSpan={6} style={{ padding: 12, color: '#94a3b8' }}>No import history yet</td></tr>
                        )}
                        {history.map((h) => (
                            <tr key={h._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>{new Date(h.createdAt).toLocaleString()}</td>
                                <td style={{ padding: 8 }}>{h.importType}</td>
                                <td style={{ padding: 8 }}>{h.fileName || '—'}</td>
                                <td style={{ padding: 8 }}>{h.recordsSuccess}/{h.recordsTotal}</td>
                                <td style={{ padding: 8 }}>{h.dryRun ? 'dry_run' : h.status}</td>
                                <td style={{ padding: 8 }}>
                                    {(h.failedRows?.length > 0 || h.recordsFailed > 0) && (
                                        <button
                                            type="button"
                                            style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                                            onClick={async () => {
                                                const blob = await importCenterApi.downloadErrors(h._id);
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `import-errors-${h._id}.xlsx`;
                                                a.click();
                                            }}
                                        >
                                            Download Excel
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {aiOn && (
                    <p style={{ marginTop: 16, fontSize: 13 }}>
                        <Link to={PATHS.DOCUMENTS.SMART_IMPORT_HUB}>AI Smart Import hub</Link>
                        {' · '}
                        <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_DRAFTS}>OCR drafts</Link>
                    </p>
                )}
            </div>
        </div>
    );
}
