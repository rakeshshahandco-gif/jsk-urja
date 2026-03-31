import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
    const [financialYears, setFinancialYears] = useState([]);
    const [selectedFY, setSelectedFY] = useState(localStorage.getItem('selectedFY') || '');
    const [loading, setLoading] = useState(true);

    const refreshFYs = async () => {
        try {
            setLoading(true);
            const response = await getFinancialYears();
            const fys = response.data || [];
            setFinancialYears(fys);

            // Auto-select: prefer isCurrent flag, then first Active, then first overall
            const storedFY = localStorage.getItem('selectedFY');
            if (!storedFY && fys.length > 0) {
                const current = fys.find(fy => fy.isCurrent && fy.status === 'Active')
                    || fys.find(fy => fy.isCurrentYear && fy.status === 'Active')
                    || fys.find(fy => fy.status === 'Active')
                    || fys[0];
                handleFYChange(current.name);
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

    useEffect(() => {
        refreshFYs();
    }, []);

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
