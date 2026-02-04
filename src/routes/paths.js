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
        SALES: '/reports/sales',
        PERFORMANCE: '/reports/performance',
        CUSTOMER_MASTER: '/reports/customer-master',
    },
    AUTH: {
        LOGIN: '/auth/login',
        REGISTER: '/auth/register',
    },
};
