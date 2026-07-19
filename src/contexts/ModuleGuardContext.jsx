import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CompanyContext } from './CompanyContext';
import { getCompanyModuleAllocation, getMyCompanyModuleEffective } from '@/services/moduleAllocationApi';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdminUser, isPlatformPath } from '@/constants/platformAccess';
import {
    MODULE_MENU_ALWAYS_VISIBLE,
    moduleForMenuId,
    moduleForPath,
} from '@/config/menuModuleMap';
import {
    MODULE_STATE,
    MODULE_LOCK_MODE,
    evaluateModuleAccess,
    resolveModuleState,
    canCreateInModule,
    canMutateInModule,
    canViewInModule,
} from '@/utils/moduleAccessDecision';
import toast from 'react-hot-toast';

const ModuleGuardContext = createContext(null);

function isCreatePath(pathname = '') {
    const p = String(pathname);
    return /\/new(?:\/|$|\?)/i.test(p) || /\/create(?:\/|$|\?)/i.test(p);
}

function isEditPath(pathname = '') {
    return /\/edit(?:\/|$|\?)/i.test(String(pathname));
}

export const ModuleGuardProvider = ({ children }) => {
    const { selectedCompany } = useContext(CompanyContext) || {};
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [moduleGuardEnabled, setModuleGuardEnabled] = useState(false);
    const [enabledModules, setEnabledModules] = useState([]);
    const [disabledModules, setDisabledModules] = useState([]);
    const [moduleStates, setModuleStates] = useState([]);

    const loadModules = useCallback(async () => {
        if (!selectedCompany?._id) {
            setModuleGuardEnabled(false);
            setEnabledModules([]);
            setDisabledModules([]);
            setModuleStates([]);
            return;
        }
        setLoading(true);
        try {
            const data = isPlatformAdminUser(user)
                ? await getCompanyModuleAllocation(selectedCompany._id)
                : await getMyCompanyModuleEffective(selectedCompany._id);
            const effective = data?.effective || {};
            setModuleGuardEnabled(!!effective.moduleGuardEnabled);
            setEnabledModules(effective.enabledModules || []);
            setDisabledModules(effective.disabledModules || []);
            setModuleStates(effective.moduleStates || data?.company?.moduleStates || []);
        } catch {
            setModuleGuardEnabled(false);
            setEnabledModules([]);
            setDisabledModules([]);
            setModuleStates([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, user]);

    useEffect(() => {
        loadModules();
    }, [loadModules]);

    const getModuleResolved = useCallback((moduleCode) => {
        return resolveModuleState({
            moduleGuardEnabled,
            enabledModules,
            moduleStates,
            moduleCode,
        });
    }, [moduleGuardEnabled, enabledModules, moduleStates]);

    const isModuleEnabled = useCallback((moduleCode) => {
        return evaluateModuleAccess({
            moduleGuardEnabled,
            enabledModules,
            moduleStates,
            moduleCode,
        }).allowed;
    }, [moduleGuardEnabled, enabledModules, moduleStates]);

    const isMenuItemEnabled = useCallback((menuId) => {
        if (MODULE_MENU_ALWAYS_VISIBLE.has(menuId)) return true;
        const code = moduleForMenuId(menuId);
        if (!code) return true;
        // When guard off and no explicit OFF state, show (legacy)
        if (!moduleGuardEnabled) {
            const resolved = getModuleResolved(code);
            return resolved.state !== MODULE_STATE.OFF;
        }
        return isModuleEnabled(code);
    }, [moduleGuardEnabled, isModuleEnabled, getModuleResolved]);

    const getMenuLockInfo = useCallback((menuId) => {
        const code = moduleForMenuId(menuId);
        if (!code) return null;
        const resolved = getModuleResolved(code);
        if (resolved.state !== MODULE_STATE.LOCKED) return null;
        return resolved;
    }, [getModuleResolved]);

    const isPathEnabled = useCallback((pathname) => {
        if (!isPlatformAdminUser(user) && isPlatformPath(pathname)) return false;
        const p = String(pathname || '');
        const code = moduleForPath(p);
        if (!code) return true;
        const resolved = getModuleResolved(code);
        if (resolved.state === MODULE_STATE.OFF) return false;
        if (resolved.state === MODULE_STATE.LOCKED && resolved.lockMode === MODULE_LOCK_MODE.FULL_LOCK) {
            if (!isPlatformAdminUser(user)) return false;
        }
        if (!moduleGuardEnabled && resolved.source !== 'moduleStates') return true;
        return resolved.state !== MODULE_STATE.OFF;
    }, [moduleGuardEnabled, getModuleResolved, user]);

    useEffect(() => {
        if (loading) return;
        if (!isPlatformAdminUser(user) && isPlatformPath(location.pathname)) {
            navigate('/platform-access-denied', { replace: true, state: { from: location.pathname } });
            return;
        }
        const code = moduleForPath(location.pathname);
        if (!code) return;
        const resolved = getModuleResolved(code);

        if (resolved.state === MODULE_STATE.OFF) {
            navigate('/module-disabled', { replace: true, state: { from: location.pathname } });
            return;
        }

        if (resolved.state === MODULE_STATE.LOCKED && resolved.lockMode === MODULE_LOCK_MODE.FULL_LOCK
            && !isPlatformAdminUser(user)) {
            navigate('/module-disabled', {
                replace: true,
                state: { from: location.pathname, locked: true, lockReason: resolved.lockReason },
            });
            return;
        }

        if (resolved.state === MODULE_STATE.LOCKED) {
            if (isCreatePath(location.pathname) && !canCreateInModule(resolved)) {
                toast.error(resolved.lockReason || 'This module is locked — new entries are blocked');
                navigate(-1);
                return;
            }
            if (isEditPath(location.pathname) && !canMutateInModule(resolved)) {
                toast.error(resolved.lockReason || 'This module is locked — edits are blocked');
                navigate(-1);
            }
        }
    }, [location.pathname, loading, getModuleResolved, navigate, user]);

    const currentPathModule = useMemo(() => {
        const code = moduleForPath(location.pathname);
        if (!code) return null;
        return getModuleResolved(code);
    }, [location.pathname, getModuleResolved]);

    const value = useMemo(() => ({
        loading,
        moduleGuardEnabled,
        enabledModules,
        disabledModules,
        moduleStates,
        companyId: selectedCompany?._id || null,
        isModuleEnabled,
        isMenuItemEnabled,
        isPathEnabled,
        getModuleResolved,
        getMenuLockInfo,
        canCreate: (moduleCode) => canCreateInModule(getModuleResolved(moduleCode)),
        canMutate: (moduleCode) => canMutateInModule(getModuleResolved(moduleCode)),
        canView: (moduleCode) => canViewInModule(getModuleResolved(moduleCode)),
        currentPathModule,
        refreshModules: loadModules,
    }), [
        loading,
        moduleGuardEnabled,
        enabledModules,
        disabledModules,
        moduleStates,
        selectedCompany?._id,
        isModuleEnabled,
        isMenuItemEnabled,
        isPathEnabled,
        getModuleResolved,
        getMenuLockInfo,
        currentPathModule,
        loadModules,
    ]);

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
            moduleStates: [],
            companyId: null,
            isModuleEnabled: () => true,
            isMenuItemEnabled: () => true,
            isPathEnabled: () => true,
            getModuleResolved: () => ({ state: MODULE_STATE.ON, lockMode: null }),
            getMenuLockInfo: () => null,
            canCreate: () => true,
            canMutate: () => true,
            canView: () => true,
            currentPathModule: null,
            refreshModules: async () => {},
        };
    }
    return ctx;
};
