import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { scanEntryApi } from '@/services/scanEntryApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };
const inp = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 };
const btn = { padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' };
const badge = (status) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background:
        status === 'posted' ? '#dcfce7' :
            status === 'duplicate_found' ? '#fee2e2' :
                status === 'error' ? '#fef3c7' :
                    '#e0e7ff',
    color:
        status === 'posted' ? '#166534' :
            status === 'duplicate_found' ? '#991b1b' :
                status === 'error' ? '#92400e' :
                    '#3730a3',
});

function moduleLabel(mt) {
    if (mt === 'purchase_invoice') return 'Purchase';
    if (mt === 'sales_invoice') return 'Sales';
    if (mt === 'expense_bill') return 'Expense';
    return mt;
}

export default function ScanEntryDraftsPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [filters, setFilters] = useState({
        search: '',
        moduleType: '',
        status: '',
    });
    const [refreshTick, setRefreshTick] = useState(0);

    const load = async () => {
        setLoading(true);
        try {
            const data = await scanEntryApi.listDrafts({
                search: filters.search || undefined,
                moduleType: filters.moduleType || undefined,
                status: filters.status || undefined,
                limit: 100,
            });
            setRows(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load drafts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshTick]);

    const filtered = useMemo(() => rows, [rows]);

    return (
        <div style={page}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Scan Entry — Pending OCR Drafts</h2>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                        Review OCR drafts, map parties/items, validate and post.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_BULK} style={{ ...btn, textDecoration: 'none' }}>Bulk Upload</Link>
                    <button style={btn} onClick={() => setRefreshTick((x) => x + 1)}>Refresh</button>
                </div>
            </div>

            <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    placeholder="Search file / party / bill no"
                    style={{ ...inp, minWidth: 260 }}
                />
                <select
                    value={filters.moduleType}
                    onChange={(e) => setFilters((f) => ({ ...f, moduleType: e.target.value }))}
                    style={inp}
                >
                    <option value="">All modules</option>
                    <option value="purchase_invoice">Purchase</option>
                    <option value="sales_invoice">Sales</option>
                    <option value="expense_bill">Expense</option>
                </select>
                <select
                    value={filters.status}
                    onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                    style={inp}
                >
                    <option value="">All statuses</option>
                    <option value="uploaded">Uploaded</option>
                    <option value="ocr_processing">OCR Processing</option>
                    <option value="ocr_completed">OCR Completed</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="ready_to_post">Ready to Post</option>
                    <option value="duplicate_found">Duplicate</option>
                    <option value="error">Error</option>
                    <option value="posted">Posted</option>
                </select>
                <button style={{ ...btn, background: '#2563eb', borderColor: '#2563eb', color: '#fff' }} onClick={load}>Apply</button>
            </div>

            <div style={card}>
                {loading ? (
                    <div>Loading drafts…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ color: '#6b7280' }}>No scan entry drafts found.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '8px 6px' }}>Created</th>
                                    <th style={{ padding: '8px 6px' }}>Module</th>
                                    <th style={{ padding: '8px 6px' }}>File</th>
                                    <th style={{ padding: '8px 6px' }}>Party</th>
                                    <th style={{ padding: '8px 6px' }}>Amount</th>
                                    <th style={{ padding: '8px 6px' }}>Status</th>
                                    <th style={{ padding: '8px 6px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r) => {
                                    const ex = r.extractedData || {};
                                    const party =
                                        ex.supplierName ||
                                        ex.customerName ||
                                        ex.vendorName ||
                                        r.mappedSupplierId?.supplierName ||
                                        r.mappedCustomerId?.customerName ||
                                        '—';
                                    const amount = ex.grandTotal ?? ex.totalAmount ?? ex.taxableAmount ?? '—';
                                    return (
                                        <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 6px' }}>{new Date(r.createdAt).toLocaleString()}</td>
                                            <td style={{ padding: '8px 6px' }}>{moduleLabel(r.moduleType)}</td>
                                            <td style={{ padding: '8px 6px' }}>{r.originalFileName || '—'}</td>
                                            <td style={{ padding: '8px 6px' }}>{party}</td>
                                            <td style={{ padding: '8px 6px' }}>{amount}</td>
                                            <td style={{ padding: '8px 6px' }}>
                                                <span style={badge(r.status)}>{r.status}</span>
                                            </td>
                                            <td style={{ padding: '8px 6px' }}>
                                                <button
                                                    style={{ ...btn, padding: '6px 10px' }}
                                                    onClick={() => navigate(PATHS.DOCUMENTS.SCAN_ENTRY_REVIEW(r._id))}
                                                >
                                                    Review
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

