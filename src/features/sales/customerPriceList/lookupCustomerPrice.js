import { suggestCustomerPrice } from '@/services/customerPriceListApi';

export async function lookupCustomerPrice({ customerId, itemId, qty, date, currency }) {
    if (!customerId || !itemId) return null;
    try {
        return await suggestCustomerPrice({
            customerId,
            itemId,
            qty: qty || 0,
            date: date || undefined,
            currency: currency || 'INR',
        });
    } catch {
        return null;
    }
}
