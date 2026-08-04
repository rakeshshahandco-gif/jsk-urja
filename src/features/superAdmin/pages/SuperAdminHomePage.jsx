import React from 'react';
import ExpandableModuleHome from '@/features/dashboard/components/ExpandableModuleHome';
import {
    LayoutDashboard,
    Building2,
    Layers,
    Wrench,
    ScrollText,
    CreditCard,
    Factory,
    Boxes,
    Rocket,
    SlidersHorizontal,
    GitBranch,
    Printer,
    Activity,
    DatabaseBackup,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';

const SESSION_SECTION_KEY = 'jsk.superAdminHome.expandedSection';

/** Platform tools are not gated by tenant module allocation. */
const platformTool = (tool) => ({ ...tool, skipModuleGuard: true });

/**
 * Platform Super Admin Home only — company Admin tools stay on Admin Home.
 * Routes remain ProtectedPlatformRoute; this page does not grant access by itself.
 */
const SECTIONS = [
    {
        id: 'saas-admin',
        title: 'SaaS Admin',
        description: 'Platform SaaS dashboard, companies, subscriptions and activity logs.',
        icon: LayoutDashboard,
        expandedHeading: 'SaaS Admin Tools',
        tools: [
            platformTool({
                id: 'saas-dashboard',
                title: 'SaaS Dashboard',
                description: 'Platform overview and SaaS metrics.',
                path: PATHS.SAAS_ADMIN.DASHBOARD,
                icon: LayoutDashboard,
            }),
            platformTool({
                id: 'saas-companies',
                title: 'Companies & Subscriptions',
                description: 'Manage tenant companies and subscriptions.',
                path: PATHS.SAAS_ADMIN.COMPANIES,
                icon: Building2,
            }),
            platformTool({
                id: 'saas-subscriptions',
                title: 'Subscriptions',
                description: 'Review and manage subscription plans.',
                path: PATHS.SAAS_ADMIN.SUBSCRIPTIONS,
                icon: CreditCard,
            }),
            platformTool({
                id: 'saas-activity',
                title: 'Activity Logs',
                description: 'Platform activity and administrative history.',
                path: PATHS.SAAS_ADMIN.ACTIVITY_LOGS,
                icon: ScrollText,
            }),
        ],
    },
    {
        id: 'platform-setup',
        title: 'Platform Setup',
        description: 'Industry templates, module allocation, deployment and platform defaults.',
        icon: Layers,
        expandedHeading: 'Platform Setup Tools',
        tools: [
            platformTool({
                id: 'industry-template-master',
                title: 'Industry Template Master',
                description: 'Define industry templates for new companies.',
                path: PATHS.SETTINGS.INDUSTRY_TEMPLATES,
                icon: Factory,
                permission: 'admin',
            }),
            platformTool({
                id: 'company-module-allocation',
                title: 'Company Module Allocation',
                description: 'Allocate modules to companies.',
                path: PATHS.SETTINGS.COMPANY_MODULE_ALLOCATION,
                icon: Boxes,
                permission: 'admin',
            }),
            platformTool({
                id: 'industry-deployment-manager',
                title: 'Industry Deployment Manager',
                description: 'Deploy industry configurations to tenants.',
                path: PATHS.SETTINGS.INDUSTRY_DEPLOYMENT_MANAGER,
                icon: Rocket,
                permission: 'admin',
            }),
            platformTool({
                id: 'platform-feature-defaults',
                title: 'Platform Default Settings',
                description: 'Platform-wide feature defaults.',
                path: PATHS.SETTINGS.PLATFORM_FEATURE_DEFAULTS,
                icon: SlidersHorizontal,
                permission: 'admin',
            }),
            platformTool({
                id: 'workflow-master',
                title: 'Workflow Master',
                description: 'Platform workflow definitions.',
                path: PATHS.SETTINGS.WORKFLOW_MASTER,
                icon: GitBranch,
                permission: 'admin',
            }),
            platformTool({
                id: 'print-format-version-manager',
                title: 'Print Format Version Manager',
                description: 'Manage print format versions across tenants.',
                path: PATHS.SETTINGS.PRINT_FORMAT_VERSION_MANAGER,
                icon: Printer,
                permission: 'admin',
            }),
        ],
    },
    {
        id: 'tenant-management',
        title: 'Tenant Management',
        description: 'Manage all companies on the platform.',
        icon: Building2,
        expandedHeading: 'Tenant Management Tools',
        tools: [
            platformTool({
                id: 'companies-list',
                title: 'All Companies (Platform)',
                description: 'Browse and manage all tenant companies.',
                path: PATHS.SETTINGS.COMPANIES_LIST,
                icon: Building2,
                permission: 'admin.company_profile.view',
            }),
        ],
    },
    {
        id: 'system',
        title: 'System',
        description: 'Diagnostics, backup and platform maintenance utilities.',
        icon: Wrench,
        expandedHeading: 'System Tools',
        tools: [
            platformTool({
                id: 'system-diagnostic',
                title: 'System Master Diagnostic',
                description: 'Run system diagnostics and health checks.',
                path: '/admin/diagnostics',
                icon: Activity,
                permission: 'admin',
            }),
            platformTool({
                id: 'backup-restore',
                title: 'Backup & Restore',
                description: 'Platform backup and restore utilities.',
                path: '/admin/backups',
                icon: DatabaseBackup,
                permission: 'admin',
            }),
        ],
    },
];

export default function SuperAdminHomePage() {
    return (
        <ExpandableModuleHome
            title="Super Admin - Home"
            subtitle="Manage SaaS admin, platform setup, tenants and system-wide administration tools."
            sections={SECTIONS}
            sessionKey={SESSION_SECTION_KEY}
            dataComponent="super-admin-home"
        />
    );
}
