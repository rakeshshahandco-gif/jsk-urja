import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CompanyContext } from './CompanyContext';
import { getCompanyModuleAllocation } from '@/services/moduleAllocationApi';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdminUser, isPlatformPath } from '@/constants/platformAccess';
import {
    MODULE_MENU_ALWAYS_VISIBLE,
    moduleForMenuId,
    moduleForPath,
} from '@/config/menuModuleMap';

const ModuleGuardContext = createContext(null);

export const ModuleGuardProvider = ({ children }) => {
    const { selectedCompany } = useContext(CompanyContext) || {};
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [moduleGuardEnabled, setModuleGuardEnabled] = useState(false);
    const [enabledModules, setEnabledModules] = useState([]);
    const [disabledModules, setDisabledModules] = useState([]);

    const loadModules = useCallback(async () => {
        if (!selectedCompany?._id) {
            setModuleGuardEnabled(false);
            setEnabledModules([]);
            setDisabledModules([]);
            return;
        }
        setLoading(true);
        try {
            const data = await getCompanyModuleAllocation(selectedCompany._id);
            const effective = data?.effective || {};
            setModuleGuardEnabled(!!effective.moduleGuardEnabled);
            setEnabledModules(effective.enabledModules || []);
            setDisabledModules(effective.disabledModules || []);
        } catch {
            setModuleGuardEnabled(false);
            setEnabledModules([]);
            setDisabledModules([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id]);

    useEffect(() => {
        loadModules();
    }, [loadModules]);

    const isModuleEnabled = useCallback((moduleCode) => {
        if (!moduleGuardEnabled) return true;
        const code = String(moduleCode || '').trim().toLowerCase();
        if (!code) return true;
        return enabledModules.includes(code);
    }, [moduleGuardEnabled, enabledModules]);

    const isMenuItemEnabled = useCallback((menuId) => {
        if (!moduleGuardEnabled) return true;
        if (MODULE_MENU_ALWAYS_VISIBLE.has(menuId)) return true;
        const code = moduleForMenuId(menuId);
        if (!code) return true;
        return isModuleEnabled(code);
    }, [moduleGuardEnabled, isModuleEnabled]);

    const isPathEnabled = useCallback((pathname) => {
        if (!isPlatformAdminUser(user) && isPlatformPath(pathname)) return false;
        if (!moduleGuardEnabled) return true;
        const p = String(pathname || '');
        const code = moduleForPath(p);
        if (!code) return true;
        return isModuleEnabled(code);
    }, [moduleGuardEnabled, isModuleEnabled, user]);

    useEffect(() => {
        if (loading) return;
        if (!isPlatformAdminUser(user) && isPlatformPath(location.pathname)) {
            navigate('/platform-access-denied', {
                replace: true,
                state: { from: location.pathname },
            });
            return;
        }
        if (!moduleGuardEnabled) return;
        if (!isPathEnabled(location.pathname)) {
            navigate('/module-disabled', {
                replace: true,
                state: {
                    from: location.pathname,
                    moduleCode: moduleForPath(location.pathname) || '',
                },
            });
        }
    }, [location.pathname, moduleGuardEnabled, loading, isPathEnabled, navigate, user]);

    const value = useMemo(() => ({
        loading,
        moduleGuardEnabled,
        enabledModules,
        disabledModules,
        isModuleEnabled,
        isMenuItemEnabled,
        isPathEnabled,
        refreshModules: loadModules,
    }), [loading, moduleGuardEnabled, enabledModules, disabledModules, isModuleEnabled, isMenuItemEnabled, isPathEnabled, loadModules]);

    return (
        <ModuleGuardContext.Provider value={value}>
            {children}
        </ModuleGuardContext.Provider>
    );
};

export const useModuleGuard = () => {
    const ctx = useContext(ModuleGuardContext);
    if (!ctx) {
        return {
            loading: false,
            moduleGuardEnabled: false,
            enabledModules: [],
            disabledModules: [],
            isModuleEnabled: () => true,
            isMenuItemEnabled: () => true,
            isPathEnabled: () => true,
            refreshModules: async () => {},
        };
    }
    return ctx;
};
