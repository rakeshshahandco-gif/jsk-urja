export const PATHS = {
    ROOT: '/',
    DASHBOARD: '/dashboard',
    CUSTOMERS: {
        ROOT: '/customers',
        LIST: '/customers/list',
        ADD: '/customers/add',
        DETAILS: (id) => `/customers/${id}`,
    },
    REMINDERS: {
        ROOT: '/reminders',
    },
    REPORTS: {
        ROOT: '/reports',
        CUSTOMER_MASTER: '/reports/customer-master',
    },
    AUTH: {
        LOGIN: '/auth/login',
        REGISTER: '/auth/register',
    },
    GROUPS: {
        ROOT: '/groups',
        DETAILS: (id) => `/groups/${id}`,
    },
    INVENTORY: {
        ITEMS: '/inventory/items',
        NEW_ITEM: '/inventory/items/new',
        EDIT_ITEM: (id) => `/inventory/items/${id}`,
        ITEM_TYPES: '/inventory/item-types',
        ITEM_GROUPS: '/inventory/item-groups',
        BOM: {
            ROOT: '/inventory/bom',
            NEW: '/inventory/bom/new',
            EDIT: (id) => `/inventory/bom/edit/${id}`,
        },
    },
    PRODUCTION: {
        DASHBOARD: '/production',
        WORK_ORDERS: '/production/work-orders',
        NEW_WO: '/production/work-orders/new',
        WO_DETAIL: (id) => `/production/work-orders/${id}`,
    },
};
