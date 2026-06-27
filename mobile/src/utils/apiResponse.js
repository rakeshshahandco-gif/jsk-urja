/**
 * Normalize list payloads from CRM API (plain JSON or ApiResponse wrapper).
 */
export function extractList(payload, preferredKeys = []) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const keys = [
    ...preferredKeys,
    'results',
    'invoices',
    'salesOrders',
    'orders',
    'docs',
    'customers',
    'tasks',
    'data',
  ];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  const nested = payload.data;
  if (Array.isArray(nested)) return nested;
  if (nested && typeof nested === 'object') {
    for (const key of keys) {
      if (Array.isArray(nested[key])) return nested[key];
    }
  }

  return [];
}
