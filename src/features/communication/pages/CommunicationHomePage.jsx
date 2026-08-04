import React from 'react';
import ExpandableModuleHome from '@/features/dashboard/components/ExpandableModuleHome';
import {
    Mail,
    Megaphone,
    FileText,
    History,
    Ban,
    Settings,
    ScrollText,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';

const SESSION_SECTION_KEY = 'jsk.communicationHome.expandedSection';

const SECTIONS = [
    {
        id: 'email-communication',
        title: 'Email Communication',
        description: 'Compose and manage individual business email communication.',
        icon: Mail,
        expandedHeading: 'Email Communication Tools',
        featurePath: 'communication.enableEmail',
        moduleCode: 'email',
        tools: [
            {
                id: 'communication-email-settings',
                title: 'Platform Email Settings',
                description: 'Configure sender accounts and SMTP / platform email.',
                path: PATHS.SETTINGS.EMAIL,
                icon: Settings,
                permission: 'email.settings.view',
                featurePath: 'communication.enableEmail',
                moduleCode: 'email',
            },
            {
                id: 'communication-history',
                title: 'Communication History',
                description: 'View sent, received and recorded email communication.',
                path: PATHS.SETTINGS.COMMUNICATION_HISTORY,
                icon: History,
                permission: 'email.communication_history.view',
                featurePath: 'communication.enableEmail',
                moduleCode: 'email',
            },
        ],
    },
    {
        id: 'bulk-email',
        title: 'Bulk Email Messaging',
        description: 'Create bulk email campaigns, recipient lists and delivery activity.',
        icon: Megaphone,
        expandedHeading: 'Bulk Email Tools',
        featurePath: 'communication.enableEmailBulk',
        moduleCode: 'email_bulk',
        tools: [
            {
                id: 'communication-email-bulk-campaigns',
                title: 'Email Bulk Message Utility',
                description: 'Create and manage bulk email campaigns.',
                path: PATHS.SETTINGS.EMAIL_BULK.CAMPAIGNS,
                icon: Megaphone,
                permission: 'email_bulk.campaigns.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
            {
                id: 'communication-email-bulk-templates',
                title: 'Templates',
                description: 'Reusable email templates for campaigns.',
                path: PATHS.SETTINGS.EMAIL_BULK.TEMPLATES,
                icon: FileText,
                permission: 'email_bulk.templates.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
            {
                id: 'communication-email-bulk-history',
                title: 'Campaign History',
                description: 'Past campaigns, delivery results and failures.',
                path: PATHS.SETTINGS.EMAIL_BULK.HISTORY,
                icon: ScrollText,
                permission: 'email_bulk.campaigns.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
            {
                id: 'communication-email-bulk-blacklist',
                title: 'Blacklist',
                description: 'Blocked recipients and opt-out rules.',
                path: PATHS.SETTINGS.EMAIL_BULK.BLACKLIST,
                icon: Ban,
                permission: 'email_bulk.blacklist.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
            {
                id: 'communication-email-bulk-settings',
                title: 'Bulk Messaging Settings',
                description: 'Bulk email delivery and campaign settings.',
                path: PATHS.SETTINGS.EMAIL_BULK.SETTINGS,
                icon: Settings,
                permission: 'email_bulk.settings.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
        ],
    },
    {
        id: 'templates',
        title: 'Templates',
        description: 'Create and manage reusable email and communication templates.',
        icon: FileText,
        expandedHeading: 'Template Tools',
        featurePath: 'communication.enableEmailBulk',
        moduleCode: 'email_bulk',
        tools: [
            {
                id: 'communication-email-bulk-templates',
                title: 'Email Template Master',
                description: 'Create and edit reusable email templates.',
                path: PATHS.SETTINGS.EMAIL_BULK.TEMPLATES,
                icon: FileText,
                permission: 'email_bulk.templates.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
        ],
    },
    {
        id: 'history',
        title: 'Communication History',
        description: 'View sent, received and recorded customer communication.',
        icon: History,
        expandedHeading: 'History Tools',
        featurePath: 'communication.enableEmail',
        moduleCode: 'email',
        tools: [
            {
                id: 'communication-history',
                title: 'Communication History',
                description: 'Browse recorded customer email communication.',
                path: PATHS.SETTINGS.COMMUNICATION_HISTORY,
                icon: History,
                permission: 'email.communication_history.view',
                featurePath: 'communication.enableEmail',
                moduleCode: 'email',
            },
        ],
    },
    {
        id: 'campaign-history',
        title: 'Campaign History',
        description: 'Review bulk campaigns, delivery results and failures.',
        icon: ScrollText,
        expandedHeading: 'Campaign History Tools',
        featurePath: 'communication.enableEmailBulk',
        moduleCode: 'email_bulk',
        tools: [
            {
                id: 'communication-email-bulk-history',
                title: 'Email Campaign History',
                description: 'Review bulk campaign runs and outcomes.',
                path: PATHS.SETTINGS.EMAIL_BULK.HISTORY,
                icon: ScrollText,
                permission: 'email_bulk.campaigns.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
        ],
    },
    {
        id: 'blacklist',
        title: 'Blacklist / Opt-out',
        description: 'Manage blocked recipients, unsubscribe and exclusion rules.',
        icon: Ban,
        expandedHeading: 'Blacklist Tools',
        featurePath: 'communication.enableEmailBulk',
        moduleCode: 'email_bulk',
        tools: [
            {
                id: 'communication-email-bulk-blacklist',
                title: 'Email Blacklist',
                description: 'Manage blocked and opted-out email recipients.',
                path: PATHS.SETTINGS.EMAIL_BULK.BLACKLIST,
                icon: Ban,
                permission: 'email_bulk.blacklist.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
        ],
    },
    {
        id: 'email-settings',
        title: 'Email Settings',
        description: 'Manage sender accounts, SMTP/platform email and bulk-message settings.',
        icon: Settings,
        expandedHeading: 'Email Settings Tools',
        tools: [
            {
                id: 'communication-email-settings',
                title: 'Platform Email Settings',
                description: 'SMTP / sender configuration and test email.',
                path: PATHS.SETTINGS.EMAIL,
                icon: Settings,
                permission: 'email.settings.view',
                featurePath: 'communication.enableEmail',
                moduleCode: 'email',
            },
            {
                id: 'communication-email-bulk-settings',
                title: 'Bulk Messaging Settings',
                description: 'Email bulk messaging configuration.',
                path: PATHS.SETTINGS.EMAIL_BULK.SETTINGS,
                icon: Settings,
                permission: 'email_bulk.settings.view',
                featurePath: 'communication.enableEmailBulk',
                moduleCode: 'email_bulk',
            },
        ],
    },
];

export default function CommunicationHomePage() {
    return (
        <ExpandableModuleHome
            title="Communication - Home"
            subtitle="Manage email communication, templates, campaigns, history and communication settings."
            sections={SECTIONS}
            sessionKey={SESSION_SECTION_KEY}
            dataComponent="communication-home"
        />
    );
}
