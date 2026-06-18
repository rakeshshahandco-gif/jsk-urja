import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { pettyCashApi } from '@/services/pettyCashApi';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const btnPrimary = { padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
const btnSecondary = { padding: '10px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

const apiErrorMessage = (err, fallback) => {
    if (err?.code === 'ECONNABORTED') {
        return 'Import timed out — server may still be processing. Wait a moment and refresh, or try again.';
    }
    if (!err?.response) {
        return err?.message || 'Cannot reach server. Check that backend is running on port 5000.';
    }
    return err.response?.data?.message || fallback;
};

const fmtDate = (d) => {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN');
};

const fmtCell = (v) => (v != null && String(v).trim() !== '' ? v : '—');

const PREVIEW_COLUMNS = [
    'Row',
    'Date',
    'Account Head',
    'Narration',
    'Payment',
    'Receipt',
    'Balance',
    'Voucher No',
    'Bill No',
    'Remarks',
    'Status',
    'Notes',
];

export default function PettyCashImportPage() {
    const { selectedFY } = useFinancialYear();
    const [preview, setPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [approving, setApproving] = useState(false);
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [settingsReady, setSettingsReady] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const s = await pettyCashApi.getSettings(selectedFY);
                setSettingsReady(!!s?.pettyCashLedgerId);
            } catch {
                setSettingsReady(false);
            }
        })();
    }, [selectedFY]);

    const rows = preview?.rows || preview?.batch?.rows || [];
    const validRows = useMemo(() => rows.filter((r) => r.isValid), [rows]);
    const selectedValidCount = useMemo(
        () => validRows.filter((r) => selectedRows.has(r.rowNumber)).length,
        [validRows, selectedRows],
    );
    const allValidSelected = validRows.length > 0 && validRows.every((r) => selectedRows.has(r.rowNumber));
    const someValidSelected = validRows.some((r) => selectedRows.has(r.rowNumber));

    useEffect(() => {
        if (!preview) {
            setSelectedRows(new Set());
            return;
        }
        const nextRows = preview?.rows || preview?.batch?.rows || [];
        setSelectedRows(new Set(nextRows.filter((r) => r.isValid).map((r) => r.rowNumber)));
    }, [preview]);

    const toggleRow = (rowNumber, isValid) => {
        if (!isValid) return;
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (next.has(rowNumber)) next.delete(rowNumber);
            else next.add(rowNumber);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (allValidSelected) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(validRows.map((r) => r.rowNumber)));
        }
    };

    const downloadTemplate = async () => {
        try {
            const blob = await pettyCashApi.downloadTemplate(selectedFY);
            downloadBlob(blob, `petty-cash-template-${selectedFY}.xlsx`);
        } catch (err) {
            toast.error(apiErrorMessage(err, 'Download failed'));
        }
    };

    const exportExpenseLedgers = async () => {
        try {
            const blob = await pettyCashApi.exportExpenseLedgers();
            downloadBlob(blob, 'expense-ledgers.xlsx');
        } catch (err) {
            toast.error(apiErrorMessage(err, 'Export failed'));
        }
    };

    const onUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const result = await pettyCashApi.uploadImport(file, selectedFY);
            setPreview(result);
            const newMsg = result.newLedgerCount ? `, ${result.newLedgerCount} new ledger(s) will be created` : '';
            toast.success(`Validated: ${result.validCount} ok, ${result.errorCount} errors${newMsg}`);
        } catch (err) {
            toast.error(apiErrorMessage(err, 'Import failed'));
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const onApprove = async () => {
        if (!preview?.batch?._id) return;
        if (!settingsReady) {
            toast.error('Configure Petty Cash Settings first (PETTY CASH ledger + Cash/Bank account)', { duration: 8000 });
            return;
        }
        if (selectedValidCount === 0) {
            toast.error('Select at least one valid row to post');
            return;
        }
        const selectedNewLedgers = validRows.filter(
            (r) => selectedRows.has(r.rowNumber) && r.willCreateLedger,
        ).length;
        const msg = selectedNewLedgers
            ? `Post ${selectedValidCount} selected row(s)? ${selectedNewLedgers} new expense ledger(s) will be created under Indirect Expenses.`
            : `Post ${selectedValidCount} selected row(s) to petty cash?`;
        if (!window.confirm(msg)) return;
        setApproving(true);
        try {
            const result = await pettyCashApi.approveImport(
                preview.batch._id,
                [...selectedRows],
            );
            toast.success(`Posted ${result.postedCount} entries`);
            if (result.ledgersCreated) toast.success(`Created ${result.ledgersCreated} ledger(s) under Indirect Expenses`);
            if (result.postErrors?.length) {
                const first = result.postErrors[0]?.message || 'Post failed';
                const sameMsg = result.postErrors.every((e) => e.message === first);
                toast.error(
                    sameMsg
                        ? `${result.postErrors.length} row(s) failed: ${first}`
                        : `${result.postErrors.length} row(s) failed. Row ${result.postErrors[0].rowNumber}: ${first}`,
                    { duration: 8000 },
                );
            }
            setPreview(result.postErrors?.length ? preview : null);
            setSelectedRows(new Set());
        } catch (err) {
            const msg = err.response?.data?.message || '';
            if (/already posted/i.test(msg)) {
                toast.success('These rows were already posted. Check Petty Cash Entry.');
                setPreview(null);
                setSelectedRows(new Set());
            } else if (err?.code === 'ECONNABORTED') {
                toast.error(
                    'Approve timed out — entries may still have posted. Check Accounts → Petty Cash → Petty Cash Entry.',
                    { duration: 10000 },
                );
            } else {
                toast.error(apiErrorMessage(err, 'Approve failed'));
            }
        } finally {
            setApproving(false);
        }
    };

    return (
        <div style={page}>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>Petty Cash Import</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>
                FY {selectedFY} — template includes all expense ledgers. New account heads are auto-created under <strong>Indirect Expenses</strong> on import.
            </p>

            {!settingsReady && (
                <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>
                    <strong>Setup required before posting</strong>
                    <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                        Petty Cash Settings are not saved for FY {selectedFY}. Select your <strong>PETTY CASH</strong> ledger and Cash/Bank account, then Save.
                    </p>
                    <Link
                        to={PATHS.ACCOUNTS.PETTY_CASH_SETTINGS}
                        style={{ display: 'inline-block', marginTop: 12, color: '#2563eb', fontWeight: 700, fontSize: 13 }}
                    >
                        Open Petty Cash Settings →
                    </Link>
                </div>
            )}

            <div style={card}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={downloadTemplate} style={btnPrimary}>
                        Download Template
                    </button>
                    <button type="button" onClick={exportExpenseLedgers} style={btnSecondary}>
                        Export Expense Ledgers
                    </button>
                    <label style={{ ...btnSecondary, cursor: 'pointer' }}>
                        {uploading ? 'Uploading…' : 'Upload Excel'}
                        <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onUpload} disabled={uploading} />
                    </label>
                </div>
                <p style={{ margin: '14px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                    Template columns: Date, Account Head, Narration, Payment, Receipt, Balance, Voucher No, Bill No, Remarks.
                </p>
            </div>

            {preview && (
                <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <div>
                            <strong>Preview</strong> — {preview.validCount} valid, {preview.errorCount} errors
                            {selectedValidCount > 0 && (
                                <span style={{ color: '#2563eb', marginLeft: 8 }}>{selectedValidCount} selected</span>
                            )}
                            {preview.newLedgerCount > 0 && (
                                <span style={{ color: '#b45309', marginLeft: 8 }}>{preview.newLedgerCount} new ledger(s) to create</span>
                            )}
                        </div>
                        {preview.validCount > 0 && (
                            <button
                                type="button"
                                disabled={approving || selectedValidCount === 0}
                                onClick={onApprove}
                                style={{
                                    ...btnPrimary,
                                    background: '#16a34a',
                                    opacity: selectedValidCount === 0 ? 0.5 : 1,
                                }}
                            >
                                {approving ? 'Posting…' : `Approve & Post (${selectedValidCount})`}
                            </button>
                        )}
                    </div>
                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480 }}>
                        <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f9fafb' }}>
                                    <th style={{ padding: 8, width: 36, borderBottom: '1px solid #e5e7eb' }}>
                                        <input
                                            type="checkbox"
                                            checked={allValidSelected}
                                            ref={(el) => {
                                                if (el) el.indeterminate = someValidSelected && !allValidSelected;
                                            }}
                                            onChange={toggleSelectAll}
                                            disabled={validRows.length === 0}
                                            title="Select all valid rows"
                                        />
                                    </th>
                                    {PREVIEW_COLUMNS.map((h) => (
                                        <th key={h} style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.rowNumber} style={{ background: r.isValid ? (r.willCreateLedger ? '#fffbeb' : '#fff') : '#fef2f2' }}>
                                        <td style={{ padding: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedRows.has(r.rowNumber)}
                                                disabled={!r.isValid}
                                                onChange={() => toggleRow(r.rowNumber, r.isValid)}
                                                title={r.isValid ? 'Select for posting' : 'Fix errors before posting'}
                                            />
                                        </td>
                                        <td style={{ padding: 8 }}>{r.rowNumber}</td>
                                        <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                                        <td style={{ padding: 8 }}>
                                            {fmtCell(r.accountHead)}
                                            {r.willCreateLedger && <span style={{ display: 'block', fontSize: 10, color: '#b45309' }}>New → Indirect Expenses</span>}
                                        </td>
                                        <td style={{ padding: 8, minWidth: 120, maxWidth: 220 }}>{fmtCell(r.narration)}</td>
                                        <td style={{ padding: 8 }}>{r.payment ? r.payment : '—'}</td>
                                        <td style={{ padding: 8 }}>{r.receipt ? r.receipt : '—'}</td>
                                        <td style={{ padding: 8 }}>{r.balance ? r.balance : '—'}</td>
                                        <td style={{ padding: 8 }}>{fmtCell(r.externalVoucherNo)}</td>
                                        <td style={{ padding: 8 }}>{fmtCell(r.billNo)}</td>
                                        <td style={{ padding: 8, minWidth: 100, maxWidth: 180 }}>{fmtCell(r.remarks)}</td>
                                        <td style={{ padding: 8 }}>{r.isValid ? (r.willCreateLedger ? 'New ledger' : 'OK') : 'Error'}</td>
                                        <td style={{ padding: 8, color: r.isValid ? '#64748b' : '#dc2626' }}>
                                            {r.isValid ? (r.warnings || []).join('; ') : (r.errors || []).join('; ')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
