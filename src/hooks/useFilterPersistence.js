import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * A custom hook to persist list filters in localStorage
 * @param {string} pageKey - Unique key for the page/module
 * @param {object} initialFilters - Default state of filters
 * @returns {object} { filters, setFilter, resetFilters }
 */
export const useFilterPersistence = (pageKey, initialFilters) => {
    const storageKey = `crm_filter_${pageKey}`;
    const initialFiltersRef = useRef(initialFilters);

    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Merge saved with initial to ensure new filter keys are added if schema changes
                return { ...initialFilters, ...parsed };
            } catch (e) {
                console.warn(`Failed to parse filters for ${pageKey}`, e);
                return initialFilters;
            }
        }
        return initialFilters;
    });

    // Update localStorage whenever filters change
    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(filters));
    }, [filters, storageKey]);

    /**
     * Update a single filter field
     * @param {string} key 
     * @param {any} value 
     */
    const setFilter = useCallback((key, value) => {
        setFilters(prev => ({
            ...prev,
            [key]: value
        }));
    }, []);

    const updateFilters = useCallback((patch) => {
        setFilters(prev => ({
            ...prev,
            ...patch
        }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFiltersRef.current);
        localStorage.removeItem(storageKey);
    }, [storageKey]);

    return {
        filters,
        setFilter,
        updateFilters,
        resetFilters
    };
};
