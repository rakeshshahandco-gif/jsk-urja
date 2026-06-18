export function findVendorRateForProcess(rates, vendorName, processType) {
    const key = String(vendorName || '').trim().toLowerCase();
    if (!key) return null;
    return (rates || []).find(
        (r) => String(r.vendorWorker || '').trim().toLowerCase() === key
            && String(r.processName || '') === String(processType || ''),
    ) || (rates || []).find(
        (r) => String(r.vendorWorker || '').trim().toLowerCase() === key,
    ) || null;
}

export function buildJobWorkerVendorList(rates = [], suppliers = []) {
    const seen = new Set();
    const out = [];
    const add = (name) => {
        const n = String(name || '').trim();
        if (!n) return;
        const k = n.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ vendorWorker: n });
    };
    (rates || []).forEach((r) => add(r.vendorWorker));
    const supplierRows = Array.isArray(suppliers) ? suppliers : (suppliers?.suppliers || []);
    supplierRows.forEach((s) => add(s.supplierName));
    return out.sort((a, b) => a.vendorWorker.localeCompare(b.vendorWorker));
}
