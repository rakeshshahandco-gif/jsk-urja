import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { voucherAttachmentApi } from '@/services/voucherAttachmentApi';
import { PATHS } from '@/routes/paths';
import DocumentsFeatureGate from '@/features/documents/DocumentsFeatureGate';

const SEARCH_OPTIONS = [
    { id: 'billNo', label: 'Bill No' },
    { id: 'voucherNo', label: 'Voucher No' },
    { id: 'partyName', label: 'Party Name' },
    { id: 'lastSaved', label: 'Last Saved' },
];

const pageShell = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' };

function ScanBillsContent() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchBy, setSearchBy] = useState('billNo');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);

    const loadStats = useCallback(async () => {
        try {
            const data = await voucherAttachmentApi.summaryStats();
            setStats(data);
        } catch {
            /* optional */
        }
    }, []);

    const runSearch = useCallback(async (overrideQuery) => {
        setLoading(true);
        try {
            const data = await voucherAttachmentApi.searchVouchers({
                searchBy,
                search: overrideQuery ?? query,
                limit: 30,
            });
            setResults(data?.results || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Search failed');
        } finally {
            setLoading(false);
        }
    }, [query, searchBy]);

    useEffect(() => {
        loadStats();
        runSearch('');
    }, []);

    useEffect(() => {
        const voucherId = searchParams.get('voucherId');
        if (searchParams.get('upload') === '1' && voucherId) {
            runSearch('');
        }
    }, [searchParams, runSearch]);

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
    const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

    return (
        <div style={pageShell}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Scan Bills</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Search vouchers and attach supplier bills — last saved shown first</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate(PATHS.DOCUMENTS.MISSING)}
                    style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                    Missing Attachments
                </button>
            </div>

            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <StatCard label="Missing purchase bills" value={stats.missingPurchaseBills} tone="#d97706" />
                    <StatCard label="Missing expense bills" value={stats.missingExpenseBills} tone="#64748b" />
                    <StatCard label="Missing dispatch proof" value={stats.missingSalesDispatchProof} tone="#2563eb" />
                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10 }}>Search by</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {SEARCH_OPTIONS.map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSearchBy(opt.id)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 20,
                                border: searchBy === opt.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                background: searchBy === opt.id ? '#eff6ff' : '#fff',
                                color: searchBy === opt.id ? '#2563eb' : '#475569',
                                fontWeight: 600,
                                fontSize: 12,
                                cursor: 'pointer',
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={searchBy === 'billNo' ? 'e.g. 868' : 'Enter search value…'}
                        style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    />
                    <button
                        type="button"
                        onClick={() => runSearch()}
                        style={{ padding: '9px 18px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Search
                    </button>
                </div>
            </div>

            {loading ? (
                <p style={{ color: '#64748b' }}>Searching…</p>
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {results.map((row) => (
                        <div key={row.voucherId} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 15 }}>Purchase Invoice {row.voucherNumber}</div>
                                <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>{row.partyName}</div>
                                <div style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                                    Bill {row.billNo || '—'} · {fmt(row.voucherDate)} · {fmtAmt(row.amount)}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: 20,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: row.attachmentMissing ? '#fffbeb' : '#f0fdf4',
                                    color: row.attachmentMissing ? '#d97706' : '#16a34a',
                                    border: `1px solid ${row.attachmentMissing ? '#fcd34d' : '#86efac'}`,
                                }}>
                                    {row.statusLabel}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => navigate(`${PATHS.DOCUMENTS.MOBILE_SCAN}?voucherType=${row.voucherType}&voucherId=${row.voucherId}`)}
                                    style={{ padding: '9px 16px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                                >
                                    Scan &amp; Attach
                                </button>
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && <p style={{ color: '#94a3b8' }}>No vouchers found. Try another search.</p>}
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, tone }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: tone }}>{value ?? 0}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
        </div>
    );
}

export default function ScanBillsPage() {
    return (
        <DocumentsFeatureGate>
            <ScanBillsContent />
        </DocumentsFeatureGate>
    );
}
