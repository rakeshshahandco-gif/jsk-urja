import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { companiesApi } from '../api/companies.api';
import { storage } from '../utils/storage';
import { setActiveCompanyId } from '../utils/activeCompany';
import { useAuth } from './AuthContext';

const COMPANY_STORAGE_KEY = 'jsk_selected_company';

const isJskUrjaCompany = (company) => {
  if (!company) return false;
  if (company.isDefault === true) return true;
  const name = `${company.companyName || ''} ${company.brandName || ''} ${company.legalName || ''}`.toUpperCase();
  return name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'));
};

const pickDefaultCompany = (list) => {
  if (!list?.length) return null;
  return list.find((c) => c.isDefault) || list.find((c) => isJskUrjaCompany(c)) || list[0];
};

const CompanyContext = createContext(null);

export const CompanyProvider = ({ children }) => {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const resolveSelection = useCallback(async (list) => {
    if (!list?.length) {
      setSelectedCompany(null);
      return;
    }
    const stored = await storage.getItem(COMPANY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const byId = list.find((c) => c._id === parsed._id);
        if (byId) {
          setSelectedCompany(byId);
          await storage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(byId));
          return;
        }
        const storedName = (parsed.companyName || '').trim().toLowerCase();
        if (storedName) {
          const byName = list.find((c) => (c.companyName || '').trim().toLowerCase() === storedName);
          if (byName) {
            setSelectedCompany(byName);
            await storage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(byName));
            return;
          }
        }
      } catch {
        /* ignore */
      }
    }
    const def = pickDefaultCompany(list);
    setSelectedCompany(def);
    if (def) await storage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(def));
  }, []);

  const loadCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setSelectedCompany(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let list = await companiesApi.getActiveCompanies();
      if (!Array.isArray(list)) list = [];
      let retries = 0;
      while (list.length === 0 && retries < 2) {
        await new Promise((r) => setTimeout(r, 800));
        list = await companiesApi.getActiveCompanies();
        if (!Array.isArray(list)) list = [];
        retries += 1;
      }
      setCompanies(list);
      await resolveSelection(list);
      if (list.length === 0) {
        setError('No active company found for your account.');
      }
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to load companies';
      setError(msg);
      console.warn('[CompanyContext]', msg);
    } finally {
      setLoading(false);
    }
  }, [user, resolveSelection]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    setActiveCompanyId(selectedCompany?._id || selectedCompany?.id || null);
  }, [selectedCompany]);

  const switchCompany = useCallback(async (company) => {
    setSelectedCompany(company);
    if (company) {
      await storage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(company));
      setActiveCompanyId(company._id || company.id);
    } else {
      setActiveCompanyId(null);
    }
  }, []);

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompany,
        switchCompany,
        loading,
        error,
        refreshCompanies: loadCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
};
