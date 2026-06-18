import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import TextileJobWorkIssueWizard from '@/features/production/textileJobWork/TextileJobWorkIssueWizard';

export default function TextileJobWorkIssuePage() {
    const [params] = useSearchParams();
    const queryProcess = params.get('process') || 'Dyeing';
    const [processType, setProcessType] = useState(queryProcess);

    useEffect(() => {
        setProcessType(queryProcess);
    }, [queryProcess]);

    return (
        <TextileJobWorkIssueWizard
            processType={processType}
            onProcessTypeChange={setProcessType}
            backPath={PATHS.PRODUCTION.TEXTILE_JOB_WORK.ROOT}
        />
    );
}