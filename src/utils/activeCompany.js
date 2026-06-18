const STORAGE_KEY = 'jsk_selected_company';

let memoryCompanyId = null;

/** Called by CompanyContext whenever the active company changes. */
export function setActiveCompanyId(id) {
    memoryCompanyId = id || null;
}

/** Resolve company id for API headers (memory first, then localStorage). */
export function getActiveCompanyId() {
    if (memoryCompanyId) return memoryCompanyId;
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (!raw) return null;
        const co = JSON.parse(raw);
        const id = co?._id || co?.id;
        return id ? String(id) : null;
    } catch {
        return null;
    }
}
