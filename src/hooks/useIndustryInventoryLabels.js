import { useMemo } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { getIndustryInventoryLabels } from '@/utils/industryInventoryLabels';

export function useIndustryInventoryLabels() {
    const { selectedCompany } = useCompany();
    return useMemo(() => getIndustryInventoryLabels(selectedCompany), [selectedCompany]);
}