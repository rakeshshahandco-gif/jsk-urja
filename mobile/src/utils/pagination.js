/** CRM API max page size (backend validation). */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 50;
export const DEFAULT_PAGE = 1;

export function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export function clampListParams(params = {}) {
  const out = { ...params };
  if (out.limit !== undefined) out.limit = clampLimit(out.limit);
  if (out.pageSize !== undefined) out.pageSize = clampLimit(out.pageSize);
  if (out.perPage !== undefined) out.perPage = clampLimit(out.perPage);
  if (out.page !== undefined) {
    const p = Number(out.page);
    out.page = Number.isFinite(p) && p >= 1 ? Math.floor(p) : DEFAULT_PAGE;
  }
  return out;
}

export function getTotalPages(payload) {
  if (!payload || typeof payload !== 'object') return 1;
  const tp = payload.totalPages ?? payload.data?.totalPages;
  if (Number.isFinite(tp) && tp >= 1) return tp;
  const total = payload.totalResults ?? payload.total ?? payload.data?.totalResults ?? payload.data?.total;
  const limit = payload.limit ?? payload.data?.limit ?? DEFAULT_LIMIT;
  if (Number.isFinite(total) && total >= 0) {
    return Math.max(1, Math.ceil(total / clampLimit(limit)));
  }
  return 1;
}
