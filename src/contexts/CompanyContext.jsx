import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { apiClient } from '@/config/apiClient';
import { getAuthData } from '@/utils/auth';
import { AuthContext } from './AuthContext';

export const CompanyContext = createContext(null);

const COMPANY_STORAGE_KEY = 'jsk_selected_company';

/** Same rules as backend isJskUrjaCompany — pick JSK INNOVATIVE / default co. on fresh Render login. */
const isJskUrjaCompany = (company) => {
    if (!company) return false;
    if (company.isDefault === true) return true;
    const name = `${company.companyName || ''} ${company.brandName || ''} ${company.legalName || ''}`.toUpperCase();
    return name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'));
};

const pickDefaultCompany = (list) => {
    if (!list?.length) return null;
    return (
        list.find((c) => c.isDefault)
        || list.find((c) => isJskUrjaCompany(c))
        || list[0]
    );
};

export const CompanyProvider = ({ children }) => {
    const { token } = useContext(AuthContext) || {};
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
                // Match by id (same browser / same DB)
                const byId = list.find((c) => c._id === parsed._id);
                if (byId) {
                    setSelectedCompanyState(byId);
                    localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(byId));
                    return;
                }
                // Match by name (Render DB ids differ from localhost but name is same)
                const storedName = (parsed.companyName || '').trim().toLowerCase();
                if (storedName) {
                    const byName = list.find(
                        (c) => (c.companyName || '').trim().toLowerCase() === storedName
                    );
                    if (byName) {
                        setSelectedCompanyState(byName);
                        localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(byName));
                        return;
                    }
                }
            } catch {
                // ignore parse errors
            }
        }
        // Fresh login on Render / new device: same as localhost — default JSK company
        const def = pickDefaultCompany(list);
        setSelectedCompanyState(def);
        localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(def));
    }, []);

    // ─── Load / reload when auth token appears (login or page refresh) ────────
    useEffect(() => {
        if (!token) {
            setCompanies([]);
            setSelectedCompanyState(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        const isRender =
            typeof window !== 'undefined' &&
            window.location.hostname.endsWith('.onrender.com');
        const maxRetries = isRender ? 45 : 15;

        const init = async () => {
            setLoading(true);
            let list = await fetchCompanies();
            let retries = 0;
            while (!cancelled && list.length === 0 && retries < maxRetries) {
                await new Promise((r) => setTimeout(r, 1000));
                retries += 1;
                list = await fetchCompanies();
            }
            if (!cancelled) {
                if (list.length > 0) resolveSelection(list);
                setLoading(false);
            }
        };

        init();
        return () => { cancelled = true; };
    }, [token, fetchCompanies, resolveSelection]);

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
