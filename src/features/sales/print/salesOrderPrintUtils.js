/** Shared Sales Order print helpers (layout only — no GST/stock/accounting changes). */

export const SO_ITEMS_PER_PAGE_FIRST = 7;
export const SO_ITEMS_PER_PAGE_OTHERS = 15;

/** A4 portrait — fixed page box so browsers never shrink-to-fit tall content. */
export const SO_PRINT_PAGE_WIDTH_MM = 210;
export const SO_PRINT_PAGE_HEIGHT_MM = 297;

/** Approx table header + body row heights for block-mode pagination (mm). */
export const SO_BLOCK_TABLE_HEADER_MM = 8;
export const SO_BLOCK_TABLE_ROW_MM = 7;

/** Blocks only on first page of designer layout. */
export const SO_BLOCK_FIRST_PAGE_IDS = [
    'logo',
    'companyDetails',
    'documentTitle',
    'documentNumber',
    'customerDetails',
    'documentDetails',
];

/** Blocks only on last page (totals / footer). */
export const SO_BLOCK_LAST_PAGE_IDS = [
    'totalsBox',
    'remarks',
    'terms',
    'bankDetails',
    'signature',
];

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

/**
 * Paginate line items to fit the designer itemTable height (no single-page overflow / shrink).
 * First page uses saved table height; continuation pages use a taller band under a compact header.
 */
export function paginateBlockSoItems(items = [], printFormat = null) {
    const list = Array.isArray(items) ? items : [];
    const tableH = Number(printFormat?.layout?.blocks?.itemTable?.height) || 100;
    const margins = printFormat?.margins || {};
    const marginTop = Number(margins.top ?? 10) || 10;
    const marginBottom = Number(margins.bottom ?? 10) || 10;
    const contentH = SO_PRINT_PAGE_HEIGHT_MM - marginTop - marginBottom;

    const rowsFirst = Math.max(
        1,
        Math.floor(Math.max(tableH - SO_BLOCK_TABLE_HEADER_MM, SO_BLOCK_TABLE_ROW_MM) / SO_BLOCK_TABLE_ROW_MM),
    );
    // Continuation: leave ~28mm for compact header strip
    const contTableH = Math.max(tableH, contentH - 28);
    const rowsOther = Math.max(
        1,
        Math.floor(Math.max(contTableH - SO_BLOCK_TABLE_HEADER_MM, SO_BLOCK_TABLE_ROW_MM) / SO_BLOCK_TABLE_ROW_MM),
    );

    if (list.length === 0) return [[]];
    if (list.length <= rowsFirst) return [list];

    const pages = [list.slice(0, rowsFirst)];
    let remaining = list.slice(rowsFirst);
    while (remaining.length > 0) {
        pages.push(remaining.slice(0, rowsOther));
        remaining = remaining.slice(rowsOther);
    }
    return pages;
}

export function soItemSrStart(pages, pageIdx) {
    let start = 1;
    for (let i = 0; i < pageIdx; i += 1) {
        start += (pages[i] || []).length;
    }
    return start;
}

export function soItemSrNo(pageIdx, rowIdx, pages = null) {
    if (pages && Array.isArray(pages)) {
        return soItemSrStart(pages, pageIdx) + rowIdx;
    }
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
