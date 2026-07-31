/**
 * Frontend mirror of backend protected CRM modules (WhatsApp).
 * Keep keys / menu ids / routes aligned with
 * backend/src/constants/protectedCrmModules.constants.js
 */

export const PROTECTED_CRM_MODULE_KEYS = Object.freeze([
    'whatsapp_communication',
    'whatsapp_ai',
    'whatsapp_settings',
]);

export const PROTECTED_CRM_MODULES = Object.freeze([
    {
        key: 'whatsapp_communication',
        displayName: 'WhatsApp Communication',
        moduleCode: 'whatsapp_bulk',
        featurePath: 'communication.enableWhatsappBulk',
        frontendRoutes: [
            '/whatsapp/chat',
            '/communication/whatsapp-bulk/campaigns',
        ],
        sidebarMenuIds: [
            'whatsapp-root',
            'whatsapp-communication-group',
            'whatsapp-chat',
            'communication-bulk-campaigns',
        ],
        protectedFromAccidentalRemoval: true,
        jskUrjaDefaultEnabled: true,
    },
    {
        key: 'whatsapp_ai',
        displayName: 'WhatsApp AI',
        moduleCode: 'whatsapp_ai',
        featurePath: 'communication.whatsappAiEnabled',
        frontendRoutes: [
            '/communication/whatsapp-ai',
            '/communication/whatsapp-ai/settings',
        ],
        sidebarMenuIds: [
            'whatsapp-root',
            'communication-whatsapp-ai-group',
            'communication-whatsapp-ai-dashboard',
        ],
        protectedFromAccidentalRemoval: true,
        jskUrjaDefaultEnabled: true,
    },
    {
        key: 'whatsapp_settings',
        displayName: 'WhatsApp Settings',
        moduleCode: 'whatsapp',
        featurePath: null,
        frontendRoutes: ['/whatsapp'],
        sidebarMenuIds: ['whatsapp-root', 'whatsapp'],
        protectedFromAccidentalRemoval: true,
        jskUrjaDefaultEnabled: true,
    },
]);
