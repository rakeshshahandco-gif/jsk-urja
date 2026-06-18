import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { TextileJobWorkChallanReturnPage } from '@/features/production/textileDyeingChallan/TextileDyeingChallanReturnPage';

export default function TextileJobWorkReturnEntryPage() {
    const [params] = useSearchParams();
    const queryProcess = params.get('process') || 'Dyeing';
    const [processType, setProcessType] = useState(queryProcess);

    useEffect(() => {
        setProcessType(queryProcess);
    }, [queryProcess]);

    return (
        <TextileJobWorkChallanReturnPage
            processType={processType}
            allowProcessSelect
            unifiedModule
            onProcessTypeChange={setProcessType}
            backPath={PATHS.PRODUCTION.TEXTILE_JOB_WORK.ROOT}
        />
    );
}
