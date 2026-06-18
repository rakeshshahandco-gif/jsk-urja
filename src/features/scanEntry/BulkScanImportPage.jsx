import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { scanEntryApi } from '@/services/scanEntryApi';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16 };
const radioRow = { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', marginBottom: 8 };
const radioRowActive = { ...radioRow, borderColor: '#2563eb', background: '#eff6ff' };

export default function BulkScanImportPage() {
    const { selectedFY } = useFinancialYear();
    const [moduleType, setModuleType] = useState('purchase_invoice');
    const [postingMode, setPostingMode] = useState('with_inventory');
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);

    const onPickFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        try {
            const res = await scanEntryApi.bulkUpload({
                files,
                moduleType,
                financialYear: selectedFY,
                postingMode: moduleType === 'purchase_invoice' ? postingMode : undefined,
            });
            setResult(res);
            const modeLabel = postingMode === 'ledger_only' ? 'without inventory (ledger only)' : 'with inventory';
            toast.success(`Uploaded ${res?.count || files.length} file(s) — ${moduleType === 'purchase_invoice' ? modeLabel : 'draft created'}`);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Bulk upload failed');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    return (
        <div style={{ padding: 24, maxWidth: 720 }}>
            <h2 style={{ marginTop: 0 }}>Bulk Scan Import</h2>
            <p style={{ color: '#6b7280' }}>Upload PDF or image files — one draft is created per file.</p>

            <div style={card}>
                <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Document type</label>
                <select
                    value={moduleType}
                    onChange={(e) => setModuleType(e.target.value)}
                    style={{ padding: '8px 10px', width: '100%', maxWidth: 280, borderRadius: 8, border: '1px solid #d1d5db' }}
                >
                    <option value="purchase_invoice">Purchase</option>
                    <option value="sales_invoice">Sales</option>
                    <option value="expense_bill">Expense</option>
                </select>
            </div>

            {moduleType === 'purchase_invoice' && (
                <div style={card}>
                    <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4 }}>How should this purchase post?</label>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Choose before uploading — you can still change it on the review screen.</p>

                    <label style={postingMode === 'with_inventory' ? radioRowActive : radioRow}>
                        <input
                            type="radio"
                            name="bulkPostingMode"
                            checked={postingMode === 'with_inventory'}
                            onChange={() => setPostingMode('with_inventory')}
                            style={{ marginTop: 3 }}
                        />
                        <span>
                            <strong style={{ display: 'block' }}>With inventory</strong>
                            <span style={{ fontSize: 12, color: '#64748b' }}>Map each line to a stock item. Inventory and ledger both update.</span>
                        </span>
                    </label>

                    <label style={postingMode === 'ledger_only' ? radioRowActive : radioRow}>
                        <input
                            type="radio"
                            name="bulkPostingMode"
                            checked={postingMode === 'ledger_only'}
                            onChange={() => setPostingMode('ledger_only')}
                            style={{ marginTop: 3 }}
                        />
                        <span>
                            <strong style={{ display: 'block' }}>Without inventory (ledger only)</strong>
                            <span style={{ fontSize: 12, color: '#64748b' }}>No item mapping. Posts Purchase + GST + Supplier only (film/setup, job-work bills).</span>
                        </span>
                    </label>
                </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{
                    padding: '10px 16px',
                    border: '1px solid #2563eb',
                    borderRadius: 8,
                    background: '#2563eb',
                    color: '#fff',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    opacity: uploading ? 0.7 : 1,
                }}>
                    {uploading ? 'Uploading…' : 'Select Files & Upload'}
                    <input type="file" multiple accept=".pdf,image/*" onChange={onPickFiles} style={{ display: 'none' }} disabled={uploading} />
                </label>
                <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_DRAFTS} style={{ color: '#2563eb', fontWeight: 600 }}>Open Drafts</Link>
            </div>

            {result && (
                <div style={{ ...card, marginTop: 16, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <strong>Created {result?.count || 0} draft(s).</strong>
                    {' '}Open Drafts to review and post.
                    {moduleType === 'purchase_invoice' && (
                        <div style={{ marginTop: 6, fontSize: 13, color: '#166534' }}>
                            Mode: {postingMode === 'ledger_only' ? 'Without inventory (ledger only)' : 'With inventory'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
