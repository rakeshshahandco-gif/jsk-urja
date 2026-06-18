import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import ProcessTypeSelect from '@/features/production/textileJobWork/ProcessTypeSelect';
import { TextileJobWorkStockPage } from '@/features/production/textileDyeingChallan/TextileStockWithDyersPage';

export default function TextileJobWorkModuleReportsPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const queryProcess = params.get('process') || 'Dyeing';
    const [processType, setProcessType] = useState(queryProcess);
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);

    useEffect(() => {
        setProcessType(queryProcess);
    }, [queryProcess]);

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    return (
        <div style={{ padding: '16px 20px' }}>
            <button
                type="button"
                onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_JOB_WORK.ROOT)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}
            >
                <ChevronLeft size={16} /> Back
            </button>
            <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Job Work Reports</h1>
            <div style={{ maxWidth: 280, marginBottom: 16 }}>
                <ProcessTypeSelect value={processType} onChange={setProcessType} />
            </div>
            <TextileJobWorkStockPage processType={processType} hideTitle defaultTab={0} />
        </div>
    );
}
