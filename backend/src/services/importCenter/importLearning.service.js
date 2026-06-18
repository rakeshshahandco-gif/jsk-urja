import { ImportMasterMapping } from '../../models/importMasterMapping.model.js';
import { stripLegalSuffix } from '../importUtility/ledgerMatch.service.js';

export function normalizeImportedName(name) {
    return stripLegalSuffix(String(name || '').trim()).toLowerCase();
}

export async function findLearnedMapping(companyId, entityType, importedName) {
    if (!companyId || !importedName) return null;
    const normalizedName = normalizeImportedName(importedName);
    if (!normalizedName) return null;
    return ImportMasterMapping.findOne({ companyId, entityType, normalizedName }).lean();
}

export async function saveMasterMapping({ companyId, entityType, importedName, entityId, entityLabel, userId }) {
    const normalizedName = normalizeImportedName(importedName);
    if (!companyId || !entityType || !normalizedName || !entityId) {
        return null;
    }
    return ImportMasterMapping.findOneAndUpdate(
        { companyId, entityType, normalizedName },
        {
            companyId,
            entityType,
            importedName: String(importedName).trim(),
            normalizedName,
            entityId,
            entityLabel: entityLabel || '',
            createdBy: userId || null,
        },
        { upsert: true, new: true },
    ).lean();
}

export async function listMasterMappings(companyId, entityType) {
    const q = { companyId };
    if (entityType) q.entityType = entityType;
    return ImportMasterMapping.find(q).sort({ updatedAt: -1 }).limit(500).lean();
}
