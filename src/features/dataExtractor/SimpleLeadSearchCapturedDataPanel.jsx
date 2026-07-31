import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import styles from './DataExtractorSimpleLeadSearchPage.module.css';

const TABS = [
    { key: 'all', label: 'All Records' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'processing', label: 'Processing' },
    { key: 'enriched', label: 'Enriched' },
    { key: 'qualified', label: 'Qualified' },
    { key: 'verified', label: 'Verified' },
    { key: 'review_required', label: 'Review Required' },
    { key: 'rejected_skipped', label: 'Rejected / Skipped' },
    { key: 'failed', label: 'Failed' },
];

const FINAL_TABS = [
    { key: 'strict_prospect', label: 'Strict Bangalore Prospects' },
    { key: 'serves_city', label: 'Serves Bangalore — No Office' },
    { key: 'location_mismatch', label: 'Location Mismatch' },
    { key: 'location_not_confirmed', label: 'Location Not Confirmed' },
    { key: 'address_missing', label: 'Address Missing' },
    { key: 'job_course_training', label: 'Job / Course / Training' },
    { key: 'unrelated_product', label: 'Unrelated Product' },
    { key: 'directory_only', label: 'Directory Only' },
    { key: 'failed_retryable', label: 'Failed / Retryable' },
];

const PAGE_SIZES = [25, 50, 100, 'all'];

function dash(v) {
    if (v == null || v === '') return '—';
    return String(v);
}

function softErr(err) {
    return err?.response?.data?.message || err?.message || 'Request failed';
}

function downloadBlobFromAxios(response, fallbackName) {
    const blob = new Blob([response.data], {
        type: response.headers?.['content-type']
            || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const disposition = response.headers?.['content-disposition'] || '';
    const match = /filename="?([^"]+)"?/i.exec(disposition);
    a.href = url;
    a.download = match?.[1] || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

/**
 * Prominent campaign-scoped captured-data table with tabs, filters, pagination, dual exports.
 */
export default function SimpleLeadSearchCapturedDataPanel({
    sessionId,
    campaignName,
    processRunning = false,
    onRetrySelected,
    onRetryAllFailed,
}) {
    const [tab, setTab] = useState('all');
    const [search, setSearch] = useState('');
    const [businessType, setBusinessType] = useState('');
    const [city, setCity] = useState('');
    const [stateFilter, setStateFilter] = useState('');
    const [relevance, setRelevance] = useState('');
    const [genuineness, setGenuineness] = useState('');
    const [failedRetry, setFailedRetry] = useState(false);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [data, setData] = useState(null);
    const [selected, setSelected] = useState([]);
    const [detailId, setDetailId] = useState('');
    const [recheckJob, setRecheckJob] = useState(null);
    const [recheckBusy, setRecheckBusy] = useState(false);

    const load = useCallback(async () => {
        if (!sessionId) return;
        setLoading(true);
        try {
            const params = {
                tab,
                search: search || undefined,
                businessType: businessType || undefined,
                city: city || undefined,
                state: stateFilter || undefined,
                relevance: relevance || undefined,
                genuineness: genuineness || undefined,
                failedRetry: failedRetry ? '1' : undefined,
                page,
                limit: limit === 'all' ? 'all' : limit,
                sort: 'index',
                sortDir: 'asc',
            };
            const res = await dataExtractorApi.simpleLeadSearchCapturedData(sessionId, params);
            setData(res);
            setSelected([]);
            if (res?.locationRecheck) setRecheckJob(res.locationRecheck);
        } catch (err) {
            toast.error(softErr(err));
        } finally {
            setLoading(false);
        }
    }, [sessionId, tab, search, businessType, city, stateFilter, relevance, genuineness, failedRetry, page, limit]);

    const refreshRecheckStatus = useCallback(async () => {
        if (!sessionId) return null;
        try {
            const res = await dataExtractorApi.simpleLeadSearchLocationRecheckStatus(sessionId);
            const job = res?.job || null;
            setRecheckJob(job);
            return job;
        } catch {
            return null;
        }
    }, [sessionId]);

    const onRecheckExisting = async () => {
        if (!sessionId) return;
        setRecheckBusy(true);
        try {
            const res = await dataExtractorApi.simpleLeadSearchLocationRecheckStart(sessionId, { refreshAddresses: true });
            setRecheckJob(res?.job || null);
            toast.success(res?.alreadyRunning ? 'Strict location recheck already running' : 'Strict location recheck started');
            await load();
        } catch (err) {
            toast.error(softErr(err));
        } finally {
            setRecheckBusy(false);
        }
    };

    const onStopRecheck = async () => {
        if (!sessionId) return;
        try {
            await dataExtractorApi.simpleLeadSearchLocationRecheckStop(sessionId);
            toast.success('Stop recheck requested');
            await refreshRecheckStatus();
        } catch (err) {
            toast.error(softErr(err));
        }
    };
    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!sessionId || !processRunning) return undefined;
        const t = setInterval(() => { load(); }, 8000);
        return () => clearInterval(t);
    }, [sessionId, processRunning, load]);

    useEffect(() => {
        const running = recheckJob?.status === 'processing' || recheckJob?.status === 'queued';
        if (!sessionId || !running) return undefined;
        const t = setInterval(async () => {
            const job = await refreshRecheckStatus();
            if (job && (job.status === 'completed' || job.status === 'partial' || job.status === 'stopped' || job.status === 'failed')) {
                await load();
            }
        }, 2500);
        return () => clearInterval(t);
    }, [sessionId, recheckJob?.status, refreshRecheckStatus, load]);

    useEffect(() => {
        setPage(1);
    }, [tab, search, businessType, city, stateFilter, relevance, genuineness, failedRetry, limit]);

    const items = data?.items || [];
    const tabCounts = data?.tabCounts || {};
    const buckets = data?.exclusiveBuckets || {};
    const strictBuckets = data?.strictFinalBuckets || {};
    const stageMetrics = data?.stageMetrics || {};
    const pagination = data?.pagination || {};
    const verifiedCounters = data?.verifiedCounters || data?.counters || null;
    const campaignTotal = Number(pagination.campaignTotal || tabCounts.all || 0);
    const detail = useMemo(() => items.find((r) => r._id === detailId) || null, [items, detailId]);
    const isVerifiedTab = tab === 'verified';
    const locNorm = data?.locationNormalization || null;
    const recheckRunning = recheckJob?.status === 'processing' || recheckJob?.status === 'queued';
    const needsRecheck = Boolean(data?.needsStrictRecheck);
    const toggleSelect = (id) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const toggleSelectPage = () => {
        const ids = items.map((r) => r._id);
        const allOn = ids.every((id) => selected.includes(id));
        setSelected((prev) => (allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
    };

    const onExportAll = async () => {
        if (!sessionId || campaignTotal < 1) return;
        setExporting(true);
        try {
            const response = await dataExtractorApi.simpleLeadSearchExportAllCurrent(sessionId);
            const rowHeader = response.headers?.['x-export-row-count'];
            downloadBlobFromAxios(response, `sls-all-current-${sessionId}.xlsx`);
            toast.success(`Exported all current data (${rowHeader || campaignTotal} records)`);
        } catch (err) {
            toast.error(softErr(err));
        } finally {
            setExporting(false);
        }
    };

    const onExportVerified = async () => {
        if (!sessionId) return;
        setExporting(true);
        try {
            const response = await dataExtractorApi.simpleLeadSearchGenuinenessExport(sessionId);
            downloadBlobFromAxios(response, `genuineness-${sessionId}.xlsx`);
            toast.success('Final verified results exported');
        } catch (err) {
            toast.error(softErr(err));
        } finally {
            setExporting(false);
        }
    };

    const handleLimitChange = (value) => {
        if (value === 'all' && campaignTotal > 500) {
            const ok = window.confirm(`Show all ${campaignTotal} records on one page? Large lists may be slower.`);
            if (!ok) return;
        }
        setLimit(value === 'all' ? 'all' : Number(value));
    };

    if (!sessionId) return null;

    return (
        <section className={styles.capturedPanel} aria-label="All captured data">
            <div className={styles.capturedHead}>
                <div>
                    <h3 className={styles.capturedTitle}>
                        All Captured Data — {campaignTotal} Records
                    </h3>
                    <p className={styles.capturedSub}>
                        {campaignName || 'Current campaign'} · company + campaign scoped · updates while processing runs
                    </p>
                    {locNorm?.interpretedAs ? (
                        <p className={styles.capturedSub} style={{ marginTop: 4 }}>
                            Location matching uses <strong>{locNorm.interpretedAs}</strong>
                            {locNorm.entered && locNorm.entered !== locNorm.interpretedAs
                                ? <> (entered: {locNorm.entered}{locNorm.wasCorrected ? ' — spelling corrected for match' : ''})</>
                                : null}
                        </p>
                    ) : null}
                </div>
                <div className={styles.capturedExports}>
                    <button
                        type="button"
                        className={styles.exportAllBtn}
                        disabled={recheckBusy || recheckRunning || campaignTotal < 1}
                        onClick={onRecheckExisting}
                    >
                        Recheck Existing Campaign
                        <span>
                            {needsRecheck
                                ? 'Recommended — apply strict product + Bangalore location rules to all current records'
                                : 'Re-apply strict product + location validation (idempotent)'}
                        </span>
                    </button>
                    <button
                        type="button"
                        className={styles.exportAllBtn}
                        disabled={exporting || campaignTotal < 1}
                        onClick={onExportAll}
                    >
                        Export All Current Data to Excel
                        <span>Always available — all {campaignTotal} records with current stage</span>
                    </button>
                    <button
                        type="button"
                        className={styles.exportFinalBtn}
                        disabled={exporting || !(tabCounts.verified > 0 || buckets.completed > 0 || tabCounts.review_required > 0)}
                        onClick={onExportVerified}
                    >
                        Export Final Verified Results
                        <span>Verified / likely genuine / approved review only</span>
                    </button>
                </div>
            </div>

            {(recheckRunning || recheckJob?.status === 'completed' || recheckJob?.status === 'partial') && (
                <div className={styles.reconcileBox} style={{ marginBottom: 12 }}>
                    <div className={styles.reconcileLabel}>
                        {recheckRunning ? 'Strict Location Recheck Running' : 'Strict Location Recheck Result'}
                        {recheckRunning ? (
                            <button type="button" className={styles.howBtn} style={{ marginLeft: 12 }} onClick={onStopRecheck}>Stop</button>
                        ) : null}
                    </div>
                    <div className={styles.reconcileMetrics}>
                        <span>Total Records: {recheckJob?.total ?? campaignTotal}</span>
                        <span>Checked: {recheckJob?.checked ?? 0}</span>
                        <span>Exact City Confirmed: {recheckJob?.exactCityConfirmed ?? 0}</span>
                        <span>Serves City Only: {recheckJob?.servesCityOnly ?? 0}</span>
                        <span>Different City Confirmed: {recheckJob?.differentCityConfirmed ?? 0}</span>
                        <span>Location Not Confirmed: {recheckJob?.locationNotConfirmed ?? 0}</span>
                        <span>Address Missing: {recheckJob?.addressMissing ?? 0}</span>
                        <span>Remaining: {recheckJob?.remaining ?? 0}</span>
                        {recheckJob?.currentCompany ? <span>Current: {recheckJob.currentCompany}</span> : null}
                    </div>
                    {recheckJob?.reconciliation?.balanced != null && !recheckRunning ? (
                        <div className={styles.reconcileMetrics} style={{ marginTop: 8 }}>
                            <strong>Strict prospects {recheckJob.strictProspects ?? 0}</strong>
                            <span>Job/Course {recheckJob.jobCourseTraining ?? 0}</span>
                            <span>Unrelated {recheckJob.unrelatedProduct ?? 0}</span>
                            <span>Directory {recheckJob.directoryOnly ?? 0}</span>
                            <span>Failed/retryable {recheckJob.failedRetryable ?? 0}</span>
                            <span>Address rows {recheckJob.reconciliation?.addressRows ?? 0}</span>
                            <strong>
                                Final buckets {recheckJob.reconciliation?.bucketTotal ?? 0}/{recheckJob.reconciliation?.totalCaptured ?? campaignTotal}
                                {recheckJob.reconciliation?.balanced ? ' ✓' : ' (imbalanced)'}
                            </strong>
                        </div>
                    ) : null}
                </div>
            )}

            <div className={styles.reconcileRow}>
                <div className={styles.reconcileBox}>
                    <div className={styles.reconcileLabel}>Exclusive record status (must total {campaignTotal})</div>
                    <div className={styles.reconcileMetrics}>
                        <span>Waiting {buckets.waiting ?? 0}</span>
                        <span>Processing {buckets.processing ?? 0}</span>
                        <span>Completed {buckets.completed ?? 0}</span>
                        <span>Review {buckets.reviewRequired ?? 0}</span>
                        <span>Rejected/Skipped {buckets.rejectedSkipped ?? 0}</span>
                        <span>Failed {buckets.failed ?? 0}</span>
                        <strong>Total {buckets.total ?? 0}</strong>
                    </div>
                </div>
                <div className={styles.reconcileBox}>
                    <div className={styles.reconcileLabel}>Strict final categories (must total {campaignTotal})</div>
                    <div className={styles.reconcileMetrics}>
                        {FINAL_TABS.map((t) => (
                            <span key={t.key}>{t.label.replace('Bangalore', 'City')} {strictBuckets[t.key] ?? tabCounts[t.key] ?? 0}</span>
                        ))}
                        <strong>Total {strictBuckets.total ?? 0}</strong>
                    </div>
                </div>
            </div>

            <div className={styles.capturedTabs} role="tablist" aria-label="Processing tabs">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.key}
                        className={`${styles.capturedTab} ${tab === t.key ? styles.capturedTabActive : ''}`}
                        onClick={() => setTab(t.key)}
                    >
                        {t.label}
                        <em>{tabCounts[t.key] ?? 0}</em>
                    </button>
                ))}
            </div>

            <div className={styles.capturedTabs} role="tablist" aria-label="Strict final category tabs" style={{ marginTop: 8 }}>
                {FINAL_TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.key}
                        className={`${styles.capturedTab} ${tab === t.key ? styles.capturedTabActive : ''}`}
                        onClick={() => setTab(t.key)}
                    >
                        {t.label}
                        <em>{strictBuckets[t.key] ?? tabCounts[t.key] ?? 0}</em>
                    </button>
                ))}
            </div>

            <div className={styles.capturedFilters}>
                <input
                    className={styles.capturedInput}
                    placeholder="Search company, URL, phone, email, query…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <input className={styles.capturedInput} placeholder="Business type" value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
                <input className={styles.capturedInput} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                <input className={styles.capturedInput} placeholder="State" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} />
                <input className={styles.capturedInput} placeholder="Relevance" value={relevance} onChange={(e) => setRelevance(e.target.value)} />
                <input className={styles.capturedInput} placeholder="Genuineness" value={genuineness} onChange={(e) => setGenuineness(e.target.value)} />
                <label className={styles.capturedCheck}>
                    <input type="checkbox" checked={failedRetry} onChange={(e) => setFailedRetry(e.target.checked)} />
                    Retryable failed only
                </label>
                <select
                    className={styles.capturedSelect}
                    value={String(limit)}
                    onChange={(e) => handleLimitChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                    {PAGE_SIZES.map((n) => (
                        <option key={String(n)} value={String(n)}>{n === 'all' ? 'All' : `${n} / page`}</option>
                    ))}
                </select>
                <button type="button" className={styles.howBtn} onClick={load} disabled={loading}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            <div className={styles.capturedToolbar}>
                <span>
                    {isVerifiedTab ? (
                        <>
                            Unique companies {pagination.total ?? items.length}
                            {verifiedCounters ? (
                                <>
                                    {' · '}Source appearances {verifiedCounters.sourceAppearances ?? verifiedCounters.verifiedSourceAppearances ?? '—'}
                                    {' · '}Duplicates consolidated {verifiedCounters.duplicatesConsolidated ?? verifiedCounters.duplicateAppearancesConsolidated ?? '—'}
                                </>
                            ) : null}
                            {' · '}Campaign captures {campaignTotal}
                        </>
                    ) : (
                        <>Showing {items.length} of {pagination.total ?? 0} filtered · Campaign total {campaignTotal}</>
                    )}
                    {processRunning ? ' · auto-refresh on' : ''}
                </span>
                <div className={styles.capturedRetryGroup}>
                    <button
                        type="button"
                        className={styles.howBtn}
                        disabled={!selected.length || !onRetrySelected || isVerifiedTab}
                        onClick={() => onRetrySelected?.(selected)}
                    >
                        Retry Selected ({selected.length})
                    </button>
                    <button
                        type="button"
                        className={styles.howBtn}
                        disabled={!onRetryAllFailed || !(tabCounts.failed > 0)}
                        onClick={() => onRetryAllFailed?.()}
                    >
                        Retry All Eligible Failed
                    </button>
                </div>
            </div>

            <div className={styles.capturedTableWrap}>
                <table className={styles.capturedTable}>
                    <thead>
                        {isVerifiedTab ? (
                            <tr>
                                <th>#</th>
                                <th>Unique Company</th>
                                <th>Primary Website</th>
                                <th>Primary Phone</th>
                                <th>All Phones</th>
                                <th>Primary Email</th>
                                <th>All Emails</th>
                                <th>Verification Status</th>
                                <th>Source Appearances</th>
                                <th>Query Count</th>
                                <th>Evidence Count</th>
                                <th></th>
                            </tr>
                        ) : (
                            <tr>
                                <th>
                                    <input
                                        type="checkbox"
                                        checked={items.length > 0 && items.every((r) => selected.includes(r._id))}
                                        onChange={toggleSelectPage}
                                        aria-label="Select page"
                                    />
                                </th>
                                <th>#</th>
                                <th>Company</th>
                                <th>Website / Source</th>
                                <th>Business Type</th>
                                <th>City</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Stage</th>
                                <th>Status</th>
                                <th>Failure / Skip Reason</th>
                                <th>Retry</th>
                                <th></th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {!items.length && (
                            <tr>
                                <td colSpan={isVerifiedTab ? 12 : 13} className={styles.capturedEmpty}>
                                    {loading ? 'Loading captured records…' : 'No records in this filter.'}
                                </td>
                            </tr>
                        )}
                        {isVerifiedTab
                            ? items.map((r) => {
                                const phoneExtra = Math.max(0, (r.allPhones || []).length - 1);
                                const emailExtra = Math.max(0, (r.allEmails || []).length - 1);
                                return (
                                    <tr key={r._id}>
                                        <td>{r.index}</td>
                                        <td title={r.companyName}>{dash(r.uniqueCompany || r.companyName)}</td>
                                        <td className={styles.capturedUrl} title={r.primaryWebsite || r.website}>
                                            {dash(r.primaryWebsite || r.website || r.displayDomain)}
                                        </td>
                                        <td>{dash(r.primaryPhone || r.phone)}</td>
                                        <td>
                                            {dash(r.primaryPhone || r.phone)}
                                            {phoneExtra > 0 ? ` +${phoneExtra} more` : ''}
                                        </td>
                                        <td>{dash(r.primaryEmail || r.email)}</td>
                                        <td>
                                            {dash(r.primaryEmail || r.email)}
                                            {emailExtra > 0 ? ` +${emailExtra} more` : ''}
                                        </td>
                                        <td>
                                            <span className={styles.capturedStatus}>
                                                {dash(r.verificationStatusLabel || r.genuinenessStatus)}
                                            </span>
                                        </td>
                                        <td>{r.sourceAppearances ?? '—'}</td>
                                        <td>{r.queryCount ?? '—'}</td>
                                        <td>{r.evidenceCount ?? '—'}</td>
                                        <td>
                                            <button type="button" className={styles.linkBtn} onClick={() => setDetailId(r._id === detailId ? '' : r._id)}>
                                                {r._id === detailId ? 'Hide Evidence' : 'View Evidence'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                            : items.map((r) => (
                            <tr key={r._id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(r._id)}
                                        onChange={() => toggleSelect(r._id)}
                                        aria-label={`Select ${r.companyName || r.title}`}
                                    />
                                </td>
                                <td>{r.index}</td>
                                <td title={r.title}>{dash(r.companyName || r.title)}</td>
                                <td className={styles.capturedUrl} title={r.website || r.sourceUrl}>
                                    {dash(r.website || r.sourceUrl)}
                                </td>
                                <td>{dash(r.businessType)}</td>
                                <td>{dash(r.city)}</td>
                                <td>{dash(r.phone)}</td>
                                <td>{dash(r.email)}</td>
                                <td>{dash(r.currentStage)}</td>
                                <td>
                                    <span className={styles.capturedStatus}>{dash(r.exclusiveStatus)}</span>
                                </td>
                                <td title={r.failureReason}>{dash(r.failureReason)}</td>
                                <td>{r.retryAvailable ? `Yes (${r.retryCount || 0})` : '—'}</td>
                                <td>
                                    <button type="button" className={styles.linkBtn} onClick={() => setDetailId(r._id === detailId ? '' : r._id)}>
                                        {r._id === detailId ? 'Hide' : 'View Details'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {detail && (
                <div className={styles.capturedDetail}>
                    <h4>{detail.companyName || detail.title}</h4>
                    {isVerifiedTab && Array.isArray(detail.evidence) && detail.evidence.length > 0 ? (
                        <div className={styles.capturedDetailGrid}>
                            <div>
                                <strong>Captured {detail.sourceAppearances || detail.evidence.length} Times — Source Evidence</strong>
                                <div className={styles.capturedTableWrap} style={{ marginTop: 8 }}>
                                    <table className={styles.capturedTable}>
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Source Title</th>
                                                <th>Query</th>
                                                <th>Page</th>
                                                <th>URL</th>
                                                <th>Captured</th>
                                                <th>CP6</th>
                                                <th>CP7</th>
                                                <th>CP8</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.evidence.map((ev, i) => (
                                                <tr key={ev.appearanceId || ev.captureId || i}>
                                                    <td>{i + 1}</td>
                                                    <td>{dash(ev.sourceTitle)}</td>
                                                    <td>{dash(ev.query)}</td>
                                                    <td>{dash(ev.googlePageIndex)}</td>
                                                    <td className={styles.capturedUrl}>{dash(ev.sourceUrl || ev.websiteUrl)}</td>
                                                    <td>{ev.capturedAt ? new Date(ev.capturedAt).toLocaleString() : '—'}</td>
                                                    <td>{dash(ev.cp6?.enrichmentStatus)}</td>
                                                    <td>{dash(ev.cp7?.ownerDecision || ev.cp7?.systemDecision)}</td>
                                                    <td>{dash(ev.cp8?.ownerDecision || ev.cp8?.systemDecision)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.capturedDetailGrid}>
                            <div><strong>Snippet</strong><p>{dash(detail.detail?.snippet || detail.snippet)}</p></div>
                            <div><strong>Source URL</strong><p>{dash(detail.detail?.sourceUrl || detail.sourceUrl)}</p></div>
                            <div><strong>Query / page</strong><p>{dash(detail.queryUsed)} · page {dash(detail.googlePageIndex)}</p></div>
                            <div><strong>Products / services</strong><p>{dash(detail.productsServices)}</p></div>
                            <div><strong>Location match</strong><p>{dash(detail.locationClassification || detail.locationMatch)}</p></div>
                            <div><strong>Confirmed cities</strong><p>{dash(detail.confirmedCities)}</p></div>
                            <div><strong>All addresses</strong><p>{dash(detail.allAddresses || detail.primaryAddress)}</p></div>
                            <div><strong>Office in selected city</strong><p>{detail.officeInSelectedCity ? 'Yes' : 'No'}</p></div>
                            <div><strong>Product match strength</strong><p>{dash(detail.productMatchStrength)}</p></div>
                            <div><strong>Previous location status</strong><p>{dash(detail.previousLocationClassification)}</p></div>
                            <div><strong>Qualification reason</strong><p>{dash(detail.detail?.qualificationReason)}</p></div>
                            <div><strong>Genuineness reason</strong><p>{dash(detail.detail?.genuinenessReason)}</p></div>
                            <div><strong>Warning signals</strong><p>{(detail.detail?.warningSignals || []).join('; ') || '—'}</p></div>
                            <div><strong>Failure / skip</strong><p>{dash(detail.failureReason)}</p></div>
                            <div><strong>Contacts</strong><p>{[detail.contactPerson, detail.phone, detail.whatsapp, detail.email].filter(Boolean).join(' · ') || '—'}</p></div>
                            <div><strong>Social</strong><p>{[detail.facebook, detail.instagram, detail.linkedin].filter(Boolean).join(' · ') || '—'}</p></div>
                        </div>
                    )}
                </div>
            )}

            {limit !== 'all' && Number(pagination.totalPages || 1) > 1 && (
                <div className={styles.capturedPager}>
                    <button type="button" className={styles.howBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
                    <span>Page {pagination.page || page} / {pagination.totalPages || 1}</span>
                    <button
                        type="button"
                        className={styles.howBtn}
                        disabled={(pagination.page || page) >= (pagination.totalPages || 1)}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    );
}
