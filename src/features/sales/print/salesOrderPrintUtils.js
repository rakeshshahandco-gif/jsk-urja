/** Shared Sales Order print helpers (layout only — no GST/stock/accounting changes). */

export const SO_ITEMS_PER_PAGE_FIRST = 7;
export const SO_ITEMS_PER_PAGE_OTHERS = 15;

export function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB');
}

export function fmtMoney(n) {
    return `₹ ${Number(n || 0).toFixed(2)}`;
}

export function paginateSoItems(items = []) {
    const list = Array.isArray(items) ? items : [];
    const pages = [];
    if (list.length <= SO_ITEMS_PER_PAGE_FIRST) {
        pages.push(list);
        return pages;
    }
    pages.push(list.slice(0, SO_ITEMS_PER_PAGE_FIRST));
    let remaining = list.slice(SO_ITEMS_PER_PAGE_FIRST);
    while (remaining.length > 0) {
        pages.push(remaining.slice(0, SO_ITEMS_PER_PAGE_OTHERS));
        remaining = remaining.slice(SO_ITEMS_PER_PAGE_OTHERS);
    }
    return pages;
}

export function soItemSrNo(pageIdx, rowIdx) {
    if (pageIdx === 0) return rowIdx + 1;
    return SO_ITEMS_PER_PAGE_FIRST + (pageIdx - 1) * SO_ITEMS_PER_PAGE_OTHERS + rowIdx + 1;
}

export function cleanCustomerName(so) {
    if (!so?.customerName) return '';
    if (!so.customerGstin) return so.customerName;
    return so.customerName.replace(new RegExp(`\\s*\\(${so.customerGstin}\\)$`), '');
}

export function resolveGstFlags(so) {
    const gstApplicable = so?.gstApplicable !== false;
    const isIGST = so?.gstType === 'IGST';
    const gstRate = Number(so?.items?.[0]?.gstRate || so?.items?.[0]?.taxPercent || 18);
    return { gstApplicable, isIGST, gstRate };
}
