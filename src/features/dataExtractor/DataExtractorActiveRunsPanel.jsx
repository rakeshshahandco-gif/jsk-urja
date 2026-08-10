import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

function fmtTime(v) {
    if (!v) return '—';
    try {
        return new Date(v).toLocaleString();
    } catch {
        return '—';
    }
}

export default function DataExtractorActiveRunsPanel() {
    const [active, setActive] = useState([]);
    const [recent, setRecent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await dataExtractorApi.simpleLeadSearchListRuns();
            setActive(Array.isArray(data?.active) ? data.active : []);
            setRecent(Array.isArray(data?.recent) ? data.recent : []);
        } catch {
            /* soft */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 8000);
        return () => clearInterval(t);
    }, [load]);

    const openRun = (runId) => {
        const url = `${window.location.origin}${PATHS.DATA_EXTRACTOR.RUN(runId)}`;
        window.open(url, `de-run-${runId}`);
    };

    const download = async (runId, format = 'xlsx') => {
        setBusyId(`${runId}-${format}`);
        try {
            try {
                await dataExtractorApi.simpleLeadSearchPersistExport(runId);
            } catch {
                /* may already exist */
            }
            const data = await dataExtractorApi.simpleLeadSearchExportDownloadUrl(runId, { format });
            if (data?.url) {
                window.open(data.url, '_blank', 'noopener');
            } else {
                toast.error('Download URL unavailable');
            }
        } catch (e) {
            toast.error(e.response?.data?.message || 'Export download failed');
        } finally {
            setBusyId('');
        }
    };

    const cancel = async (runId) => {
        if (!window.confirm('Stop Auto Collection for this run? Captured data remains saved.')) return;
        setBusyId(`cancel-${runId}`);
        try {
            await dataExtractorApi.simpleLeadSearchAutoCollectionStop(runId);
            toast.success('Run stop requested');
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not stop run');
        } finally {
            setBusyId('');
        }
    };

    const renderTable = (rows, title) => (
        <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#0f172a' }}>{title}</h3>
            {!rows.length ? (
                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>None</p>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: 8 }}>Keyword</th>
                                <th style={{ padding: 8 }}>Location</th>
                                <th style={{ padding: 8 }}>Started</th>
                                <th style={{ padding: 8 }}>Status</th>
                                <th style={{ padding: 8 }}>Results</th>
                                <th style={{ padding: 8 }}>Verified</th>
                                <th style={{ padding: 8 }}>Updated</th>
                                <th style={{ padding: 8 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.runId} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8, fontWeight: 600 }}>{r.product || r.campaignName || '—'}</td>
                                    <td style={{ padding: 8, color: '#64748b' }}>
                                        {[r.city, r.state, r.country].filter(Boolean).join(', ') || '—'}
                                    </td>
                                    <td style={{ padding: 8 }}>{fmtTime(r.startedAt)}</td>
                                    <td style={{ padding: 8 }}>{r.status}</td>
                                    <td style={{ padding: 8 }}>{r.resultCount ?? 0}</td>
                                    <td style={{ padding: 8 }}>{r.verifiedCount ?? 0}</td>
                                    <td style={{ padding: 8 }}>{fmtTime(r.updatedAt)}</td>
                                    <td style={{ padding: 8 }}>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <button type="button" onClick={() => openRun(r.runId)}>Open</button>
                                            <button
                                                type="button"
                                                disabled={busyId === `${r.runId}-xlsx`}
                                                onClick={() => download(r.runId, 'xlsx')}
                                            >
                                                Excel
                                            </button>
                                            {r.status === 'RUNNING' || r.autoCollectionStatus === 'running' ? (
                                                <button
                                                    type="button"
                                                    disabled={busyId === `cancel-${r.runId}`}
                                                    onClick={() => cancel(r.runId)}
                                                >
                                                    Cancel
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    if (loading && !active.length && !recent.length) {
        return <p style={{ fontSize: 13, color: '#64748b' }}>Loading search runs…</p>;
    }

    return (
        <div style={{ marginBottom: 20 }}>
            {renderTable(active, 'ACTIVE SEARCHES')}
            {renderTable(recent.slice(0, 8), 'RECENT / COMPLETED RUNS')}
        </div>
    );
}
