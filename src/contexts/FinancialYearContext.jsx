import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { AuthContext } from './AuthContext';
import { useCompany } from './CompanyContext';
import { getFinancialYears } from '../services/financialYearApi';
import toast from 'react-hot-toast';

const FinancialYearContext = createContext();

export const useFinancialYear = () => {
    const context = useContext(FinancialYearContext);
    if (!context) {
        throw new Error('useFinancialYear must be used within a FinancialYearProvider');
    }
    return context;
};

/**
 * useFYDateRange — convenience hook for ACCOUNTING pages only.
 * Returns { startDate, endDate } strings (YYYY-MM-DD) for the currently
 * selected financial year, so report pages can pre-populate their filters.
 *
 * NOTE: This hook is intentionally NOT used by Customers, Tasks,
 * Follow-ups, or any CRM module — those are date-agnostic.
 */
/** Pick current FY the same way on localhost and Render (2026-2027 when marked current). */
const pickDefaultFYName = (fys) => {
    if (!fys?.length) return '';
    const current = fys.find((fy) => fy.isCurrent && fy.status === 'Active')
        || fys.find((fy) => fy.isCurrentYear && fy.status === 'Active')
        || fys.find((fy) => fy.isCurrent)
        || fys.find((fy) => fy.isCurrentYear)
        || fys.find((fy) => fy.status === 'Active')
        || fys[0];
    return current?.name || '';
};

// Accept both "2026-27" and "2026-2027" across environments.
const normalizeFY = (name) => {
    const s = String(name || '').trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return s;
    return `${m[1]}-20${m[2]}`;
};

export const useFYDateRange = () => {
    const { financialYears, selectedFY } = useFinancialYear();

    return useMemo(() => {
        const fy = financialYears.find(f => f.name === selectedFY);
        if (!fy || !fy.startDate || !fy.endDate) {
            // Fallback: current financial year April → March
            const now = new Date();
            const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            return {
                startDate: `${year}-04-01`,
                endDate: `${year + 1}-03-31`,
            };
        }
        return {
            startDate: new Date(fy.startDate).toISOString().split('T')[0],
            endDate: new Date(fy.endDate).toISOString().split('T')[0],
        };
    }, [financialYears, selectedFY]);
};

export const FinancialYearProvider = ({ children }) => {
    const { selectedCompany, loading: companyLoading } = useCompany();
    const [financialYears, setFinancialYears] = useState([]);
    const [selectedFY, setSelectedFY] = useState(localStorage.getItem('selectedFY') || '');
    const [loading, setLoading] = useState(true);

    const refreshFYs = async () => {
        if (!selectedCompany?._id) return;
        try {
            setLoading(true);
            const response = await getFinancialYears();
            const fys = Array.isArray(response?.data) ? response.data : [];
            setFinancialYears(fys);

            if (fys.length === 0) return;

            const storedFYRaw = (localStorage.getItem('selectedFY') || '').trim();
            const storedFY = normalizeFY(storedFYRaw);
            const storedValid = storedFY && fys.some((fy) => normalizeFY(fy.name) === storedFY);
            if (storedValid) {
                const exact = fys.find((fy) => normalizeFY(fy.name) === storedFY)?.name || storedFY;
                setSelectedFY(exact);
                localStorage.setItem('selectedFY', exact);
            } else {
                // Invalid / empty stored FY (new Render host) → same default as localhost
                const defName = pickDefaultFYName(fys);
                if (defName) handleFYChange(defName);
            }
        } catch (error) {
            console.error('Failed to fetch financial years:', error);
            toast.error('Failed to load financial years');
        } finally {
            setLoading(false);
        }
    };

    const handleFYChange = (fyName) => {
        setSelectedFY(fyName);
        localStorage.setItem('selectedFY', fyName);
    };

    const { token } = useContext(AuthContext) || {};

    // FY list requires X-Company-Id — load only after company is selected.
    useEffect(() => {
        if (token && selectedCompany?._id && !companyLoading) {
            refreshFYs();
        }
    }, [token, selectedCompany?._id, companyLoading]);

    // Derive the full object for the selected FY
    const selectedFYObject = useMemo(
        () => financialYears.find(f => f.name === selectedFY) || null,
        [financialYears, selectedFY]
    );

    const value = {
        financialYears,
        selectedFY,
        selectedFYObject,
        setSelectedFY: handleFYChange,
        loading,
        refreshFYs,
    };

    return (
        <FinancialYearContext.Provider value={value}>
            {children}
        </FinancialYearContext.Provider>
    );
};
