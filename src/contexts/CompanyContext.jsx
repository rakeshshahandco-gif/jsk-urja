import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { apiClient } from '@/config/apiClient';
import { getAuthData } from '@/utils/auth';

export const CompanyContext = createContext(null);

const COMPANY_STORAGE_KEY = 'jsk_selected_company';

export const CompanyProvider = ({ children }) => {
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompanyState] = useState(null);
    const [loading, setLoading] = useState(true);

    // ─── Fetch active companies (only when auth token exists) ─────────────────
    const fetchCompanies = useCallback(async () => {
        // Don't attempt if no auth token
        const authData = getAuthData();
        if (!authData?.token) return [];

        try {
            const res = await apiClient.get('/companies/active');
            const list = res.data?.data || [];
            setCompanies(list);
            return list;
        } catch (err) {
            // 401 = not logged in yet, silent fail
            if (err?.response?.status !== 401) {
                console.error('[CompanyContext] Failed to fetch companies:', err.message);
            }
            return [];
        }
    }, []);

    // ─── Resolve which company to select from a list ──────────────────────────
    const resolveSelection = useCallback((list) => {
        if (!list || list.length === 0) return;

        const stored = localStorage.getItem(COMPANY_STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const found = list.find(c => c._id === parsed._id);
                if (found) {
                    setSelectedCompanyState(found);
                    return;
                }
            } catch {
                // ignore parse errors
            }
        }
        // Default: first company marked isDefault, or just first
        const def = list.find(c => c.isDefault) || list[0];
        setSelectedCompanyState(def);
        localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(def));
    }, []);

    // ─── Initial load ─────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            setLoading(true);

            // If no token, poll every second until we get one (user is logging in)
            let list = await fetchCompanies();
            if (list.length === 0) {
                // Retry up to 10 seconds (covers login flow)
                let retries = 0;
                const interval = setInterval(async () => {
                    retries++;
                    const retryList = await fetchCompanies();
                    if (retryList.length > 0 || retries >= 10) {
                        clearInterval(interval);
                        if (retryList.length > 0) {
                            resolveSelection(retryList);
                        }
                        setLoading(false);
                    }
                }, 1000);
                return;
            }

            resolveSelection(list);
            setLoading(false);
        };
        init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Re-fetch whenever localStorage auth token changes (e.g. after login) ─
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'crm_auth_token' && e.newValue) {
                // Token just appeared → fetch companies
                fetchCompanies().then(list => {
                    if (list.length > 0) resolveSelection(list);
                    setLoading(false);
                });
            }
            if (e.key === 'crm_auth_token' && !e.newValue) {
                // Token removed (logout) → clear companies
                setCompanies([]);
                setSelectedCompanyState(null);
                localStorage.removeItem(COMPANY_STORAGE_KEY);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [fetchCompanies, resolveSelection]);

    // ─── Switch company (with confirmation in the switcher UI) ───────────────
    const switchCompany = useCallback((company) => {
        setSelectedCompanyState(company);
        localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(company));
    }, []);

    // ─── Refresh list (called after add/edit in Company Master) ──────────────
    const refreshCompanies = useCallback(async () => {
        const list = await fetchCompanies();
        if (list.length > 0 && selectedCompany) {
            const updated = list.find(c => c._id === selectedCompany._id);
            if (updated) {
                setSelectedCompanyState(updated);
                localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(updated));
            }
        }
        return list;
    }, [fetchCompanies, selectedCompany]);

    const value = {
        companies,
        selectedCompany,
        switchCompany,
        refreshCompanies,
        loading,
    };

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
};

// Hook
export const useCompany = () => {
    const ctx = useContext(CompanyContext);
    if (!ctx) throw new Error('useCompany must be used within a CompanyProvider');
    return ctx;
};
