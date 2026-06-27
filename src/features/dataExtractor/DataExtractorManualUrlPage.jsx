import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

export default function DataExtractorManualUrlPage() {
    const { selectedFY } = useFinancialYear();
    const navigate = useNavigate();
    const [urlsText, setUrlsText] = useState('');
    const [loading, setLoading] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        const urls = urlsText.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
        if (!urls.length) {
            toast.error('Enter at least one URL');
            return;
        }
        setLoading(true);
        try {
            const result = await dataExtractorApi.runManualUrl({ urls, financialYear: selectedFY });
            toast.success(`Extracted ${result?.records?.length || 0} record(s)`);
            if (result?.job?._id) {
                navigate(PATHS.DATA_EXTRACTOR.PREVIEW(result.job._id));
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Extraction failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 720 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Manual URL Extract</h2>
            <p style={{ color: '#64748b', fontSize: 14 }}>
                One URL per line. Only public business pages — no login bypass.
            </p>
            <form onSubmit={onSubmit}>
                <textarea
                    value={urlsText}
                    onChange={(e) => setUrlsText(e.target.value)}
                    rows={12}
                    placeholder={'https://example.com\nhttps://another-company.com'}
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'inherit' }}
                />
                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        marginTop: 12,
                        padding: '10px 20px',
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        cursor: loading ? 'wait' : 'pointer',
                    }}
                >
                    {loading ? 'Extracting…' : 'Run Extract'}
                </button>
            </form>
        </div>
    );
}
