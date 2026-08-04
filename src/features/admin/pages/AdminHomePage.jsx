import React from 'react';
import ExpandableModuleHome from '@/features/dashboard/components/ExpandableModuleHome';
import {
    Building2,
    Shield,
    SlidersHorizontal,
    Wrench,
    Printer,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';

const SESSION_SECTION_KEY = 'jsk.adminHome.expandedSection';

/**
 * Company-level Admin Home only.
 * Super Admin / Platform Admin tools stay under Super Admin — not listed here.
 */
const SECTIONS = [
    {
        id: 'company-settings',
        title: 'Company Settings',
        description: 'Manage company profile, branding, statutory information and document settings.',
        icon: Building2,
        expandedHeading: 'Company Settings Tools',
        moduleCode: 'admin',
        tools: [
            {
                id: 'company-profile',
                title: 'Company Profile',
                description: 'Company name, branding and statutory profile.',
                path: PATHS.SETTINGS.COMPANY_PROFILE,
                icon: Building2,
                permission: 'admin.company_profile.view',
                moduleCode: 'admin',
            },
        ],
    },
    {
        id: 'user-security',
        title: 'User & Security',
        description: 'Manage users, roles, permissions, access and security controls.',
        icon: Shield,
        expandedHeading: 'User & Security Tools',
        moduleCode: 'admin',
        tools: [
            {
                id: 'user-management',
                title: 'User Management',
                description: 'Manage users, roles and access.',
                path: '/admin/users',
                icon: Shield,
                permission: 'admin.user_management.view',
                moduleCode: 'admin',
            },
        ],
    },
    {
        id: 'configuration',
        title: 'Configuration',
        description: 'Manage financial years, series, masters, workflow and system configuration.',
        icon: SlidersHorizontal,
        expandedHeading: 'Configuration Tools',
        moduleCode: 'admin',
        tools: [
            {
                id: 'feature-compliance-settings',
                title: 'Feature Configuration Engine',
                description: 'Company feature and compliance configuration.',
                path: PATHS.SETTINGS.FEATURE_COMPLIANCE,
                icon: SlidersHorizontal,
                permission: 'admin',
                moduleCode: 'admin',
            },
        ],
    },
    {
        id: 'utilities',
        title: 'Utilities',
        description: 'Access imports, data tools, diagnostics and approved maintenance utilities.',
        icon: Wrench,
        expandedHeading: 'Utility Tools',
        moduleCode: 'admin',
        tools: [
            {
                id: 'import-center',
                title: 'Import Center',
                description: 'Import masters and transactional data.',
                path: PATHS.SETTINGS.IMPORT_CENTER,
                icon: Wrench,
                permission: 'import_utility.import_utility.view',
                moduleCode: 'admin',
            },
            {
                id: 'ledger-linking',
                title: 'Ledger Linking Utility',
                description: 'Link and reconcile ledger mappings.',
                path: '/admin/ledger-linking',
                icon: Wrench,
                permission: 'admin.ledger_linking.view',
                moduleCode: 'admin',
            },
        ],
    },
    {
        id: 'print-document',
        title: 'Print & Document Settings',
        description: 'Manage print formats, document logo and layout settings.',
        icon: Printer,
        expandedHeading: 'Print & Document Tools',
        moduleCode: 'admin',
        tools: [
            {
                id: 'print-format-designer',
                title: 'Print Format Designer',
                description: 'Design and edit document print layouts.',
                path: PATHS.SETTINGS.PRINT_FORMAT_DESIGNER,
                icon: Printer,
                permission: 'admin.print_format_designer.view',
                moduleCode: 'admin',
            },
        ],
    },
];

export default function AdminHomePage() {
    return (
        <ExpandableModuleHome
            title="Admin - Home"
            subtitle="Manage company settings, users, security, configuration and administration tools."
            sections={SECTIONS}
            sessionKey={SESSION_SECTION_KEY}
            dataComponent="admin-home"
        />
    );
}
