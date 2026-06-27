import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

function ScoreBadge({ score, label }) {
    const n = Number(score) || 0;
    const color = n >= 70 ? '#15803d' : n >= 40 ? '#ca8a04' : '#b91c1c';
    return <span style={{ color, fontWeight: 600 }} title={label}>{n}%</span>;
}

export default function DataExtractorPreviewPage() {
    const { jobId } = useParams();
    const { selectedFY } = useFinancialYear();
    const [job, setJob] = useState(null);
    const [savedRecords, setSavedRecords] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [selectedSaved, setSelectedSaved] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [enhancingAi, setEnhancingAi] = useState(false);

    const previewRecords = useMemo(() => job?.metadata?.previewRecords || [], [job]);
    const isPreviewOnly = job?.metadata?.previewOnly === true;
    const displayRecords = isPreviewOnly ? previewRecords : savedRecords;

    const fmtList = (arr) => (Array.isArray(arr) && arr.length ? arr.slice(0, 3).join(', ') : '—');

    const renderDataCells = (r) => (
        <>
            <td style={{ padding: 8 }}>{r.companyName || '—'}</td>
            <td style={{ padding: 8 }}>
                {r.website ? <a href={r.website} target="_blank" rel="noreferrer">{r.normalizedDomain || r.website}</a> : '—'}
            </td>
            <td style={{ padding: 8, maxWidth: 120 }}>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer">source</a> : '—'}</td>
            <td style={{ padding: 8 }}>{r.email || '—'}</td>
            <td style={{ padding: 8 }}>{r.phone || r.mobile || '—'}</td>
            <td style={{ padding: 8 }}>{r.address || '—'}</td>
            <td style={{ padding: 8 }}>{r.city || '—'}</td>
            <td style={{ padding: 8 }}>{r.stateProvince || '—'}</td>
            <td style={{ padding: 8 }}>{r.country || '—'}</td>
            <td style={{ padding: 8, maxWidth: 160 }}>{(r.businessDescription || '').slice(0, 60)}</td>
            <td style={{ padding: 8 }}>{r.aiClassification || r.natureOfBusiness || '—'}</td>
            <td style={{ padding: 8, maxWidth: 140 }} title={r.aiSummary || ''}>{(r.aiSummary || '').slice(0, 50) || '—'}</td>
            <td style={{ padding: 8 }}>{fmtList(r.productCategories)}</td>
            <td style={{ padding: 8 }}>{fmtList(r.keywords)}</td>
            <td style={{ padding: 8 }}><ScoreBadge score={r.confidenceScore} /></td>
            <td style={{ padding: 8 }}><ScoreBadge score={r.leadScore} label="lead" /></td>
            <td style={{ padding: 8 }}>
                {r._isDuplicate || r.duplicateStatus === 'confirmed_duplicate' ? (
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>Confirmed</span>
                ) : r.duplicateStatus === 'possible_duplicate' ? (
                    <span style={{ color: '#ca8a04' }}>Possible</span>
                ) : '—'}
            </td>
        </>
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [jobData, listData] = await Promise.all([
                    dataExtractorApi.getJob(jobId),
                    dataExtractorApi.listRecords({ searchJobId: jobId, limit: 100 }),
                ]);
                if (!cancelled) {
                    setJob(jobData);
                    setSavedRecords(listData?.results || []);
                    const previews = jobData?.metadata?.previewRecords || [];
                    if (previews.length) {
                        setSelected(new Set(previews.map((_, i) => i)));
                    }
                }
            } catch (e) {
                if (!cancelled) toast.error(e?.response?.data?.message || 'Failed to load preview');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [jobId]);

    const toggleSelect = (idx) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === displayRecords.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(displayRecords.map((_, i) => i)));
        }
    };

    const onSaveDrafts = async () => {
        if (!isPreviewOnly) return;
        const indices = [...selected];
        if (!indices.length) {
            toast.error('Select at least one record');
            return;
        }
        setSaving(true);
        try {
            const result = await dataExtractorApi.saveJobDrafts(jobId, {
                indices,
                financialYear: selectedFY,
            });
            toast.success(`Saved ${result.saved} draft(s)`);
            const listData = await dataExtractorApi.listRecords({ searchJobId: jobId, limit: 100 });
            setSavedRecords(listData?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const toggleSavedSelect = (id) => {
        setSelectedSaved((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAllSaved = (list) => {
        if (selectedSaved.size === list.length) {
            setSelectedSaved(new Set());
        } else {
            setSelectedSaved(new Set(list.map((r) => r._id)));
        }
    };

    const reloadSaved = async () => {
        const listData = await dataExtractorApi.listRecords({ searchJobId: jobId, limit: 100 });
        setSavedRecords(listData?.results || []);
        setSelectedSaved(new Set());
    };

    const onBulkSaved = async (action, entityType) => {
        const ids = [...selectedSaved];
        if (!ids.length) {
            toast.error('Select at least one saved record');
            return;
        }
        if (action === 'delete' && !window.confirm(`Delete ${ids.length} draft(s)?`)) return;
        let reason = '';
        if (action === 'reject') reason = window.prompt('Rejection reason (optional):') || '';
        try {
            const result = await dataExtractorApi.bulkAction({ action, ids, reason, entityType });
            if (result.failed?.length) {
                toast.error(`${result.success} ok, ${result.failed.length} failed`);
            } else {
                toast.success(`${result.success} record(s) updated`);
            }
            await reloadSaved();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Bulk action failed');
        }
    };

    const onApprove = async (id) => {
        try {
            await dataExtractorApi.approveRecord(id);
            toast.success('Approved');
            await reloadSaved();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Approve failed');
        }
    };

    const onReject = async (id) => {
        const reason = window.prompt('Rejection reason (optional):') || '';
        try {
            await dataExtractorApi.rejectRecord(id, reason);
            toast.success('Rejected');
            await reloadSaved();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Reject failed');
        }
    };

    const onDelete = async (id) => {
        if (!window.confirm('Delete this draft record?')) return;
        try {
            await dataExtractorApi.deleteDraft(id);
            setSavedRecords((prev) => prev.filter((r) => r._id !== id));
            toast.success('Draft deleted');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Delete failed');
        }
    };

    const onConvert = async (id, type) => {
        try {
            const fn = type === 'lead' ? dataExtractorApi.convertToLead
                : type === 'customer' ? dataExtractorApi.convertToCustomer
                    : dataExtractorApi.convertToSupplier;
            const result = await fn(id);
            toast.success(`Converted to ${type}`);
            if (result?.lead?._id) {
                toast.success(`Lead created — open /crm/leads/${result.lead._id}`, { duration: 6000 });
            }
            await reloadSaved();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Convert failed');
        }
    };

    const onViewDuplicates = async (id) => {
        try {
            const dup = await dataExtractorApi.getRecordDuplicates(id);
            const refs = dup?.duplicateMatchRefs || [];
            if (!refs.length) {
                toast.success('No duplicate matches');
                return;
            }
            const msg = refs.map((r) => `${r.type} via ${r.matchField} (${r.matchScore}%)`).join('\n');
            window.alert(`Duplicate matches:\n\n${msg}`);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load duplicates');
        }
    };

    const onScheduleFollowup = async (id) => {
        const dateStr = window.prompt('Follow-up date (YYYY-MM-DD):', new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10));
        if (!dateStr) return;
        const note = window.prompt('What to discuss (optional):') || '';
        try {
            await dataExtractorApi.scheduleFollowup(id, {
                nextCallDate: dateStr,
                whatToTalkNext: note,
                reminderEnabled: true,
            });
            toast.success('Follow-up scheduled');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Follow-up failed');
        }
    };

    const renderActionButtons = (r) => (
        <>
            {(r.duplicateStatus && r.duplicateStatus !== 'none') && (
                <button type="button" onClick={() => onViewDuplicates(r._id)} style={{ fontSize: 11, marginRight: 4, cursor: 'pointer' }}>Duplicates</button>
            )}
            {r.status === 'draft' && (
                <>
                    <button type="button" onClick={() => onApprove(r._id)} style={{ fontSize: 11, marginRight: 4, cursor: 'pointer' }}>Approve</button>
                    <button type="button" onClick={() => onReject(r._id)} style={{ fontSize: 11, marginRight: 4, cursor: 'pointer' }}>Reject</button>
                    <button type="button" onClick={() => onDelete(r._id)} style={{ fontSize: 11, color: '#b91c1c', cursor: 'pointer' }}>Delete</button>
                </>
            )}
            {r.status === 'approved' && (
                <>
                    <button type="button" onClick={() => onConvert(r._id, 'lead')} style={{ fontSize: 11, marginRight: 4, cursor: 'pointer' }}>→ Lead</button>
                    <button type="button" onClick={() => onConvert(r._id, 'customer')} style={{ fontSize: 11, marginRight: 4, cursor: 'pointer' }}>→ Customer</button>
                    <button type="button" onClick={() => onConvert(r._id, 'supplier')} style={{ fontSize: 11, cursor: 'pointer' }}>→ Supplier</button>
                </>
            )}
            {r.status === 'converted' && (
                <>
                    {r.convertedTo?.entityType === 'lead' && r.convertedTo?.refId && (
                        <a href={`/crm/leads/${r.convertedTo.refId}`} style={{ fontSize: 11, marginRight: 6 }}>Open Lead</a>
                    )}
                    <button type="button" onClick={() => onScheduleFollowup(r._id)} style={{ fontSize: 11, cursor: 'pointer' }}>Follow-up</button>
                </>
            )}
        </>
    );

    const onEnhanceAi = async () => {
        setEnhancingAi(true);
        try {
            const result = await dataExtractorApi.enhanceJobAi(jobId);
            setJob(result.job);
            toast.success('AI enhancement applied');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'AI enhance failed', { duration: 8000 });
        } finally {
            setEnhancingAi(false);
        }
    };

    const onExport = async (format) => {
        try {
            const blob = await dataExtractorApi.exportRecords({ searchJobId: jobId, format });
            const mime = format === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv';
            const url = URL.createObjectURL(new Blob([blob], { type: mime }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `extracted-leads-${jobId}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error('Export failed');
        }
    };

    if (loading) return <div style={{ padding: 24 }}>Loading preview…</div>;

    return (
        <div style={{ padding: 24 }}>
            <p style={{ marginTop: 0 }}>
                <Link to={PATHS.DATA_EXTRACTOR.KEYWORD_SEARCH}>← Data Extractor</Link>
            </p>
            <h2 style={{ marginTop: 8 }}>Extraction Preview</h2>
            {job && (
                <p style={{ color: '#64748b', fontSize: 14 }}>
                    Job:
                    {' '}
                    {job.inputSummary}
                    {' '}
                    —
                    {' '}
                    {job.recordCount}
                    {' '}
                    result(s),
                    {' '}
                    {job.errorCount}
                    {' '}
                    error(s)
                    {job.metadata?.aiEnhanced && ' · AI enhanced'}
                    {isPreviewOnly && ' (preview — not saved yet)'}
                </p>
            )}
            {job?.jobErrors?.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                    {job.jobErrors.map((err, i) => (
                        <div key={i}>{err}</div>
                    ))}
                </div>
            )}
            {savedRecords.length > 0 && selectedSaved.size > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{selectedSaved.size} selected</span>
                    <button type="button" onClick={() => onBulkSaved('approve')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Approve</button>
                    <button type="button" onClick={() => onBulkSaved('reject')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Reject</button>
                    <button type="button" onClick={() => onBulkSaved('delete')} style={{ padding: '6px 12px', fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}>Delete</button>
                    <button type="button" onClick={() => onBulkSaved('convert', 'lead')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>→ Lead</button>
                    <button type="button" onClick={() => onBulkSaved('convert', 'customer')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>→ Customer</button>
                    <button type="button" onClick={() => onBulkSaved('convert', 'supplier')} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>→ Supplier</button>
                </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {isPreviewOnly && (
                    <>
                        <button type="button" onClick={onSaveDrafts} disabled={saving} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                            {saving ? 'Saving…' : `Save Draft (${selected.size})`}
                        </button>
                        <button type="button" onClick={onEnhanceAi} disabled={enhancingAi} style={{ padding: '8px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer' }}>
                            {enhancingAi ? 'Running AI…' : 'Run AI enhance'}
                        </button>
                    </>
                )}
                {savedRecords.length > 0 && (
                    <>
                        <button type="button" onClick={() => onExport('csv')} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>
                            Export CSV
                        </button>
                        <button type="button" onClick={() => onExport('xlsx')} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>
                            Export Excel
                        </button>
                    </>
                )}
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {(isPreviewOnly || savedRecords.length > 0) && (
                                <th style={{ padding: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={
                                            isPreviewOnly
                                                ? selected.size === displayRecords.length && displayRecords.length > 0
                                                : selectedSaved.size === savedRecords.length && savedRecords.length > 0
                                        }
                                        onChange={() => (isPreviewOnly ? toggleAll() : toggleAllSaved(savedRecords))}
                                    />
                                </th>
                            )}
                            <th style={{ padding: 8 }}>Company</th>
                            <th style={{ padding: 8 }}>Website</th>
                            <th style={{ padding: 8 }}>Source URL</th>
                            <th style={{ padding: 8 }}>Email</th>
                            <th style={{ padding: 8 }}>Phone</th>
                            <th style={{ padding: 8 }}>Address</th>
                            <th style={{ padding: 8 }}>City</th>
                            <th style={{ padding: 8 }}>State</th>
                            <th style={{ padding: 8 }}>Country</th>
                            <th style={{ padding: 8 }}>Description</th>
                            <th style={{ padding: 8 }}>AI Type</th>
                            <th style={{ padding: 8 }}>AI Summary</th>
                            <th style={{ padding: 8 }}>Products</th>
                            <th style={{ padding: 8 }}>Keywords</th>
                            <th style={{ padding: 8 }}>Confidence</th>
                            <th style={{ padding: 8 }}>Lead Score</th>
                            <th style={{ padding: 8 }}>Duplicate</th>
                            <th style={{ padding: 8 }}>Status</th>
                            <th style={{ padding: 8 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRecords.length === 0 && (
                            <tr>
                                <td colSpan={(isPreviewOnly || savedRecords.length > 0) ? 21 : 20} style={{ padding: 16, color: '#64748b' }}>No records</td>
                            </tr>
                        )}
                        {isPreviewOnly && previewRecords.map((r, idx) => (
                            <tr key={idx} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}><input type="checkbox" checked={selected.has(idx)} onChange={() => toggleSelect(idx)} /></td>
                                {renderDataCells(r)}
                                <td style={{ padding: 8 }}>preview</td>
                                <td style={{ padding: 8 }}>—</td>
                            </tr>
                        ))}
                        {!isPreviewOnly && savedRecords.map((r) => (
                            <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>
                                    <input type="checkbox" checked={selectedSaved.has(r._id)} onChange={() => toggleSavedSelect(r._id)} />
                                </td>
                                {renderDataCells(r)}
                                <td style={{ padding: 8 }}>{r.status}</td>
                                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{renderActionButtons(r)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isPreviewOnly && savedRecords.length > 0 && (
                <div style={{ marginTop: 24 }}>
                    <h3 style={{ fontSize: 16 }}>Saved drafts from this job</h3>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                        {savedRecords.length} saved record(s) — select multiple, then approve or convert in bulk.
                    </p>
                </div>
            )}
            {isPreviewOnly && savedRecords.length > 0 && (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ padding: 8 }}>
                                    <input type="checkbox" checked={selectedSaved.size === savedRecords.length} onChange={() => toggleAllSaved(savedRecords)} />
                                </th>
                                <th style={{ padding: 8 }}>Company</th>
                                <th style={{ padding: 8 }}>Status</th>
                                <th style={{ padding: 8 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {savedRecords.map((r) => (
                                <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8 }}>
                                        <input type="checkbox" checked={selectedSaved.has(r._id)} onChange={() => toggleSavedSelect(r._id)} />
                                    </td>
                                    <td style={{ padding: 8 }}>{r.companyName}</td>
                                    <td style={{ padding: 8 }}>{r.status}</td>
                                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{renderActionButtons(r)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
