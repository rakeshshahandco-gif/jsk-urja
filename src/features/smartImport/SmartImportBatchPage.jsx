import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { smartImportApi } from '@/services/smartImportApi';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const btn = { padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f1f5f9', fontWeight: 600, cursor: 'pointer' };
const btnPrimary = { ...btn, background: '#2563eb', color: '#fff', border: 'none' };

const TITLES = {
    tally_ledger_master: 'Tally Ledger Master Import',
    tally_day_book: 'Tally Day Book Import',
    gstr2b_itc: 'GSTR-2B ITC Import',
};

export default function SmartImportBatchPage() {
    const { importType } = useParams();
    const { selectedFY } = useFinancialYear();
    const [preview, setPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [approving, setApproving] = useState(false);
    const [dryRun, setDryRun] = useState(false);

    const rows = preview?.rows || preview?.batch?.rows || [];
    const validRows = useMemo(() => rows.filter((r) => r.isValid), [rows]);

    const onUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const res = await smartImportApi.upload({ file, importType, financialYear: selectedFY, dryRun });
            setPreview(res);
            setSelectedRows(new Set((res.rows || []).filter((r) => r.isValid).map((r) => r.rowNumber)));
            toast.success(res?.batch?.dryRun ? 'Dry run — preview only, nothing will post' : 'File validated — review rows before approve');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Upload failed');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const onApprove = async () => {
        const batchId = preview?.batch?._id || preview?.batch?.id;
        if (!batchId) return;
        setApproving(true);
        try {
            const rowNumbers = [...selectedRows];
            const res = await smartImportApi.approve(batchId, rowNumbers);
            toast.success(res.dryRun ? 'Dry run — no posting' : `Posted ${res.postedCount ?? 0} row(s)`);
            setPreview(null);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Approve failed');
        } finally {
            setApproving(false);
        }
    };

    return (
        <div style={page}>
            <Link to={PATHS.SETTINGS.IMPORT_CENTER} style={{ ...btn, textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}>← Import Center</Link>
            <h1 style={{ margin: '0 0 8px' }}>{TITLES[importType] || 'Smart Import'}</h1>
            <p style={{ color: '#64748b' }}>FY: {selectedFY} — preview required before posting (same pattern as Petty Cash Import).</p>

            <div style={card}>
                <label style={{ ...btnPrimary, display: 'inline-block', cursor: 'pointer' }}>
                    {uploading ? 'Uploading…' : 'Upload Excel / CSV / JSON'}
                    <input type="file" accept=".xlsx,.xls,.csv,.json" style={{ display: 'none' }} onChange={onUpload} disabled={uploading} />
                </label>
                <label style={{ marginLeft: 16, fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run (preview only, no posting)
                </label>
            </div>

            {rows.length > 0 && (
                <div style={card}>
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Valid: {preview?.validCount ?? validRows.length} | Errors: {preview?.errorCount ?? 0}</span>
                        <button type="button" style={btnPrimary} disabled={approving || selectedRows.size === 0} onClick={onApprove}>
                            {approving ? 'Posting…' : `Approve & Post (${selectedRows.size})`}
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }} />
                                    <th style={{ padding: 8 }}>Row</th>
                                    <th style={{ padding: 8 }}>Summary</th>
                                    <th style={{ padding: 8 }}>Status</th>
                                    <th style={{ padding: 8 }}>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.rowNumber} style={{ borderTop: '1px solid #e2e8f0', background: r.isValid ? '#fff' : '#fff1f2' }}>
                                        <td style={{ padding: 8 }}>
                                            <input
                                                type="checkbox"
                                                disabled={!r.isValid}
                                                checked={selectedRows.has(r.rowNumber)}
                                                onChange={() => {
                                                    setSelectedRows((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(r.rowNumber)) next.delete(r.rowNumber);
                                                        else next.add(r.rowNumber);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: 8 }}>{r.rowNumber}</td>
                                        <td style={{ padding: 8 }}>
                                            {importType === 'gstr2b_itc' && (
                                                <span>{r.raw?.supplierName} | {r.raw?.invoiceNumber} | ₹{r.raw?.invoiceValue}</span>
                                            )}
                                            {importType === 'tally_ledger_master' && <span>{r.raw?.ledgerName}</span>}
                                            {importType === 'tally_day_book' && (
                                                <span>{r.raw?.date} | {r.raw?.debitLedger} / {r.raw?.creditLedger} | ₹{r.raw?.amount}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: 8 }}>{r.isValid ? 'Valid' : 'Error'}</td>
                                        <td style={{ padding: 8 }}>
                                            {[...(r.errors || []), ...(r.warnings || [])].join('; ')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {importType === 'gstr2b_itc' && (
                        <p style={{ fontSize: 12, color: '#92400e', marginTop: 12 }}>
                            GSTR-2B creates purchase accounting drafts only — no stock update. Map items from supplier invoice OCR separately.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
