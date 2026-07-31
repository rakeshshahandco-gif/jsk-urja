export const ENGINE_VERSION = 'crm-enrichment-v1';

export const SAFE_LEAD_FIELDS = Object.freeze([
    'customerName', 'customerEmail', 'customerMobile', 'businessCategory', 'notes', 'priority', 'source',
]);

export const SAFE_CUSTOMER_FIELDS = Object.freeze([
    'customerName', 'company', 'tradeName', 'companyEmail', 'website', 'address', 'city', 'state', 'pincode', 'country', 'notes',
]);

export const SAFE_SUPPLIER_FIELDS = Object.freeze([
    'supplierName', 'contactPerson', 'phone', 'email', 'address', 'city', 'state', 'pincode', 'country', 'remarks',
]);

export const CRM_CREATE_LEAD_PERM = 'crm.leads.add';
export const CRM_EDIT_LEAD_PERM = 'crm.leads.edit';
export const CRM_EDIT_CUSTOMER_PERM = 'customers.customer_master.edit';
export const CRM_EDIT_SUPPLIER_PERM = 'purchase.suppliers.edit';
