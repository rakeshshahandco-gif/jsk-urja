import React from 'react';
import ExpandableModuleHome from '@/features/dashboard/components/ExpandableModuleHome';
import {
    FolderTree,
    BookOpen,
    CalendarRange,
    ListOrdered,
    Building2,
    PieChart,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';

const SESSION_SECTION_KEY = 'jsk.accountMasterHome.expandedSection';

const SECTIONS = [
    {
        id: 'group-master',
        title: 'Group Master',
        description: 'Create and maintain account groups.',
        icon: FolderTree,
        expandedHeading: 'Group Master',
        moduleCode: 'accounts',
        tools: [
            {
                id: 'group-master',
                title: 'Group Master',
                description: 'Open group master list and forms.',
                path: PATHS.ACCOUNT_MASTER.GROUP_MASTER,
                icon: FolderTree,
                permission: 'accounts.group_master.view',
                moduleCode: 'accounts',
            },
        ],
    },
    {
        id: 'ledger-master',
        title: 'Ledger Master',
        description: 'Create and maintain ledgers.',
        icon: BookOpen,
        expandedHeading: 'Ledger Master',
        moduleCode: 'accounts',
        tools: [
            {
                id: 'ledger-master',
                title: 'Ledger Master',
                description: 'Open ledger master list and forms.',
                path: PATHS.ACCOUNT_MASTER.LEDGER_MASTER,
                icon: BookOpen,
                permission: 'accounts.ledger_master.view',
                moduleCode: 'accounts',
            },
        ],
    },
    {
        id: 'financial-year-master',
        title: 'Financial Year Master',
        description: 'Manage financial year setup.',
        icon: CalendarRange,
        expandedHeading: 'Financial Year Master',
        moduleCode: 'accounts',
        tools: [
            {
                id: 'financial-year-master',
                title: 'Financial Year Master',
                description: 'Open financial year master.',
                path: PATHS.ACCOUNT_MASTER.FINANCIAL_YEAR,
                icon: CalendarRange,
                permission: 'accounts.financial_year.view',
                moduleCode: 'accounts',
            },
        ],
    },
    {
        id: 'series-master',
        title: 'Series Master',
        description: 'Voucher series and numbering setup.',
        icon: ListOrdered,
        expandedHeading: 'Series Master',
        moduleCode: 'accounts',
        tools: [
            {
                id: 'voucher-type-master',
                title: 'Series Master',
                description: 'Open series / voucher type master.',
                path: PATHS.ACCOUNT_MASTER.SERIES_MASTER,
                icon: ListOrdered,
                permission: 'accounts.vouchers.view',
                moduleCode: 'accounts',
            },
        ],
    },
    {
        id: 'cost-centers',
        title: 'Cost / Profit Centres',
        description: 'Cost and profit centre masters.',
        icon: Building2,
        expandedHeading: 'Cost / Profit Centres',
        moduleCode: 'accounts',
        tools: [
            {
                id: 'cost-centers',
                title: 'Cost / Profit Centres',
                description: 'Open cost centre master.',
                path: PATHS.COST_CENTERS.LIST,
                icon: Building2,
                permission: 'accounts.vouchers.view',
                moduleCode: 'accounts',
            },
        ],
    },
    {
        id: 'budgets',
        title: 'Budget Master',
        description: 'Budget setup and maintenance.',
        icon: PieChart,
        expandedHeading: 'Budget Master',
        moduleCode: 'accounts',
        tools: [
            {
                id: 'budgets',
                title: 'Budget Master',
                description: 'Open budget master.',
                path: PATHS.BUDGETS.LIST,
                icon: PieChart,
                permission: 'accounts.vouchers.view',
                moduleCode: 'accounts',
            },
        ],
    },
];

export default function AccountMasterHomePage() {
    return (
        <ExpandableModuleHome
            title="Account Master - Home"
            subtitle="Manage group, ledger, financial year, series and related masters."
            sections={SECTIONS}
            sessionKey={SESSION_SECTION_KEY}
            dataComponent="account-master-home"
        />
    );
}
