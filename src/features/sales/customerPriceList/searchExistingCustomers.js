import { getCustomers, searchCustomers } from '@/services/customerApi';

const idOf = (c) => String(c?.id || c?._id || '');

const normalize = (c) => {
    const primary = c.contactPersons?.find((p) => p.isPrimary) || c.contactPersons?.[0] || {};
    return {
        id: idOf(c),
        name: c.name || c.company || c.customerName || '',
        company: c.company || '',
        customerName: c.customerName || '',
        customerCode: c.customerCode || '',
        phone: c.phone || primary.mobile || '',
        email: c.email || c.companyEmail || primary.email || '',
        gstin: c.gstin || c.gstNumber || '',
        city: c.city || '',
        state: c.state || '',
        billingAddress: c.billingAddress || c.address || '',
        customerType: c.customerType || '',
    };
};

/**
 * Reuses Sales Order sources:
 * - GET /customers (list + contains search, max 100)
 * - GET /customers/search (same as Sales Order typeahead, 2+ chars)
 */
export async function searchExistingCustomers(q) {
    const term = String(q || '').trim();
    const map = new Map();
    const add = (c) => {
        const row = normalize(c);
        if (!row.id || row.id === 'undefined') return;
        map.set(row.id, { ...map.get(row.id), ...row });
    };

    try {
        const page = await getCustomers({
            search: term || undefined,
            limit: 50,
            page: 1,
            sortBy: 'company:asc',
        });
        (page?.results || []).forEach(add);
    } catch {
        /* list endpoint may 400 on invalid query — search still runs */
    }

    if (term.length >= 2) {
        try {
            const hits = await searchCustomers(term);
            (Array.isArray(hits) ? hits : []).forEach(add);
        } catch {
            /* keep list results */
        }
    }

    return [...map.values()];
}
