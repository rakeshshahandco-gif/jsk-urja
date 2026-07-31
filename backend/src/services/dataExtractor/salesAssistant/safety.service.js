import { ACTION_NAV } from './constants.js';
import { navSuggestion } from './normalize.util.js';

const ACTION_RULES = [
    { actionType: 'SEND', re: /\b(send\s+(an?\s+)?(email|whatsapp|wa\b|message)|email\s+them|whatsapp\s+them)\b/i },
    { actionType: 'CREATE_LEAD', re: /\b(create\s+(this\s+)?(lead|customer|supplier)|add\s+(a\s+)?lead)\b/i },
    { actionType: 'ASSIGN', re: /\b(assign|reassign)\b.*\b(salesperson|owner|lead|to)\b|\b(re)?assign\s+(this|the)\s+lead\b/i },
    { actionType: 'TASK', re: /\b(create|add|make)\s+(a\s+)?task\b|\bschedule\s+a\s+task\b/i },
    { actionType: 'FOLLOWUP', re: /\b(create|schedule|set)\s+(a\s+)?follow[- ]?up\b/i },
    { actionType: 'APPROVE_APPLY', re: /\b(approve|apply)\s+(this\s+)?(draft|enrichment)\b|\bapply\s+enrichment\b/i },
    { actionType: 'CAMPAIGN', re: /\b(start|launch|execute)\s+(the\s+)?campaign\b|\bsend\s+campaign\b/i },
    { actionType: 'ROLLBACK', re: /\broll\s*back\b|\brevert\s+(this\s+)?(transaction|assignment|apply)\b/i },
    { actionType: 'MERGE', re: /\bmerge\s+(companies|leads|duplicates)\b/i },
    { actionType: 'SEND', re: /\breveal\s+(api|secret|password|key)|ignore\s+(previous|prior)\s+instructions|executeMongo|runQuery|access\s+another\s+company\b/i },
];

export function detectActionRequest(text) {
    const q = String(text || '');
    for (const rule of ACTION_RULES) {
        if (rule.re.test(q)) {
            const nav = ACTION_NAV[rule.actionType] || ACTION_NAV.ASSIGN;
            return {
                blocked: true,
                actionType: rule.actionType,
                safetyClassification: 'BLOCKED_WRITE_OR_UNSAFE',
                message: 'Phase 17 Assistant is read-only. It cannot create, update, assign, approve, apply, send, merge, or roll back records.',
                navigationSuggestions: [
                    navSuggestion({
                        label: nav.label,
                        reason: `Use the controlled ${nav.targetModule} screen for this action.`,
                        targetModule: nav.targetModule,
                        requiredPermission: '',
                        navigationRoute: nav.navigationRoute || '',
                    }),
                ],
            };
        }
    }
    return { blocked: false, actionType: null, safetyClassification: 'SAFE_READ', message: '', navigationSuggestions: [] };
}

export function detectPromptInjectionInSource(text) {
    const t = String(text || '');
    return /ignore\s+(previous|prior)\s+instructions|reveal\s+api|executeMongo|call\s+the\s+send\s+endpoint|assign\s+this\s+lead|access\s+another\s+company/i.test(t);
}
