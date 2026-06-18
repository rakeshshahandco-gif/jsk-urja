import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { scanEntryApi } from '@/services/scanEntryApi';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const btn = { padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, textDecoration: 'none', color: '#1e293b', display: 'inline-block' };
const btnPrimary = { ...btn, background: '#2563eb', color: '#fff', borderColor: '#2563eb' };

const IMPORT_LINKS = [
    { title: 'Scan Purchase Invoice (OCR)', path: PATHS.DOCUMENTS.SCAN_ENTRY_BULK, query: '?module=purchase_invoice', desc: 'PDF/image supplier bills' },
    { title: 'Scan Expense Bill (OCR)', path: PATHS.DOCUMENTS.SCAN_ENTRY_BULK, query: '?module=expense_bill', desc: 'Expense vouchers from bills' },
    { title: 'Tally Ledger Master', path: PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_ledger_master'), desc: 'Import ledgers before day book' },
    { title: 'Tally Day Book', path: PATHS.DOCUMENTS.SMART_IMPORT_BATCH('tally_day_book'), desc: 'Excel day book → review drafts' },
    { title: 'GSTR-2B ITC Import', path: PATHS.DOCUMENTS.SMART_IMPORT_BATCH('gstr2b_itc'), desc: 'Purchase/ITC drafts, no stock' },
];

export default function SmartImportHubPage() {
    const [summary, setSummary] = useState(null);
    const [drafts, setDrafts] = useState([]);
    const [tab, setTab] = useState('pending');

    useEffect(() => {
        (async () => {
            try {
                const [rep, list] = await Promise.all([
                    scanEntryApi.getReportSummary(),
                    scanEntryApi.listDrafts({ limit: 50 }),
                ]);
                setSummary(rep?.summary || rep);
                setDrafts(list?.results || list?.drafts || []);
            } catch {
                setDrafts([]);
            }
        })();
    }, []);

    const pending = drafts.filter((d) => !['posted', 'rejected'].includes(d.status));
    const posted = drafts.filter((d) => d.status === 'posted');
    const duplicates = drafts.filter((d) => d.status === 'duplicate_found' || d.duplicateCheckResult?.isDuplicate);

    const showList = tab === 'pending' ? pending : tab === 'posted' ? posted : tab === 'duplicates' ? duplicates : pending;

    return (
        <div style={page}>
            <h1 style={{ margin: '0 0 8px' }}>AI Smart Import &amp; Scan Entry</h1>
            <p style={{ color: '#64748b', marginBottom: 20 }}>Upload → map → validate → preview → approve. Petty Cash Import unchanged under Accounts.</p>

            {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                    {[
                        ['Pending', summary.pending],
                        ['Posted', summary.posted],
                        ['Duplicates', summary.duplicate],
                        ['Errors', summary.errors],
                    ].map(([label, val]) => (
                        <div key={label} style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
                            <div style={{ fontSize: 22, fontWeight: 800 }}>{val ?? 0}</div>
                        </div>
                    ))}
                </div>
            )}

            <div style={card}>
                <h3 style={{ marginTop: 0 }}>Import channels</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {IMPORT_LINKS.map((l) => (
                        <Link key={l.title} to={`${l.path}${l.query || ''}`} style={{ ...card, marginBottom: 0, textDecoration: 'none', color: 'inherit' }}>
                            <div style={{ fontWeight: 700 }}>{l.title}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{l.desc}</div>
                        </Link>
                    ))}
                </div>
            </div>

            <div style={card}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {['pending', 'duplicates', 'posted', 'reports'].map((t) => (
                        <button
                            key={t}
                            type="button"
                            style={tab === t ? btnPrimary : btn}
                            onClick={() => setTab(t)}
                        >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                    <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_DRAFTS} style={btn}>All OCR drafts</Link>
                    <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_REPORTS} style={btn}>Import reports</Link>
                </div>

                {tab === 'reports' ? (
                    <p style={{ color: '#64748b' }}>See Scan Entry Reports for user-wise import statistics.</p>
                ) : (
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                                <th style={{ padding: 8 }}>File</th>
                                <th style={{ padding: 8 }}>Type</th>
                                <th style={{ padding: 8 }}>Status</th>
                                <th style={{ padding: 8 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {showList.length === 0 && (
                                <tr><td colSpan={4} style={{ padding: 16, color: '#94a3b8' }}>No records</td></tr>
                            )}
                            {showList.map((d) => (
                                <tr key={d._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8 }}>{d.originalFileName}</td>
                                    <td style={{ padding: 8 }}>{d.moduleType}</td>
                                    <td style={{ padding: 8 }}>{d.status}</td>
                                    <td style={{ padding: 8 }}>
                                        <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_REVIEW(d._id)}>Review</Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
