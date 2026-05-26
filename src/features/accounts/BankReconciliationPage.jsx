import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCashBankAccounts } from '@/services/accountApi';
import {
    uploadBankStatement,
    listBankImports,
    deleteBankImport,
    getBankReconWorkspace,
    runBankMatching,
    approveBankMatches,
    approveBankCombo,
    manualBankLink,
    rejectBankMatch,
    ignoreBankLine,
    markBankCharge,
    undoBankReconciliation,
    getBankReconSummary,
    listBankReconciled,
} from '@/services/bankReconciliationApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

const fmt = (n) =>
    (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

const TABS = [
    { id: 'workspace', label: 'Match workspace' },
    { id: 'suggested', label: 'Suggested' },
    { id: 'unreconciled', label: 'Unreconciled' },
    { id: 'reconciled', label: 'Reconciled' },
    { id: 'imports', label: 'Import batches' },
];

const DATE_TOLERANCE_OPTIONS = [
    { value: 'exact', label: 'Exact date' },
    { value: 'plusMinus1', label: '뿯½1 day' },
    { value: 'plusMinus3', label: '뿯½3 days (default)' },
    { value: 'plusMinus7', label: '뿯½7 days' },
];

const statusColor = (s, reconciled) => {
    if (reconciled || s === 'Reconciled') return { bg: '#ecfdf5', border: '#86efac', label: 'Reconciled' };
    if (s === 'Suggested' || s === 'Possible' || s === 'AutoMatched') return { bg: '#fffbeb', border: '#fcd34d', label: s };
    if (s === 'Ignored' || s === 'BankCharge') return { bg: '#eff6ff', border: '#93c5fd', label: s };
    if (s === 'Rejected') return { bg: '#f5f5f5', border: '#d4d4d4', label: 'Rejected' };
    return { bg: '#fef2f2', border: '#fca5a5', label: 'Unmatched' };
};

const panelStyle = {
    flex: 1,
    minWidth: 0,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '58vh',
};

export default function BankReconciliationPage() {
    const navigate = useNavigate();
    const { hasRole } = useAuth();
    const isAdmin = hasRole('admin') || hasRole('superadmin');
    const financialYear = typeof localStorage !== 'undefined' ? localStorage.getItem('selectedFY') || '' : '';

    const [banks, setBanks] = useState([]);
    const [cashBankAccountId, setCashBankAccountId] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [importId, setImportId] = useState('');
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [dateTolerancePreset, setDateTolerancePreset] = useState('plusMinus3');
    const [activeTab, setActiveTab] = useState('workspace');

    const [workspace, setWorkspace] = useState({ bookLines: [], bankLines: [], suggestions: [], reconciled: [] });
    const [summary, setSummary] = useState(null);
    const [importBatches, setImportBatches] = useState([]);
    const [reconciledList, setReconciledList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [matching, setMatching] = useState(false);

    const [selectedBookIds, setSelectedBookIds] = useState([]);
    const [selectedBankId, setSelectedBankId] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        getCashBankAccounts()
            .then((list) => {
                const arr = Array.isArray(list) ? list : list?.data || [];
                setBanks(arr.filter((b) => b.accountType === 'Bank' && b.status !== 'Inactive'));
            })
            .catch(() => toast.error('Could not load bank accounts'));
    }, []);

    const loadImports = useCallback(async () => {
        if (!cashBankAccountId) return;
        try {
            const data = await listBankImports({ cashBankAccountId, limit: 30 });
            setImportBatches(Array.isArray(data) ? data : []);
        } catch {
            /* optional */
        }
    }, [cashBankAccountId]);

    const loadWorkspace = useCallback(async () => {
        if (!cashBankAccountId) return;
        setLoading(true);
        try {
            const data = await getBankReconWorkspace({
                cashBankAccountId,
                importId: importId || undefined,
                from: fromDate || undefined,
                to: toDate || undefined,
                financialYear: financialYear || undefined,
                dateTolerancePreset,
            });
            setWorkspace(data);
            const sum = await getBankReconSummary({
                cashBankAccountId,
                from: fromDate || undefined,
                to: toDate || undefined,
            });
            setSummary(sum);
            const rec = await listBankReconciled({
                cashBankAccountId,
                from: fromDate || undefined,
                to: toDate || undefined,
            });
            setReconciledList(Array.isArray(rec) ? rec : []);
        } catch (e) {
            toast.error(e.response?.data?.message || e.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [cashBankAccountId, importId, fromDate, toDate, financialYear, dateTolerancePreset]);

    useEffect(() => {
        loadWorkspace();
        loadImports();
    }, [loadWorkspace, loadImports]);

    const handleUpload = async (skipDup = false) => {
        if (!file || !cashBankAccountId) {
            toast.error('Select bank account and file');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('cashBankAccountId', cashBankAccountId);
            if (financialYear) fd.append('financialYear', financialYear);
            if (skipDup) fd.append('skipDuplicateRows', 'true');
            const res = await uploadBankStatement(fd);
            setImportId(res.import?._id || '');
            toast.success(`Imported ${res.rowCount} lines`);
            setFile(null);
            loadWorkspace();
            loadImports();
        } catch (e) {
            const msg = e.response?.data?.message || 'Import failed';
            if (msg.includes('Duplicate') && !skipDup) {
                if (window.confirm(`${msg}\n\nImport only new (non-duplicate) rows?`)) {
                    setUploading(false);
                    return handleUpload(true);
                }
            } else {
                toast.error(msg);
            }
        } finally {
            setUploading(false);
        }
    };

    const handleAutoMatch = async () => {
        if (!cashBankAccountId) return;
        setMatching(true);
        try {
            const data = await runBankMatching({
                cashBankAccountId,
                importId: importId || undefined,
                from: fromDate || undefined,
                to: toDate || undefined,
                financialYear: financialYear || undefined,
                dateTolerancePreset,
            });
            setWorkspace(data);
            toast.success('Auto-match run complete — review suggested matches');
            setActiveTab('suggested');
        } catch (e) {
            toast.error(e.response?.data?.message || 'Auto-match failed');
        } finally {
            setMatching(false);
        }
    };

    const filteredBook = useMemo(() => {
        let rows = workspace.bookLines || [];
        if (filterStatus === 'reconciled') rows = rows.filter((r) => r.reconciled);
        if (filterStatus === 'open') rows = rows.filter((r) => !r.reconciled);
        return rows;
    }, [workspace.bookLines, filterStatus]);

    const filteredBank = useMemo(() => {
        let rows = workspace.bankLines || [];
        if (filterStatus === 'reconciled') rows = rows.filter((r) => r.matchStatus === 'Reconciled');
        if (filterStatus === 'open') {
            rows = rows.filter((r) =>
                ['Unmatched', 'Possible', 'Suggested', 'AutoMatched'].includes(r.matchStatus),
            );
        }
        return rows;
    }, [workspace.bankLines, filterStatus]);

    const bookUnreconciled = useMemo(
        () => (workspace.bookLines || []).filter((r) => !r.reconciled),
        [workspace.bookLines],
    );
    const bankUnmatched = useMemo(
        () => (workspace.bankLines || []).filter((r) =>
            ['Unmatched', 'Suggested', 'Possible', 'AutoMatched', 'Rejected'].includes(r.matchStatus),
        ),
        [workspace.bankLines],
    );

    const approveSuggestion = async (s) => {
        try {
            if (s.isCombo && s.allocatedAmounts?.length) {
                await approveBankCombo({
                    bankLineId: s.bankLineId,
                    allocations: s.allocatedAmounts,
                    confidence: s.confidence,
                });
            } else {
                await approveBankMatches({
                    pairs: [{
                        bankLineId: s.bankLineId,
                        bookRefId: s.bookRefId,
                        matchKind: s.matchKind,
                        confidence: s.confidence,
                        matchPriority: s.matchPriority,
                        matchReasons: s.matchReasons,
                    }],
                });
            }
            toast.success('Reconciled');
            loadWorkspace();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Approve failed');
        }
    };

    const manualMatch = async () => {
        if (!selectedBankId || !selectedBookIds.length) {
            toast.error('Select one bank line and at least one book line');
            return;
        }
        try {
            if (selectedBookIds.length === 1) {
                await manualBankLink({ bankLineId: selectedBankId, bookRefId: selectedBookIds[0] });
            } else {
                const bankLine = workspace.bankLines.find((b) => String(b._id) === selectedBankId);
                const books = selectedBookIds.map((id) => workspace.bookLines.find((b) => String(b._id) === id)).filter(Boolean);
                const total = books.reduce((s, b) => s + (b.openAmount ?? b.amount), 0);
                if (bankLine && Math.abs(total - bankLine.amount) > 0.02) {
                    toast.error('Selected book amounts must sum to bank line amount for multi-match');
                    return;
                }
                await approveBankCombo({
                    bankLineId: selectedBankId,
                    allocations: books.map((b) => ({
                        bookRefId: b._id,
                        amount: b.openAmount ?? b.amount,
                    })),
                });
            }
            toast.success('Manual match saved');
            setSelectedBankId('');
            setSelectedBookIds([]);
            loadWorkspace();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Manual match failed');
        }
    };

    const onReject = async (bankLineId) => {
        try {
            await rejectBankMatch({ bankLineId });
            toast.success('Rejected');
            loadWorkspace();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    const onIgnore = async (bankLineId) => {
        try {
            await ignoreBankLine({ bankLineId });
            toast.success('Ignored');
            loadWorkspace();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    const onBankCharge = async (bankLineId) => {
        try {
            await markBankCharge({ bankLineId });
            toast.success('Marked as bank charge');
            loadWorkspace();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    const onUndo = async (recId) => {
        const reason = window.prompt('Reason for undo (optional):') || '';
        try {
            await undoBankReconciliation(recId, reason);
            toast.success('Reconciliation undone');
            loadWorkspace();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Undo failed');
        }
    };

    const onDeleteImport = async (id) => {
        if (!window.confirm('Delete this import batch? Only allowed if no reconciled lines.')) return;
        try {
            await deleteBankImport(id);
            toast.success('Import deleted');
            if (importId === id) setImportId('');
            loadImports();
            loadWorkspace();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Delete failed');
        }
    };

    const toggleBook = (id, reconciled) => {
        if (reconciled) return;
        setSelectedBookIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const openVoucherFromBank = (line) => {
        const nature = line.drCr === 'Deposit' ? 'receipt' : 'payment';
        const path = nature === 'receipt' ? PATHS.ACCOUNTS.RECEIPT_ENTRY : PATHS.ACCOUNTS.PAYMENT_ENTRY;
        navigate(`${path}?prefillAmount=${line.amount}&prefillNarration=${encodeURIComponent(line.narration || '')}&bankAccountId=${cashBankAccountId}`);
    };

    const suggestions = workspace.suggestions || [];

    return (
        <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Bank Reconciliation</h1>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
                Match bank statement with book entries. Does not change vouchers or ledger balances.
                {financialYear ? ` 뿯½ F.Y. ${financialYear}` : ''}
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: activeTab === t.id ? '2px solid #0d9488' : '1px solid #cbd5e1',
                            background: activeTab === t.id ? '#ecfdf5' : '#fff',
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: 'pointer',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
                <label style={{ fontSize: 12, color: '#475569' }}>
                    Bank account
                    <select
                        value={cashBankAccountId}
                        onChange={(e) => setCashBankAccountId(e.target.value)}
                        style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 200 }}
                    >
                        <option value="">Select bank</option>
                        {banks.map((b) => (
                            <option key={b._id} value={b._id}>{b.accountName}</option>
                        ))}
                    </select>
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                    Import batch
                    <select
                        value={importId}
                        onChange={(e) => setImportId(e.target.value)}
                        style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 160 }}
                    >
                        <option value="">All imports</option>
                        {importBatches.map((imp) => (
                            <option key={imp._id} value={imp._id}>
                                {imp.fileName} ({imp.rowCount})
                            </option>
                        ))}
                    </select>
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                    Date tolerance
                    <select
                        value={dateTolerancePreset}
                        onChange={(e) => setDateTolerancePreset(e.target.value)}
                        style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                    >
                        {DATE_TOLERANCE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                    From
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }} />
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                    To
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }} />
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                    Import CSV / Excel
                    <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'block', marginTop: 4, fontSize: 12 }} />
                </label>
                <button type="button" onClick={() => handleUpload(false)} disabled={uploading || !file} style={{ padding: '9px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                    {uploading ? 'Uploading…' : 'Import statement'}
                </button>
                <button type="button" onClick={handleAutoMatch} disabled={matching || !cashBankAccountId} style={{ padding: '9px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                    {matching ? 'Matching…' : 'Auto match'}
                </button>
                <button type="button" onClick={loadWorkspace} disabled={loading} style={{ padding: '9px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                    Refresh
                </button>
            </div>

            {summary && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', fontSize: 12, color: '#475569' }}>
                    <span>Book: {summary.bookLineCount} ({summary.unreconciledBookCount} open)</span>
                    <span>Bank: {summary.bankLineCount} ({summary.unreconciledBankCount} open)</span>
                    <span>Approved: {summary.approvedMatchCount}</span>
                </div>
            )}

            {activeTab === 'suggested' && (
                <div style={{ marginBottom: 20 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Suggested matches ({suggestions.length})</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                        {suggestions.map((s, i) => (
                            <div key={i} style={{ padding: 12, borderRadius: 8, border: '1px solid #fcd34d', background: '#fffbeb' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                                    {s.matchKind} 뿯½ {s.confidence}% 뿯½ P{s.matchPriority || '—'}
                                </div>
                                <div style={{ fontSize: 10, color: '#78716c', marginTop: 4 }}>
                                    {s.matchReasons?.join(', ')}
                                    {s.dateDifferenceDays != null ? ` 뿯½ 뿯ν${s.dateDifferenceDays}d` : ''}
                                    {s.narrationSimilarity ? ` 뿯½ narr ${s.narrationSimilarity}%` : ''}
                                </div>
                                {s.isCombo ? (
                                    <div style={{ fontSize: 11, marginTop: 6 }}>
                                        Bank {fmt(s.bank?.amount)} 뿯↽ {s.books?.length} book lines
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ fontSize: 11, marginTop: 4 }}>Book: {s.book?.voucherNo} 뿯½ {fmt(s.book?.amount)}</div>
                                        <div style={{ fontSize: 11 }}>Bank: {fmtDate(s.bank?.txnDate)} 뿯½ {fmt(s.bank?.amount)}</div>
                                    </>
                                )}
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <button type="button" onClick={() => approveSuggestion(s)} style={{ flex: 1, padding: 6, fontSize: 11, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                                        Approve
                                    </button>
                                    {!s.isCombo && (
                                        <button type="button" onClick={() => onReject(s.bankLineId)} style={{ padding: '6px 10px', fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}>
                                            Reject
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {!suggestions.length && <p style={{ fontSize: 12, color: '#94a3b8' }}>Run Auto match or adjust date tolerance.</p>}
                </div>
            )}

            {activeTab === 'unreconciled' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                    <div style={panelStyle}>
                        <div style={{ padding: 10, fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>In books, not in bank ({bookUnreconciled.length})</div>
                        <div style={{ overflow: 'auto', flex: 1, fontSize: 12 }}>
                            {bookUnreconciled.slice(0, 100).map((r) => (
                                <div key={r._id} style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                                    {fmtDate(r.date)} 뿯½ {r.voucherNo} 뿯½ {fmt(r.openAmount ?? r.amount)}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={panelStyle}>
                        <div style={{ padding: 10, fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>In bank, not in books ({bankUnmatched.length})</div>
                        <div style={{ overflow: 'auto', flex: 1, fontSize: 12 }}>
                            {bankUnmatched.slice(0, 100).map((r) => (
                                <div key={r._id} style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                                    {fmtDate(r.txnDate)} 뿯½ {fmt(r.amount)} 뿯½ {(r.narration || '').slice(0, 40)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'reconciled' && (
                <div style={{ marginBottom: 20, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ padding: 8, textAlign: 'left' }}>Date</th>
                                <th style={{ padding: 8 }}>Voucher</th>
                                <th style={{ padding: 8 }}>Amount</th>
                                <th style={{ padding: 8 }}>Kind</th>
                                <th style={{ padding: 8 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reconciledList.map((r) => (
                                <tr key={r._id}>
                                    <td style={{ padding: 8 }}>{fmtDate(r.reconciliationDate)}</td>
                                    <td style={{ padding: 8 }}>{r.voucherNo}</td>
                                    <td style={{ padding: 8 }}>{fmt(r.allocatedAmount)}</td>
                                    <td style={{ padding: 8 }}>{r.matchKind}</td>
                                    <td style={{ padding: 8 }}>
                                        {isAdmin && (
                                            <button type="button" onClick={() => onUndo(r._id)} style={{ fontSize: 11, padding: '4px 8px' }}>
                                                Undo
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'imports' && (
                <div style={{ marginBottom: 20 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ padding: 8, textAlign: 'left' }}>File</th>
                                <th style={{ padding: 8 }}>Rows</th>
                                <th style={{ padding: 8 }}>Period</th>
                                <th style={{ padding: 8 }}>Imported</th>
                                {isAdmin && <th style={{ padding: 8 }} />}
                            </tr>
                        </thead>
                        <tbody>
                            {importBatches.map((imp) => (
                                <tr key={imp._id}>
                                    <td style={{ padding: 8 }}>{imp.fileName}</td>
                                    <td style={{ padding: 8 }}>{imp.rowCount}</td>
                                    <td style={{ padding: 8 }}>{fmtDate(imp.dateFrom)} – {fmtDate(imp.dateTo)}</td>
                                    <td style={{ padding: 8 }}>{fmtDate(imp.createdAt)}</td>
                                    {isAdmin && (
                                        <td style={{ padding: 8 }}>
                                            <button type="button" onClick={() => onDeleteImport(imp._id)} style={{ fontSize: 11 }}>Delete</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'workspace' && (
                <>
                    <label style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                        Filter
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ marginLeft: 8, padding: 6, borderRadius: 6 }}>
                            <option value="all">All</option>
                            <option value="open">Open</option>
                            <option value="reconciled">Reconciled</option>
                        </select>
                    </label>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', minHeight: 320 }}>
                        <div style={panelStyle}>
                            <div style={{ padding: '10px 12px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                Book entries (multi-select for split match)
                            </div>
                            <div style={{ overflow: 'auto', flex: 1 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f9fafb' }}>
                                            <th style={{ padding: 8 }} />
                                            <th style={{ padding: 8 }}>Date</th>
                                            <th style={{ padding: 8 }}>Voucher</th>
                                            <th style={{ padding: 8 }}>Open</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBook.map((r) => {
                                            const sc = statusColor(null, r.reconciled);
                                            const id = String(r._id);
                                            return (
                                                <tr key={r._id} style={{ background: selectedBookIds.includes(id) ? '#eff6ff' : sc.bg, borderLeft: `3px solid ${sc.border}` }}>
                                                    <td style={{ padding: 8 }}>
                                                        <input type="checkbox" checked={selectedBookIds.includes(id)} disabled={r.reconciled} onChange={() => toggleBook(id, r.reconciled)} />
                                                    </td>
                                                    <td style={{ padding: 8 }}>{fmtDate(r.date)}</td>
                                                    <td style={{ padding: 8 }}>{r.voucherNo}</td>
                                                    <td style={{ padding: 8 }}>{fmt(r.openAmount ?? r.amount)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={{ ...panelStyle, flex: '0 0 200px', maxHeight: '58vh' }}>
                            <div style={{ padding: 10, fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Manual</div>
                            <div style={{ padding: 12, flex: 1 }}>
                                <p style={{ fontSize: 11, color: '#64748b' }}>Select bank line + one or more book lines with matching total.</p>
                            </div>
                            <div style={{ padding: 8, borderTop: '1px solid #e2e8f0' }}>
                                <button type="button" onClick={manualMatch} style={{ width: '100%', padding: 8, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                                    Match selected
                                </button>
                            </div>
                        </div>
                        <div style={panelStyle}>
                            <div style={{ padding: '10px 12px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>Bank statement</div>
                            <div style={{ overflow: 'auto', flex: 1 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f9fafb' }}>
                                            <th style={{ padding: 8 }} />
                                            <th style={{ padding: 8 }}>Date</th>
                                            <th style={{ padding: 8 }}>Amount</th>
                                            <th style={{ padding: 8 }}>Narration</th>
                                            <th style={{ padding: 8 }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBank.map((r) => {
                                            const sc = statusColor(r.matchStatus);
                                            return (
                                                <tr key={r._id} style={{ background: selectedBankId === r._id ? '#eff6ff' : sc.bg, borderLeft: `3px solid ${sc.border}` }}>
                                                    <td style={{ padding: 8 }}>
                                                        <input type="radio" name="bank" checked={selectedBankId === r._id} disabled={r.matchStatus === 'Reconciled'} onChange={() => setSelectedBankId(r._id)} />
                                                    </td>
                                                    <td style={{ padding: 8 }}>{fmtDate(r.txnDate)}</td>
                                                    <td style={{ padding: 8 }}>{fmt(r.amount)}</td>
                                                    <td style={{ padding: 8 }}>{(r.narration || '').slice(0, 24)}</td>
                                                    <td style={{ padding: 8 }}>
                                                        {r.matchStatus !== 'Reconciled' && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <button type="button" onClick={() => onReject(r._id)} style={{ fontSize: 10 }}>Reject</button>
                                                                <button type="button" onClick={() => onIgnore(r._id)} style={{ fontSize: 10 }}>Ignore</button>
                                                                <button type="button" onClick={() => onBankCharge(r._id)} style={{ fontSize: 10 }}>Bank charge</button>
                                                                <button type="button" onClick={() => openVoucherFromBank(r)} style={{ fontSize: 10 }}>Create voucher</button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
