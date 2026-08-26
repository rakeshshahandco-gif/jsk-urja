import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const fieldStyle = { display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' };
const labelStyle = { display: 'block', marginBottom: 14, fontSize: 13, fontWeight: 500, color: '#0f172a' };
const btnPrimary = { padding: '12px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 };
const btnSecondary = { padding: '10px 16px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 13 };

const BATCH_SIZES = [25, 50, 100, 250];

export default function DataExtractorDiscoveryPage() {
    const { selectedFY } = useFinancialYear();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [form, setForm] = useState({
        keyword: '',
        location: '',
        resultLimit: 100,
        crawlDepth: 1,
        includeDirectories: true,
        batchSize: 25,
    });

    const onChange = (key) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm((f) => ({ ...f, [key]: key === 'crawlDepth' || key === 'batchSize' || key === 'resultLimit' ? Number(value) : value }));
    };

    const targetCompanies = useMemo(() => Math.min(250, Math.max(1, Number(form.batchSize) || 25)), [form.batchSize]);

    const onStart = async (e) => {
        e.preventDefault();
        if (!form.keyword.trim()) {
            toast.error('Enter what you are looking for');
            return;
        }
        setLoading(true);
        try {
            const created = await dataExtractorApi.createDiscoveryJob({
                keyword: form.keyword.trim(),
                location: form.location.trim(),
                targetCompanies,
                resultLimit: targetCompanies,
                batchSize: Number(form.batchSize) || 25,
                crawlDepth: Number(form.crawlDepth) || 1,
                includeDirectories: form.includeDirectories !== false,
                sources: ['public_web', 'website_enrichment'],
                financialYear: selectedFY,
            });
            const job = created?.job || created;
            const jobId = job?._id || job?.id;
            if (!jobId) throw new Error('No job id returned');
            await dataExtractorApi.startDiscoveryJob(jobId);
            toast.success('Extraction started');
            navigate(PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(jobId));
        } catch (err) {
            toast.error(err?.response?.data?.message || err.message || 'Failed to start extraction');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 720 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Quick Search</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
                Public-web business discovery. Batch size is operational only — it does not cap total campaign results. CRM leads are not created automatically.
            </p>

            <form onSubmit={onStart} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                <label style={labelStyle}>
                    What are you looking for?
                    <input
                        type="text"
                        value={form.keyword}
                        onChange={onChange('keyword')}
                        placeholder="Home Automation"
                        style={{ ...fieldStyle, fontSize: 15 }}
                    />
                </label>
                <label style={labelStyle}>
                    Location – Optional
                    <input
                        type="text"
                        value={form.location}
                        onChange={onChange('location')}
                        placeholder="India, Maharashtra, or Mumbai"
                        style={fieldStyle}
                    />
                </label>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Batch size (operational — not a campaign ceiling)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {BATCH_SIZES.map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, batchSize: n, resultLimit: n }))}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: 8,
                                    border: form.batchSize === n ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                    background: form.batchSize === n ? '#eff6ff' : '#fff',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 600,
                                }}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                        Collection continues until queries/pages are exhausted, you stop the run, or a provider is blocked. Hitting 250 in a batch does not mean the campaign is complete.
                    </p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                    <button type="submit" disabled={loading} style={{ ...btnPrimary, cursor: loading ? 'wait' : 'pointer' }}>
                        {loading ? 'Starting…' : 'START EXTRACTION'}
                    </button>
                    <Link to={PATHS.DATA_EXTRACTOR.DISCOVERY_JOBS} style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                        Extraction History
                    </Link>
                </div>
            </form>

            <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                style={{ marginTop: 16, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}
            >
                {showAdvanced ? 'Hide Advanced Settings' : 'Advanced Settings'}
            </button>

            {showAdvanced && (
                <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                    <label style={labelStyle}>
                        Result limit (advanced override)
                        <select value={form.resultLimit} onChange={onChange('resultLimit')} style={fieldStyle}>
                            <option value={10}>10 (local test)</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={250}>250</option>
                            <option value={500}>500</option>
                            <option value={1000}>1000</option>
                        </select>
                    </label>
                    <label style={labelStyle}>
                        Crawl depth (default 1 — discovered page plus Contact/About)
                        <select value={form.crawlDepth} onChange={onChange('crawlDepth')} style={fieldStyle}>
                            <option value={0}>0 — discovered URL only</option>
                            <option value={1}>1 — Contact / About / Company pages (recommended)</option>
                            <option value={2}>2 — deeper same-domain crawl</option>
                        </select>
                    </label>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={form.includeDirectories} onChange={onChange('includeDirectories')} />
                        Include IndiaMART / TradeIndia / Justdial / ExportersIndia public search queries
                    </label>
                    <label style={labelStyle}>
                        Batch size
                        <input type="number" min={1} max={250} value={form.batchSize} onChange={onChange('batchSize')} style={fieldStyle} />
                    </label>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                        Public web discovery does not require a paid search API. If a provider blocks a query (HTTP 429/403), that query is paused and is not retried continuously.
                    </p>
                </div>
            )}
        </div>
    );
}
