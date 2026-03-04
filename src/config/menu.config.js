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
                id: 'customer-list',
                title: 'Customer Master',
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
        id: 'tasks',
        title: 'Task Management',
        icon: 'AssignmentIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'view_tasks',
        children: [
            {
                id: 'task-create',
                title: 'Create Task',
                path: '/tasks/create',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'add_task',
            },
            {
                id: 'task-list',
                title: 'Manage Tasks',
                path: '/tasks/list',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_tasks',
            },
            {
                id: 'task-groups',
                title: 'Task Groups',
                path: PATHS.TASKS.GROUPS,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_groups',
            },
        ],
    },
    {
        id: 'reports',
        title: 'Reports',
        icon: 'BarChartIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER],
        permission: 'view_reports',
        children: [
            {
                id: 'report-customer-master',
                title: 'Customer Master',
                path: PATHS.REPORTS.CUSTOMER_MASTER,
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'view_reports',
            },
            {
                id: 'report-followup-tracker',
                title: 'Follow-up Tracker Report',
                path: '/reports/followups',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'view_reports',
            },
            {
                id: 'report-open-reminders',
                title: 'Open Reminders',
                path: '/reports/open-reminders',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
                // Open Reminders should just require general view reminders permission
                permission: 'view_reminders',
            },
            {
                id: 'report-dashboard-followup',
                title: 'Follow-up Dashboard',
                path: '/reports/followup-dashboard',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'view_reports',
            },
            {
                id: 'report-followup-task',
                title: 'Follow-up Task Report',
                path: '/reports/followup-task-report',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'view_reports',
            },
            {
                id: 'report-task-reminders',
                title: 'Task Reminder Report',
                path: '/reports/task-reminders',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_reports',
            },
        ],
    },
    {
        id: 'inventory',
        title: 'Inventory',
        icon: 'InventoryIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'view_inventory',
        children: [
            {
                id: 'item-master',
                title: 'Item Master',
                path: '/inventory/items',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_inventory',
            },
            {
                id: 'item-type-master',
                title: 'Item Types',
                path: '/inventory/item-types',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'view_inventory',
            },
            {
                id: 'item-group-master',
                title: 'Item Groups',
                path: '/inventory/item-groups',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'view_inventory',
            },
            {
                id: 'bom-master',
                title: 'Bill of Materials (BOM)',
                path: PATHS.INVENTORY.BOM.ROOT,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_inventory',
            },
        ],
    },
    {
        id: 'production',
        title: 'Production',
        icon: 'FactoryIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'view_production',
        children: [
            {
                id: 'prod-dashboard',
                title: 'Dashboard',
                path: PATHS.PRODUCTION.DASHBOARD,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_production',
            },
            {
                id: 'work-orders',
                title: 'Work Orders',
                path: PATHS.PRODUCTION.WORK_ORDERS,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'view_production',
            },
        ],
    },
    {
        id: 'purchase',
        title: 'Purchase',
        icon: 'ShoppingCartIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        children: [
            {
                id: 'suppliers',
                title: 'Suppliers',
                path: PATHS.PURCHASE.SUPPLIERS,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
            {
                id: 'purchase-orders',
                title: 'Purchase Orders',
                path: PATHS.PURCHASE.ORDERS,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
            {
                id: 'grn',
                title: 'Goods Receipt (GRN)',
                path: PATHS.PURCHASE.GRN,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
            {
                id: 'purchase-invoices',
                title: 'Purchase Invoices',
                path: PATHS.PURCHASE.INVOICES,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
        ],
    },
    {
        id: 'sales',
        title: 'Sales',
        icon: 'ShoppingBagIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        children: [
            {
                id: 'sales-orders',
                title: 'Sales Orders',
                path: PATHS.SALES.ORDERS,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
            {
                id: 'sales-invoices',
                title: 'Tax Invoices (GST)',
                path: PATHS.SALES.INVOICES,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
            {
                id: 'invoice-series',
                title: 'Invoice Series',
                path: PATHS.SALES.INVOICE_SERIES,
                roles: [ROLES.ADMIN],
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

