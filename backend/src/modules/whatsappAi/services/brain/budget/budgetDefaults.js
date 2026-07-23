/**
 * Phase 1C.5 — Budget defaults (company-isolated in-memory counters for dry-run).
 */

export const BUDGET_ENGINE_VERSION = 'budget_engine_v1';

export const DEFAULT_BUDGET_LIMITS = Object.freeze({
    dailyRequestLimit: 200,
    monthlyRequestLimit: 4000,
    dailyTokenLimit: 200000,
    monthlyTokenLimit: 4000000,
    perMessageTokenLimit: 4000,
    hardStop: true,
});

export default DEFAULT_BUDGET_LIMITS;
