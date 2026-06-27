import Customer from '../models/customer.model.js';
import Lead from '../models/lead.model.js';
import { listCustomerTypes } from './customerTypeMaster.service.js';
import { WHATSAPP_BULK_DEFAULT_BUSINESS_CATEGORIES } from '../constants/whatsappBulk.constants.js';

function uniqueSorted(names = []) {
    const seen = new Set();
    const out = [];
    for (const raw of names) {
        const name = String(raw || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Business categories for WhatsApp Bulk recipient filter.
 * Merges defaults, Customer Type Master, and distinct values from customers/leads.
 */
export async function getBusinessCategoryOptions() {
    const [masterRows, customerTypes, customerCategories, leadCategories] = await Promise.all([
        listCustomerTypes().catch(() => []),
        Customer.distinct('customerType').catch(() => []),
        Customer.distinct('businessCategory').catch(() => []),
        Lead.distinct('businessCategory').catch(() => []),
    ]);

    const merged = uniqueSorted([
        ...WHATSAPP_BULK_DEFAULT_BUSINESS_CATEGORIES,
        ...masterRows.map((r) => r.name),
        ...customerTypes,
        ...customerCategories,
        ...leadCategories,
    ]);

    return ['All', ...merged];
}

export function applyBusinessCategoryFilter(query, category) {
    const value = String(category || '').trim();
    if (!value || value.toLowerCase() === 'all') return;
    query.$or = [
        { customerType: value },
        { businessCategory: value },
    ];
}

export function applyLeadBusinessCategoryFilter(query, category) {
    const value = String(category || '').trim();
    if (!value || value.toLowerCase() === 'all') return;
    query.businessCategory = value;
}
