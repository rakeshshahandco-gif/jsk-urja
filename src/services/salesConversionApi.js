/**
 * salesConversionApi.js
 * 
 * Frontend API service for the Sales Conversion Analysis Dashboard.
 * All 8 endpoints map to the new /v1/sales-conversion/* backend routes.
 */
import api from './api';

const BASE = '/sales-conversion';

const salesConversionApi = {
    /**
     * Full Lead → Sample → Order → Invoice → Repeat → Payment funnel
     */
    getFunnel: (params = {}) =>
        api.get(`${BASE}/funnel`, { params }).then(r => r.data),

    /**
     * Sample-to-order conversion analysis with salesperson & source breakdown
     */
    getSampleConversion: (params = {}) =>
        api.get(`${BASE}/sample-conversion`, { params }).then(r => r.data),

    /**
     * Paginated list of customers who received samples but did NOT convert
     */
    getNonConvertedSamples: (params = {}) =>
        api.get(`${BASE}/non-converted-samples`, { params }).then(r => r.data),

    /**
     * Repeat business / customer retention analysis
     */
    getRepeatBusiness: (params = {}) =>
        api.get(`${BASE}/repeat-business`, { params }).then(r => r.data),

    /**
     * Item-wise sales analysis (qty, value, customer count, sample link)
     */
    getItemWiseSales: (params = {}) =>
        api.get(`${BASE}/item-wise`, { params }).then(r => r.data),

    /**
     * Paginated customer-wise sales analysis with value classification
     */
    getCustomerWiseSales: (params = {}) =>
        api.get(`${BASE}/customer-wise`, { params }).then(r => r.data),

    /**
     * Salesperson conversion matrix (leads → samples → orders → invoices → value)
     */
    getSalespersonMatrix: (params = {}) =>
        api.get(`${BASE}/salesperson-matrix`, { params }).then(r => r.data),

    /**
     * Payment received analysis (mode, timing, outstanding, behavior)
     */
    getPaymentAnalysis: (params = {}) =>
        api.get(`${BASE}/payment-analysis`, { params }).then(r => r.data),
};

export default salesConversionApi;
