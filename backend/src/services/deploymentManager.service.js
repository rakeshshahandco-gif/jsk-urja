import { Company } from '../models/company.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { loadCompanyModuleContext } from './moduleGuard.service.js';
import { getLocalGitInfo } from '../utils/localGit.utils.js';
import {
    CLIENT_DEPLOYMENT_GROUPS,
    DEPLOY_DECISION_RULES,
    PRE_DEPLOY_CHECKLIST,
    SHARED_RISK_HINTS,
    CLIENT_ONBOARDING_STEPS,
    getClientGroupByKey,
} from '../constants/clientDeploymentMatrix.constants.js';

const normalizeKey = (value) => String(value || '').trim().toLowerCase();

function matchCompanyToClientKey(company, templateCodeById) {
    const clientCode = normalizeKey(company.clientCode);
    const dbName = normalizeKey(company.deploymentConfig?.databaseName);
    const backendUrl = normalizeKey(company.deploymentConfig?.backendUrl);

    for (const group of CLIENT_DEPLOYMENT_GROUPS) {
        const key = normalizeKey(group.clientKey);
        if (clientCode && (clientCode === key || clientCode.includes(key) || key.includes(clientCode))) {
            return group.clientKey;
        }
        if (dbName && normalizeKey(group.databaseName) === dbName) {
            return group.clientKey;
        }
        if (backendUrl && group.backendUrl && backendUrl.includes(normalizeKey(group.backendUrl).replace('https://', ''))) {
            return group.clientKey;
        }
    }

    const templateCode = templateCodeById.get(String(company.industryTemplateRef || ''));
    if (templateCode) {
        const byTemplate = CLIENT_DEPLOYMENT_GROUPS.find((g) =>
            (g.industryTemplates || []).includes(templateCode)
        );
        if (byTemplate && byTemplate.status === 'live') {
            return byTemplate.clientKey;
        }
    }

    return 'unassigned';
}

const MAX_DEPLOY_HISTORY = 50;

function normalizeHistoryEntry(entry) {
    return {
        recordedAt: entry.recordedAt || new Date(),
        commitHash: String(entry.commitHash || '').trim(),
        deployDate: String(entry.deployDate || '').trim(),
        changeScope: String(entry.changeScope || '').trim(),
        targetServices: String(entry.targetServices || '').trim(),
        notes: String(entry.notes || '').trim(),
        recordedBy: entry.recordedBy || null,
        recordedByName: String(entry.recordedByName || '').trim(),
    };
}

function summarizeCompany(company, ctx, templateCode) {
    const history = Array.isArray(company.deploymentHistory) ? company.deploymentHistory : [];
    return {
        _id: company._id,
        companyName: company.companyName,
        clientCode: company.clientCode || '',
        industryTemplateCode: templateCode || '',
        moduleGuardEnabled: company.moduleGuardEnabled === true,
        moduleAllocationConfigured: company.moduleAllocationConfigured === true,
        enabledModuleCount: ctx?.enabledModules?.length || 0,
        deploymentConfig: company.deploymentConfig || {},
        deploymentHistory: history.slice(0, 20),
        isActive: company.isActive !== false,
    };
}

export async function getDeploymentManagerOverview() {
    const [companies, templates] = await Promise.all([
        Company.find({})
            .select('companyName clientCode industryTemplateRef enabledModules disabledModules moduleGuardEnabled moduleAllocationConfigured deploymentConfig deploymentHistory isActive')
            .lean(),
        IndustryTemplate.find({}).select('templateCode templateName').lean(),
    ]);

    const templateCodeById = new Map(templates.map((t) => [String(t._id), t.templateCode]));
    const templateNameByCode = new Map(templates.map((t) => [t.templateCode, t.templateName]));

    const companiesByKey = new Map();
    const enriched = await Promise.all(companies.map(async (company) => {
        const clientKey = matchCompanyToClientKey(company, templateCodeById);
        const templateCode = templateCodeById.get(String(company.industryTemplateRef || '')) || '';
        const ctx = await loadCompanyModuleContext(company._id);
        return { clientKey, row: summarizeCompany(company, ctx, templateCode) };
    }));

    for (const { clientKey, row } of enriched) {
        if (!companiesByKey.has(clientKey)) companiesByKey.set(clientKey, []);
        companiesByKey.get(clientKey).push(row);
    }

    const clientGroups = CLIENT_DEPLOYMENT_GROUPS.map((group) => ({
        ...group,
        industryTemplateLabels: (group.industryTemplates || []).map((code) => ({
            code,
            name: templateNameByCode.get(code) || code,
        })),
        companies: companiesByKey.get(group.clientKey) || [],
        companyCount: (companiesByKey.get(group.clientKey) || []).length,
    }));

    const unassigned = companiesByKey.get('unassigned') || [];

    return {
        clientGroups,
        unassignedCompanies: unassigned,
        deployDecisionRules: DEPLOY_DECISION_RULES,
        preDeployChecklist: PRE_DEPLOY_CHECKLIST,
        sharedRiskHints: SHARED_RISK_HINTS,
        generatedAt: new Date().toISOString(),
    };
}

export function getClientDeployChecklist(clientKey) {
    const group = getClientGroupByKey(clientKey);
    if (!group) return null;

    const buildLines = [];
    if (group.buildCommand) buildLines.push(`Build: ${group.buildCommand}`);
    if (group.buildCommandFrontend) buildLines.push(`Frontend build: ${group.buildCommandFrontend}`);
    if (group.buildCommandBackend) buildLines.push(`Backend build: ${group.buildCommandBackend}`);

    return {
        clientKey: group.clientKey,
        clientName: group.clientName,
        status: group.status,
        renderFrontendService: group.renderFrontendService || '',
        renderBackendService: group.renderBackendService || '',
        databaseName: group.databaseName || '',
        deployBranch: group.deployBranch || '',
        buildLines,
        checklist: PRE_DEPLOY_CHECKLIST,
        onboardingSteps: CLIENT_ONBOARDING_STEPS[group.clientKey] || [],
        notes: group.notes || '',
    };
}

export function buildReferenceTrackingPatch(group, company) {
    if (!group) return { trackingPatch: {}, clientCode: null };

    const existing = company.deploymentConfig || {};
    const trackingPatch = {};

    const map = {
        databaseName: group.databaseName,
        backendUrl: group.backendUrl,
        frontendUrl: group.frontendUrl,
        renderFrontendService: group.renderFrontendService,
        renderBackendService: group.renderBackendService,
    };

    for (const [key, value] of Object.entries(map)) {
        if (value && !String(existing[key] || '').trim()) {
            trackingPatch[key] = value;
        }
    }

    if (!String(existing.deploymentStatus || '').trim()) {
        if (group.status === 'live') trackingPatch.deploymentStatus = 'live';
        else if (group.status === 'planned') trackingPatch.deploymentStatus = 'pending';
    }

    const clientCode = !String(company.clientCode || '').trim() ? group.clientKey : null;
    return { trackingPatch, clientCode };
}

export async function applyCompanyReferenceDefaults(companyId, clientKey) {
    const group = getClientGroupByKey(clientKey);
    if (!group) {
        const err = new Error('Unknown client group');
        err.statusCode = 400;
        throw err;
    }

    const company = await Company.findById(companyId);
    if (!company) {
        const err = new Error('Company not found');
        err.statusCode = 404;
        throw err;
    }

    const { trackingPatch, clientCode } = buildReferenceTrackingPatch(group, company);
    if (clientCode) company.clientCode = clientCode;

    if (Object.keys(trackingPatch).length) {
        company.deploymentConfig = {
            ...(company.deploymentConfig?.toObject?.() || company.deploymentConfig || {}),
            ...trackingPatch,
        };
    }

    if (!clientCode && !Object.keys(trackingPatch).length) {
        const err = new Error('All reference fields already set — nothing to apply');
        err.statusCode = 400;
        throw err;
    }

    await company.save();

    return {
        _id: company._id,
        companyName: company.companyName,
        clientCode: company.clientCode || '',
        deploymentConfig: company.deploymentConfig || {},
        applied: { clientCode: !!clientCode, fields: Object.keys(trackingPatch) },
    };
}

export function buildDeploymentReportMarkdown(overview) {
    const lines = [
        '# Deployment Manager Report',
        '',
        `Generated: ${overview.generatedAt || new Date().toISOString()}`,
        '',
        '## Deploy Decision Rules',
        '',
    ];

    for (const rule of overview.deployDecisionRules || []) {
        lines.push(`- **${rule.changeType}**: ${rule.action} (deploy: ${rule.deployRequired ? 'yes' : 'no'})`);
    }

    lines.push('', '## Pre-deploy Checklist', '');
    for (const item of overview.preDeployChecklist || PRE_DEPLOY_CHECKLIST) {
        lines.push(`- [ ] ${item}`);
    }

    lines.push('', '## Client Groups', '');
    for (const group of overview.clientGroups || []) {
        lines.push(`### ${group.clientName} (${group.status})`);
        lines.push(`- FE: ${group.renderFrontendService || '-'}`);
        lines.push(`- BE: ${group.renderBackendService || '-'}`);
        lines.push(`- DB: ${group.databaseName || '-'}`);
        lines.push(`- Companies: ${group.companyCount || 0}`);
        if (group.companies?.length) {
            for (const c of group.companies) {
                const dc = c.deploymentConfig || {};
                lines.push(`  - ${c.companyName}: commit ${dc.lastLiveCommit || '-'}, deploy ${dc.lastDeployDate || '-'}`);
                const latest = c.deploymentHistory?.[0];
                if (latest) {
                    lines.push(`    last record: ${latest.commitHash || '-'} — ${latest.changeScope || latest.notes || '-'}`);
                }
            }
        }
        lines.push('');
    }

    if (overview.unassignedCompanies?.length) {
        lines.push('## Unassigned Companies', '');
        for (const c of overview.unassignedCompanies) {
            lines.push(`- ${c.companyName}`);
        }
    }

    return lines.join('\n');
}

const TRACKING_FIELDS = [
    'databaseName',
    'backendUrl',
    'frontendUrl',
    'deploymentStatus',
    'renderFrontendService',
    'renderBackendService',
    'lastLiveCommit',
    'lastDeployDate',
    'deployNotes',
];

export function pickDeploymentTrackingPatch(body = {}) {
    const patch = {};
    for (const key of TRACKING_FIELDS) {
        if (body[key] !== undefined) {
            patch[key] = String(body[key] ?? '').trim();
        }
    }
    if (body.deploymentStatus !== undefined) {
        const allowed = ['', 'local', 'staging', 'live', 'pending'];
        const status = String(body.deploymentStatus || '').trim();
        patch.deploymentStatus = allowed.includes(status) ? status : '';
    }
    return patch;
}

export async function readLocalGitInfo() {
    return getLocalGitInfo();
}

export function pickDeployHistoryPayload(body = {}) {
    return {
        commitHash: String(body.commitHash || '').trim(),
        deployDate: String(body.deployDate || '').trim(),
        changeScope: String(body.changeScope || '').trim(),
        targetServices: String(body.targetServices || '').trim(),
        notes: String(body.notes || '').trim(),
    };
}

export async function addCompanyDeployHistory(companyId, payload, user) {
    const company = await Company.findById(companyId);
    if (!company) {
        const err = new Error('Company not found');
        err.statusCode = 404;
        throw err;
    }

    const entry = normalizeHistoryEntry({
        ...pickDeployHistoryPayload(payload),
        recordedAt: new Date(),
        recordedBy: user?._id,
        recordedByName: user?.name || user?.email || '',
    });

    if (!entry.commitHash && !entry.deployDate && !entry.changeScope && !entry.notes) {
        const err = new Error('At least one of commitHash, deployDate, changeScope, or notes is required');
        err.statusCode = 400;
        throw err;
    }

    const history = Array.isArray(company.deploymentHistory) ? [...company.deploymentHistory] : [];
    history.unshift(entry);
    company.deploymentHistory = history.slice(0, MAX_DEPLOY_HISTORY);

    company.deploymentConfig = {
        ...(company.deploymentConfig?.toObject?.() || company.deploymentConfig || {}),
    };
    if (entry.commitHash) company.deploymentConfig.lastLiveCommit = entry.commitHash;
    if (entry.deployDate) company.deploymentConfig.lastDeployDate = entry.deployDate;
    if (entry.notes) {
        const prev = String(company.deploymentConfig.deployNotes || '').trim();
        company.deploymentConfig.deployNotes = prev ? `${prev}\n${entry.notes}` : entry.notes;
    }

    company.updatedBy = user?._id;
    await company.save();

    return {
        _id: company._id,
        companyName: company.companyName,
        deploymentConfig: company.deploymentConfig,
        deploymentHistory: company.deploymentHistory,
        added: entry,
    };
}

export async function getCompanyDeployHistory(companyId) {
    const company = await Company.findById(companyId)
        .select('companyName deploymentHistory deploymentConfig')
        .lean();
    if (!company) {
        const err = new Error('Company not found');
        err.statusCode = 404;
        throw err;
    }
    return {
        _id: company._id,
        companyName: company.companyName,
        deploymentConfig: company.deploymentConfig || {},
        deploymentHistory: company.deploymentHistory || [],
    };
}
