/**
 * Golden / Development Module Lock — platform storage only.
 * Writes ONLY settings.moduleLocks on PlatformFeatureSettings.
 * Does NOT create collections. Does NOT block CRM runtime.
 */
import { getPlatformFeatureSettingsDoc } from './platformFeatureSettings.service.js';
import { AuditLog } from '../models/auditLog.model.js';
import {
    MODULE_LOCK_CATALOG,
    MODULE_LOCK_SCOPES,
    getCatalogEntry,
    normalizeModuleLockKey,
} from '../constants/moduleLock.catalog.js';

function readLocks(settings) {
    const raw = settings?.moduleLocks;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return { ...raw };
}

function toStatusEntry(catalogItem, stored) {
    const locked = stored?.locked === true || String(stored?.status || '').toUpperCase() === 'LOCKED';
    return {
        moduleKey: catalogItem.moduleKey,
        moduleName: catalogItem.moduleName,
        parentKey: catalogItem.parentKey || null,
        scope: stored?.scope || catalogItem.scope || 'COMMON',
        locked,
        status: locked ? 'LOCKED' : 'OPEN',
        lockReason: stored?.lockReason || '',
        lockedAt: stored?.lockedAt || null,
        lockedBy: stored?.lockedBy || null,
        lockedByName: stored?.lockedByName || '',
        unlockedAt: stored?.unlockedAt || null,
        unlockedBy: stored?.unlockedBy || null,
        unlockedByName: stored?.unlockedByName || '',
        unlockReason: stored?.unlockReason || '',
        testOnly: Boolean(catalogItem.testOnly),
    };
}

export async function listModuleLocks() {
    const doc = await getPlatformFeatureSettingsDoc();
    const locks = readLocks(doc.settings);
    return MODULE_LOCK_CATALOG.map((item) => toStatusEntry(item, locks[item.moduleKey]));
}

export async function getModuleLock(moduleKey) {
    const key = normalizeModuleLockKey(moduleKey);
    const catalogItem = getCatalogEntry(key) || {
        moduleKey: key,
        moduleName: key,
        scope: 'COMMON',
    };
    const doc = await getPlatformFeatureSettingsDoc();
    const locks = readLocks(doc.settings);
    return toStatusEntry(catalogItem, locks[key]);
}

export async function isModuleLocked(moduleKey) {
    const entry = await getModuleLock(moduleKey);
    return entry.locked === true;
}

/**
 * Lock or unlock a catalog module. Merges only settings.moduleLocks[key].
 */
export async function setModuleLock({
    moduleKey,
    locked,
    scope,
    reason,
    user,
    ipAddress,
    userAgent,
}) {
    const key = normalizeModuleLockKey(moduleKey);
    if (!key) {
        const err = new Error('moduleKey is required');
        err.statusCode = 400;
        throw err;
    }
    const catalogItem = getCatalogEntry(key);
    if (!catalogItem) {
        const err = new Error(`Unknown module lock key: ${key}`);
        err.statusCode = 400;
        throw err;
    }

    const wantLocked = Boolean(locked);
    const reasonText = String(reason || '').trim();
    if (!wantLocked && !reasonText) {
        const err = new Error('Unlock reason is required');
        err.statusCode = 400;
        throw err;
    }

    let nextScope = String(scope || catalogItem.scope || 'COMMON').toUpperCase();
    if (!MODULE_LOCK_SCOPES.includes(nextScope)) {
        nextScope = catalogItem.scope || 'COMMON';
    }

    const doc = await getPlatformFeatureSettingsDoc();
    const settings = doc.settings && typeof doc.settings === 'object' ? { ...doc.settings } : {};
    const locks = readLocks(settings);
    const prev = locks[key] && typeof locks[key] === 'object' ? { ...locks[key] } : {};
    const userId = user?._id || user?.id || null;
    const userName = user?.name || user?.username || '';

    const next = {
        ...prev,
        moduleKey: key,
        moduleName: catalogItem.moduleName,
        locked: wantLocked,
        status: wantLocked ? 'LOCKED' : 'OPEN',
        scope: nextScope,
    };

    if (wantLocked) {
        next.lockReason = reasonText || 'Approved Golden Module';
        next.lockedAt = new Date();
        next.lockedBy = userId;
        next.lockedByName = userName;
    } else {
        next.lockReason = prev.lockReason || '';
        next.unlockedAt = new Date();
        next.unlockedBy = userId;
        next.unlockedByName = userName;
        next.unlockReason = reasonText;
    }

    locks[key] = next;
    settings.moduleLocks = locks;
    doc.settings = settings;
    doc.markModified('settings');
    if (userId) doc.updatedBy = userId;
    await doc.save();

    try {
        await AuditLog.create({
            user: userId,
            action: 'UPDATE',
            module: 'ModuleLock',
            description: wantLocked
                ? `Locked module ${catalogItem.moduleName} (${key})`
                : `Unlocked module ${catalogItem.moduleName} (${key})`,
            details: {
                moduleKey: key,
                previous: prev,
                next,
                developmentProtectionOnly: true,
            },
            ipAddress: ipAddress || '',
            userAgent: userAgent || '',
        });
    } catch {
        // Audit failure must not block lock save
    }

    return toStatusEntry(catalogItem, next);
}

export async function getModuleLockReport() {
    const list = await listModuleLocks();
    return {
        source: 'platformfeaturesettings.settings.moduleLocks',
        developmentProtectionOnly: true,
        runtimeUnaffected: true,
        locks: list,
        lockedCount: list.filter((x) => x.locked).length,
        openCount: list.filter((x) => !x.locked).length,
    };
}
