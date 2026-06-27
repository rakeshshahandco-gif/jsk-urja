const STORAGE_KEY = 'jsk_selected_company';

let memoryCompanyId = null;

export function setActiveCompanyId(id) {
  memoryCompanyId = id ? String(id) : null;
}

export async function getActiveCompanyId(storage) {
  if (memoryCompanyId) return memoryCompanyId;
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const co = JSON.parse(raw);
    const id = co?._id || co?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}
