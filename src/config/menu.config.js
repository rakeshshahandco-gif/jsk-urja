import { PATHS } from '../routes/paths';

export const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer',
};

export const menuConfig = [

    {
        id: 'customers',
        title: 'Customers',
        icon: 'PeopleIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
        children: [
            {
                id: 'add-customer',
                title: 'Add Customer',
                path: '/customers/add',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'add_customer',
            },
            {
                id: 'customer-list',
                title: 'All Customers',
                path: PATHS.CUSTOMERS.LIST,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
                permission: 'view_customers',
            },
            {
                id: 'reminder-tasks',
                title: 'Reminder Tasks',
                path: '/reminders',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_reminders',
            },
            {
                id: 'follow-up-tracker',
                title: 'Follow-up Dashboard',
                path: '/followups',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
        ],
    },
    {
        id: 'reports',
        title: 'Reports',
        icon: 'BarChartIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER],
        children: [
            {
                id: 'report-sales',
                title: 'Sales Report',
                path: PATHS.REPORTS.SALES,
            },
            {
                id: 'report-performance',
                title: 'Performance',
                path: PATHS.REPORTS.PERFORMANCE,
                roles: [ROLES.ADMIN], // Restricted to Admin
            },
            {
                id: 'report-customer-master',
                title: 'Customer Master',
                path: PATHS.REPORTS.CUSTOMER_MASTER,
                roles: [ROLES.ADMIN, ROLES.MANAGER],
            },
            {
                id: 'report-followup-tracker',
                title: 'Follow-up Tracker Report',
                path: '/reports/followups',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
            },
            {
                id: 'report-open-reminders',
                title: 'Open Reminders',
                path: '/reports/open-reminders',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
            },
            {
                id: 'report-dashboard-followup',
                title: 'Follow-up Dashboard',
                path: '/reports/followup-dashboard',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
            },
            {
                id: 'report-followup-task',
                title: 'Follow-up Task Report',
                path: '/reports/followup-task-report',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
            },
        ],
    },
    {
        id: 'admin',
        title: 'Admin',
        icon: 'SettingsIcon',
        roles: [ROLES.ADMIN], // Admin only
        children: [
            {
                id: 'user-management',
                title: 'User Management',
                path: '/admin/users',
                roles: [ROLES.ADMIN],
            },
        ],
    },
];
