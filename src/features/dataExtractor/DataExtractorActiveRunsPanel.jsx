import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';
import { canShowDeleteData, deleteConfirmMessage, includeDeletedQueryValue, isDataExtractorAdminUser, isLiveRunStatus, isPausedRun, isRunningDeleteBlocked } from './simpleLeadSearchOwnershipUi';

function fmtTime(v) {
    if (!v) return '—';
    try {
        return new Date(v).toLocaleString();
    } catch {
        return '—';
    }
}

export default function DataExtractorActiveRunsPanel() {
    const { user, hasRole } = useAuth();
    const isAdmin = isDataExtractorAdminUser(user, hasRole);
    const [scope, setScope] = useState('mine');
    const [showDeleted, setShowDeleted] = useState(false);
    const [active, setActive] = useState([]);
    const [recent, setRecent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState('');
    const [deleteRun, setDeleteRun] = useState(null);
    const [deleteWord, setDeleteWord] = useState('');
    const [downloadedConfirmed, setDownloadedConfirmed] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await dataExtractorApi.simpleLeadSearchListRuns({
                limit: 40,
                scope: isAdmin && scope === 'all' ? 'all' : 'mine',
                includeDeleted: includeDeletedQueryValue(showDeleted),
            });
            setActive(Array.isArray(data?.active) ? data.active : []);
            setRecent(Array.isArray(data?.recent) ? data.recent : []);
        } catch {
            /* soft */
        } finally {
            setLoading(false);
        }
    }, [isAdmin, scope, showDeleted]);

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
        if (!window.confirm('Stop this run? Already collected data remains saved. The search will not resume.')) return;
        setBusyId(`cancel-${runId}`);
        try {
            await dataExtractorApi.simpleLeadSearchStop(runId);
            toast.success('STOPPED BY USER');
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not stop run');
        } finally {
            setBusyId('');
        }
    };

    const submitDelete = async () => {
        if (!deleteRun) return;
        setBusyId(`delete-${deleteRun.runId}`);
        try {
            await dataExtractorApi.simpleLeadSearchDeleteRunData(deleteRun.runId, {
                confirmText: deleteWord,
                downloadedConfirmed,
            });
            toast.success('Extracted data deleted. A small audit record was kept.');
            setDeleteRun(null);
            setDeleteWord('');
            setDownloadedConfirmed(false);
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Delete failed');
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
                                <th style={{ padding: 8 }}>Search Name</th>
                                <th style={{ padding: 8 }}>User</th>
                                <th style={{ padding: 8 }}>Location</th>
                                <th style={{ padding: 8 }}>Started</th>
                                <th style={{ padding: 8 }}>Status</th>
                                <th style={{ padding: 8 }}>Records</th>
                                <th style={{ padding: 8 }}>Verified</th>
                                <th style={{ padding: 8 }}>Export</th>
                                <th style={{ padding: 8 }}>Archive</th>
                                <th style={{ padding: 8 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.runId} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8, fontWeight: 600 }}>{r.product || r.campaignName || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.createdByName || r.ownerName || '—'}</td>
                                    <td style={{ padding: 8, color: '#64748b' }}>
                                        {[r.city, r.state, r.country].filter(Boolean).join(', ') || '—'}
                                    </td>
                                    <td style={{ padding: 8 }}>{fmtTime(r.startedAt)}</td>
                                    <td style={{ padding: 8 }}>
                                        {r.dataRetentionStatus === 'DATA_DELETED' ? (
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#9a3412' }}>DATA DELETED</div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                                    {r.dataDeletedByName ? `by ${r.dataDeletedByName}` : ''}
                                                    {r.dataDeletedAt ? ` · ${fmtTime(r.dataDeletedAt)}` : ''}
                                                </div>
                                            </div>
                                        ) : r.status}
                                    </td>
                                    <td style={{ padding: 8 }}>{r.originalRecordCount ?? r.resultCount ?? 0}</td>
                                    <td style={{ padding: 8 }}>{r.verifiedCount ?? 0}</td>
                                    <td style={{ padding: 8 }}>{r.exportStatus || '—'}</td>
                                    <td style={{ padding: 8 }}>{r.archiveStatus || '—'}</td>
                                    <td style={{ padding: 8 }}>
                                        {r.dataRetentionStatus === 'DATA_DELETED' ? (
                                            (r.archiveStatus === 'VERIFIED' || r.exportStatus === 'EXPORTED') ? (
                                                <button
                                                    type="button"
                                                    disabled={busyId === `${r.runId}-xlsx`}
                                                    onClick={() => download(r.runId, 'xlsx')}
                                                >
                                                    Download Archive
                                                </button>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>Data removed</span>
                                            )
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <button type="button" onClick={() => openRun(r.runId)}>Open</button>
                                                    <button
                                                        type="button"
                                                        disabled={busyId === `${r.runId}-xlsx`}
                                                        onClick={() => download(r.runId, 'xlsx')}
                                                    >
                                                        Download Excel
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {isPausedRun(r) ? (
                                                        <button
                                                            type="button"
                                                            disabled={busyId === `cancel-${r.runId}`}
                                                            onClick={() => cancel(r.runId)}
                                                        >
                                                            Stop / Finish
                                                        </button>
                                                    ) : null}
                                                    {isLiveRunStatus(r) && !isPausedRun(r) ? (
                                                        <button
                                                            type="button"
                                                            disabled={busyId === `cancel-${r.runId}`}
                                                            onClick={() => cancel(r.runId)}
                                                        >
                                                            Cancel
                                                        </button>
                                                    ) : null}
                                                    {canShowDeleteData(r) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setDeleteRun(r); setDeleteWord(''); setDownloadedConfirmed(false); }}
                                                            style={{ color: '#b91c1c' }}
                                                        >
                                                            Delete Data
                                                        </button>
                                                    ) : null}
                                                    {isRunningDeleteBlocked(r) ? (
                                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Stop extraction before deleting data.</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        )}
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

    const confirm = deleteRun ? deleteConfirmMessage(deleteRun) : null;

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>{isAdmin && scope === 'all' ? 'All Searches' : 'My Searches'}</h2>
                {isAdmin ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => setScope('mine')} style={{ fontWeight: scope === 'mine' ? 800 : 500 }}>My Searches</button>
                        <button type="button" onClick={() => setScope('all')} style={{ fontWeight: scope === 'all' ? 800 : 500 }}>All Searches</button>
                    </div>
                ) : null}
                <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
                    Show Deleted
                </label>
            </div>
            {renderTable(active, 'ACTIVE SEARCHES')}
            {renderTable(
                (showDeleted ? recent : recent.filter((r) => r.dataRetentionStatus !== 'DATA_DELETED')).slice(0, 12),
                'RECENT / COMPLETED RUNS',
            )}
            {confirm ? (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 460, maxWidth: '94vw', background: '#fff', borderRadius: 10, padding: 20 }}>
                        <h3 style={{ margin: '0 0 8px' }}>{confirm.title}</h3>
                        <p style={{ fontSize: 13 }}>
                            <strong>Search:</strong> {confirm.searchName}<br />
                            <strong>Location:</strong> {confirm.location}<br />
                            <strong>Owner:</strong> {confirm.user}<br />
                            <strong>Records:</strong> {confirm.recordCount}<br />
                            <strong>Started:</strong> {fmtTime(confirm.createdDate)}
                        </p>
                        <p style={{ fontSize: 13, color: '#9a3412' }}>{confirm.warning}</p>
                        {deleteRun?.archiveStatus && deleteRun.archiveStatus !== 'VERIFIED' ? (
                            <p style={{ fontSize: 12, color: '#b45309' }}>
                                S3 archive is {deleteRun.archiveStatus}. Browser download cannot be verified after it leaves the server.
                            </p>
                        ) : null}
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
                            <input type="checkbox" checked={downloadedConfirmed} onChange={(e) => setDownloadedConfirmed(e.target.checked)} />
                            I have downloaded or archived this search
                        </label>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                            Type DELETE to confirm
                            <input
                                value={deleteWord}
                                onChange={(e) => setDeleteWord(e.target.value)}
                                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                            />
                        </label>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setDeleteRun(null)}>Cancel</button>
                            <button
                                type="button"
                                disabled={deleteWord.trim().toUpperCase() !== 'DELETE' || !downloadedConfirmed || busyId === `delete-${deleteRun.runId}`}
                                onClick={submitDelete}
                            >
                                Delete Data
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
