import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { CUSTOMER_DOCUMENT_TYPES } from '@/config/customerKyc.config';
import {
    fetchMissingDocumentReport,
    fetchExpiringDocumentsReport,
} from '@/services/customerDocumentApi';
import { useAuth } from '@/hooks/useAuth';

const REPORT_LINKS = [
    { type: 'gst_certificate', label: 'Customers without GST Certificate' },
    { type: 'pan_card', label: 'Customers without PAN Card' },
    { type: 'tan_certificate', label: 'Customers without TAN Certificate' },
    { type: 'msme_certificate', label: 'Customers without MSME Certificate' },
    { type: 'iec_certificate', label: 'Customers without IEC Certificate' },
    { type: 'cancelled_cheque', label: 'Customers without Cancelled Cheque' },
];

export default function CustomerKycReportsPage() {
    const { hasPermission } = useAuth();
    const canView = hasPermission('reports.customer_kyc_reports.view');
    const [activeReport, setActiveReport] = useState('gst_certificate');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expiring, setExpiring] = useState(null);

    const loadMissing = async (documentType) => {
        setLoading(true);
        try {
            const data = await fetchMissingDocumentReport(documentType, { limit: 500 });
            setResults(data.results || []);
            setActiveReport(documentType);
            setExpiring(null);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load report');
        } finally {
            setLoading(false);
        }
    };

    const loadExpiring = async (withinDays = 30) => {
        setLoading(true);
        try {
            const data = await fetchExpiringDocumentsReport({ withinDays, limit: 500 });
            setExpiring(data);
            setResults([]);
            setActiveReport(`expiring_${withinDays}`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load expiring report');
        } finally {
            setLoading(false);
        }
    };

    const loadMissingKyc = async () => {
        setLoading(true);
        try {
            const pan = await fetchMissingDocumentReport('pan_card', { limit: 500 });
            const kyc = await fetchMissingDocumentReport('kyc_form', { limit: 500 });
            const gst = await fetchMissingDocumentReport('gst_certificate', { limit: 500 });
            const ids = new Set();
            const merged = [];
            for (const list of [pan.results, kyc.results, gst.results]) {
                for (const row of list || []) {
                    if (!ids.has(String(row._id))) {
                        ids.add(String(row._id));
                        merged.push(row);
                    }
                }
            }
            setResults(merged);
            setActiveReport('missing_kyc');
            setExpiring(null);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load KYC report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canView) loadMissing('gst_certificate');
    }, [canView]);

    if (!canView) {
        return (
            <div style={{ padding: 24 }}>
                <p style={{ color: '#b91c1c' }}>You do not have permission to view Customer KYC reports.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px 30px', maxWidth: 960, margin: '0 auto' }}>
            <div style={{ marginBottom: 8, fontSize: 13, color: '#64748b' }}>
                <Link to={PATHS.REPORTS.ROOT} style={{ color: '#2563eb', textDecoration: 'none' }}>Reports</Link>
                {' / '}
                <span style={{ fontWeight: 600, color: '#334155' }}>Customer KYC / Documents</span>
            </div>
            <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Customer KYC &amp; Document Reports</h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {REPORT_LINKS.map((r) => (
                    <button
                        key={r.type}
                        type="button"
                        onClick={() => loadMissing(r.type)}
                        style={{
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: 8,
                            border: activeReport === r.type ? '2px solid #2563eb' : '1px solid #e2e8f0',
                            background: activeReport === r.type ? '#eff6ff' : '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        {r.label}
                    </button>
                ))}
                <button type="button" onClick={loadMissingKyc} style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>
                    Customers without KYC Documents
                </button>
                {[30, 60, 90].map((days) => (
                    <button
                        key={days}
                        type="button"
                        onClick={() => loadExpiring(days)}
                        style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #fed7aa', background: '#fff7ed', cursor: 'pointer' }}
                    >
                        Expiring in {days} days
                    </button>
                ))}
            </div>

            {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

            {expiring && (
                <div>
                    <p style={{ fontWeight: 700, marginBottom: 12 }}>{expiring.total} document(s) expiring within {expiring.withinDays} days</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Customer</th>
                                <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Type</th>
                                <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Expiry</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(expiring.results || []).map((row) => (
                                <tr key={row._id}>
                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                                        {row.customer?.company || row.customer?.customerName || '—'}
                                    </td>
                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                                        {CUSTOMER_DOCUMENT_TYPES.find((t) => t.id === row.documentType)?.label || row.documentType}
                                    </td>
                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                                        {row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!expiring && !loading && (
                <>
                    <p style={{ fontWeight: 700, marginBottom: 12 }}>{results.length} customer(s)</p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {results.map((c) => (
                            <li key={c._id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{c.company || c.customerName || '—'} {c.customerCode ? `(${c.customerCode})` : ''}</span>
                                <Link to={PATHS.CUSTOMERS.DETAILS(c._id)} style={{ color: '#2563eb', fontSize: 12, fontWeight: 700 }}>Open</Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
