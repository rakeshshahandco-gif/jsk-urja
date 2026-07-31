import { AiContactRoleMaster } from '../../../models/aiContactRoleMaster.model.js';
import { DEFAULT_ROLE_SEED } from './constants.js';

function cleanList(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

export async function listContactRoles(companyId, query = {}) {
    const q = { companyId };
    if (query.isActive === 'true') q.isActive = true;
    if (query.isActive === 'false') q.isActive = false;
    let results = await AiContactRoleMaster.find(q).sort({ roleName: 1 }).lean();
    if (!results.length && query.seed !== 'false') {
        results = await seedDefaultRoles(companyId, null);
    }
    return { results };
}

export async function seedDefaultRoles(companyId, userId = null) {
    const existing = await AiContactRoleMaster.find({ companyId }).select('roleName').lean();
    const have = new Set(existing.map((x) => String(x.roleName).toLowerCase()));
    const created = [];
    for (const row of DEFAULT_ROLE_SEED) {
        if (have.has(String(row.roleName).toLowerCase())) continue;
        const doc = await AiContactRoleMaster.create({
            companyId,
            ...row,
            keywords: cleanList(row.keywords),
            negativeKeywords: cleanList(row.negativeKeywords),
            applicableIndustries: cleanList(row.applicableIndustries),
            applicableOpportunityTypes: cleanList(row.applicableOpportunityTypes),
            isActive: true,
            createdBy: userId,
            updatedBy: userId,
            auditLog: [{ at: new Date(), action: 'seeded', userId, note: 'Default role seed' }],
        });
        created.push(doc.toObject());
    }
    return AiContactRoleMaster.find({ companyId, isActive: { $ne: false } }).lean();
}

export async function saveContactRoles(companyId, rows = [], userId = null) {
    const results = [];
    for (const row of rows || []) {
        const roleName = String(row.roleName || '').trim();
        if (!roleName) continue;
        let doc = await AiContactRoleMaster.findOne({ companyId, roleName });
        const values = {
            roleName,
            roleGroup: String(row.roleGroup || 'General').trim(),
            keywords: cleanList(row.keywords),
            negativeKeywords: cleanList(row.negativeKeywords),
            seniorityWeight: Number(row.seniorityWeight) || 50,
            decisionMakerWeight: Number(row.decisionMakerWeight) || 50,
            applicableIndustries: cleanList(row.applicableIndustries),
            applicableOpportunityTypes: cleanList(row.applicableOpportunityTypes),
            opportunityPriorities: Array.isArray(row.opportunityPriorities) ? row.opportunityPriorities : [],
            isActive: row.isActive !== false,
            notes: String(row.notes || '').trim(),
            updatedBy: userId,
        };
        if (!doc) {
            doc = new AiContactRoleMaster({ companyId, ...values, createdBy: userId, auditLog: [{ at: new Date(), action: 'created', userId }] });
        } else {
            Object.assign(doc, values, { version: Number(doc.version || 1) + 1 });
            doc.auditLog = [...(doc.auditLog || []), { at: new Date(), action: 'updated', userId }].slice(-50);
        }
        await doc.save();
        results.push(doc.toObject());
    }
    return results;
}

export async function getActiveRoles(companyId) {
    const { results } = await listContactRoles(companyId, { isActive: 'true' });
    return results;
}
