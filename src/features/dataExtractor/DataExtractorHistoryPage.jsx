import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const sourceLabel = (j) => {
    if (j.jobType === 'search') return j.adapterId || j.inputPayload?.sourceId || 'search';
    return j.jobType;
};

export default function DataExtractorHistoryPage() {
    const { selectedFY } = useFinancialYear();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState('');

    const loadJobs = () => dataExtractorApi.listJobs({ limit: 50 })
        .then((data) => setJobs(data?.results || []))
        .catch(() => toast.error('Failed to load history'));

    useEffect(() => {
        loadJobs().finally(() => setLoading(false));
    }, []);

    const onRerun = async (jobId) => {
        setBusyId(`rerun-${jobId}`);
        try {
            const result = await dataExtractorApi.rerunJob(jobId, { financialYear: selectedFY });
            toast.success('Search re-run completed');
            if (result?.job?._id) navigate(PATHS.DATA_EXTRACTOR.PREVIEW(result.job._id));
            else loadJobs();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Re-run failed');
        } finally {
            setBusyId('');
        }
    };

    const onEnhanceAi = async (jobId) => {
        setBusyId(`ai-${jobId}`);
        try {
            const result = await dataExtractorApi.enhanceJobAi(jobId);
            toast.success('AI enhancement applied');
            if (result?.job?._id) navigate(PATHS.DATA_EXTRACTOR.PREVIEW(result.job._id));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'AI enhance failed', { duration: 8000 });
        } finally {
            setBusyId('');
        }
    };

    if (loading) return <div>Loading search history…</div>;

    return (
        <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Search History</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                Re-run past keyword searches or apply AI classification/translation to preview results.
            </p>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            <th style={{ padding: 10 }}>Date</th>
                            <th style={{ padding: 10 }}>Source</th>
                            <th style={{ padding: 10 }}>Summary</th>
                            <th style={{ padding: 10 }}>Results</th>
                            <th style={{ padding: 10 }}>AI</th>
                            <th style={{ padding: 10 }}>Status</th>
                            <th style={{ padding: 10 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.length === 0 && (
                            <tr><td colSpan={7} style={{ padding: 16, color: '#64748b' }}>No jobs yet</td></tr>
                        )}
                        {jobs.map((j) => (
                            <tr key={j._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 10 }}>{new Date(j.createdAt).toLocaleString()}</td>
                                <td style={{ padding: 10 }}>{sourceLabel(j)}</td>
                                <td style={{ padding: 10, maxWidth: 220 }}>{j.inputSummary}</td>
                                <td style={{ padding: 10 }}>{j.recordCount}</td>
                                <td style={{ padding: 10 }}>{j.metadata?.aiEnhanced ? 'Yes' : '—'}</td>
                                <td style={{ padding: 10 }}>{j.status}</td>
                                <td style={{ padding: 10, whiteSpace: 'nowrap' }}>
                                    <Link to={PATHS.DATA_EXTRACTOR.PREVIEW(j._id)} style={{ marginRight: 8 }}>Preview</Link>
                                    {(j.jobType === 'search' || j.jobType === 'manual_url') && (
                                        <button
                                            type="button"
                                            onClick={() => onRerun(j._id)}
                                            disabled={busyId === `rerun-${j._id}`}
                                            style={{ marginRight: 6, fontSize: 12, cursor: 'pointer' }}
                                        >
                                            {busyId === `rerun-${j._id}` ? '…' : 'Re-run'}
                                        </button>
                                    )}
                                    {j.jobType === 'search' && j.metadata?.previewOnly && (
                                        <button
                                            type="button"
                                            onClick={() => onEnhanceAi(j._id)}
                                            disabled={busyId === `ai-${j._id}`}
                                            style={{ fontSize: 12, cursor: 'pointer' }}
                                        >
                                            {busyId === `ai-${j._id}` ? '…' : 'Run AI'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
