import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

function statusColor(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'RUNNING' || s === 'QUEUED') return '#1d4ed8';
    if (s === 'COMPLETED') return '#15803d';
    if (s === 'COMPLETED_WITH_WARNINGS') return '#a16207';
    if (s === 'PAUSED') return '#c2410c';
    if (s === 'FAILED' || s === 'STOPPED') return '#b91c1c';
    return '#475569';
}

export default function DataExtractorDiscoveryJobsPage() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        dataExtractorApi.listDiscoveryJobs({ limit: 50 })
            .then((data) => setJobs(data?.results || data?.jobs || (Array.isArray(data) ? data : [])))
            .catch(() => toast.error('Failed to load discovery jobs'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div>Loading discovery jobs…</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Discovery Jobs</h2>
                <Link
                    to={PATHS.DATA_EXTRACTOR.DISCOVERY}
                    style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                >
                    New Discovery
                </Link>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                Track Business Discovery runs. Counts show unique discovered companies vs raw hits.
            </p>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            <th style={{ padding: 10 }}>Date</th>
                            <th style={{ padding: 10 }}>Keyword</th>
                            <th style={{ padding: 10 }}>Location</th>
                            <th style={{ padding: 10 }}>Target</th>
                            <th style={{ padding: 10 }}>Discovered</th>
                            <th style={{ padding: 10 }}>Raw</th>
                            <th style={{ padding: 10 }}>Duplicates</th>
                            <th style={{ padding: 10 }}>Status</th>
                            <th style={{ padding: 10 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.length === 0 && (
                            <tr><td colSpan={9} style={{ padding: 16, color: '#64748b' }}>No discovery jobs yet</td></tr>
                        )}
                        {jobs.map((j) => {
                            const loc = [j.city || j.inputPayload?.city, j.state || j.inputPayload?.state, j.country || j.inputPayload?.country]
                                .filter(Boolean).join(', ') || '—';
                            const keyword = j.keyword || j.inputPayload?.keyword || j.inputSummary || '—';
                            const target = j.targetCompanies ?? j.inputPayload?.targetCompanies ?? j.metadata?.targetCompanies ?? '—';
                            const unique = j.uniqueCount ?? j.discoveredCompanies ?? j.metadata?.uniqueCount ?? j.recordCount ?? 0;
                            const raw = j.rawCount ?? j.metadata?.rawCount ?? '—';
                            const dups = j.duplicateCount ?? j.metadata?.duplicateCount ?? '—';
                            return (
                                <tr key={j._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 10 }}>{j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}</td>
                                    <td style={{ padding: 10, maxWidth: 200 }}>{keyword}</td>
                                    <td style={{ padding: 10 }}>{loc}</td>
                                    <td style={{ padding: 10 }}>{target}</td>
                                    <td style={{ padding: 10 }}>{unique}</td>
                                    <td style={{ padding: 10 }}>{raw}</td>
                                    <td style={{ padding: 10 }}>{dups}</td>
                                    <td style={{ padding: 10, color: statusColor(j.status), fontWeight: 600 }}>{j.status || '—'}</td>
                                    <td style={{ padding: 10 }}>
                                        <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(j._id)}>Open</Link>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
