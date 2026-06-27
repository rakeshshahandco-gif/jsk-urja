import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

export default function DataExtractorImportPage() {
    const { selectedFY } = useFinancialYear();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const onPickFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const result = await dataExtractorApi.uploadExcel({ file, financialYear: selectedFY });
            toast.success(`Imported ${result?.records?.length || 0} record(s)`);
            if (result?.job?._id) {
                navigate(PATHS.DATA_EXTRACTOR.PREVIEW(result.job._id));
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Import failed');
        } finally {
            setLoading(false);
            e.target.value = '';
        }
    };

    return (
        <div style={{ maxWidth: 720 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Excel / CSV Import</h2>
            <p style={{ color: '#64748b', fontSize: 14 }}>
                Upload .xlsx, .xls, or .csv with columns like Company, Website, Email, Phone, City, Country.
                Compatible with LetsExtract-style exports.
            </p>
            <label
                style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: loading ? '#94a3b8' : '#2563eb',
                    color: '#fff',
                    borderRadius: 8,
                    cursor: loading ? 'wait' : 'pointer',
                }}
            >
                {loading ? 'Importing…' : 'Choose file'}
                <input type="file" accept=".xlsx,.xls,.csv" onChange={onPickFile} disabled={loading} style={{ display: 'none' }} />
            </label>
        </div>
    );
}
