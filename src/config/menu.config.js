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
        id: 'groups',
        title: 'Groups & Projects',
        icon: 'GroupWorkIcon',
        path: PATHS.GROUPS.ROOT,
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
    },
    {
        id: 'tasks',
        title: 'Task Management',
        icon: 'AssignmentIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        children: [
            {
                id: 'task-create',
                title: 'Create Task',
                path: '/tasks/create',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
            {
                id: 'task-list',
                title: 'Manage Tasks',
                path: '/tasks/list',
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
            {
                id: 'report-task-reminders',
                title: 'Task Reminder Report',
                path: '/reports/task-reminders',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
        ],
    },
    {
        id: 'inventory',
        title: 'Inventory',
        icon: 'InventoryIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        children: [
            {
                id: 'item-master',
                title: 'Item Master',
                path: '/inventory/items',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
            },
            {
                id: 'item-type-master',
                title: 'Item Types',
                path: '/inventory/item-types',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
            },
            {
                id: 'item-group-master',
                title: 'Item Groups',
                path: '/inventory/item-groups',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
            },
            {
                id: 'bom-master',
                title: 'Bill of Materials (BOM)',
                path: PATHS.INVENTORY.BOM.ROOT,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
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
