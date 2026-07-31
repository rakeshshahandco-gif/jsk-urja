import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AiLearningFeedback } from '../../../models/aiLearningFeedback.model.js';
import { AiLearningEvaluationDataset } from '../../../models/aiLearningEvaluationDataset.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertDataset, assertExport, assertSourceView, isAggregateOnly } from './permissions.util.js';
import { getLearningSettings } from './settings.service.js';
import { rejectTenantOverrides, assertNoSecrets, sanitizeComment } from './normalize.util.js';
import { writeAudit } from './feedback.service.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

function exportRoot() {
    return path.resolve(process.cwd(), 'storage', 'ai-learning-datasets');
}

function redactRow(f, redactionLevel = 'STRICT') {
    const row = {
        feedbackId: String(f._id),
        sourceModule: f.sourceModule,
        sourceRecordId: String(f.sourceRecordId),
        sourceVersion: f.sourceVersion,
        feedbackType: f.feedbackType,
        status: f.status,
        groundTruthCategory: f.groundTruthCategory || 'USER_OPINION',
        outputStatus: f.outputSummary?.status || '',
        correctedLabel: redactionLevel === 'MINIMAL' ? (f.correctedLabel || '') : '',
        createdAt: f.createdAt,
    };
    if (redactionLevel === 'STRICT') {
        delete row.correctedLabel;
        row.commentPresent = Boolean(f.comment);
        row.companyName = undefined;
        row.email = undefined;
        row.phone = undefined;
        row.reviewerComment = undefined;
    } else if (redactionLevel === 'STANDARD') {
        row.correctedLabel = String(f.correctedLabel || '').slice(0, 80);
        row.commentPresent = Boolean(f.comment);
    }
    // Never include secrets / contact payloads
    assertNoSecrets(row);
    return row;
}

/**
 * Prepares offline evaluation dataset metadata + local JSONL file.
 * Does NOT call AI providers or trigger training.
 */
export async function prepareDataset(companyId, userId, body = {}, user = null) {
    assertDataset(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const settings = await getLearningSettings(companyId);
    if (!settings.allowDatasetPreparation) throw new ApiError(400, 'Dataset preparation disabled');

    const module = String(body.module || body.sourceModule || '');
    if (!module) throw new ApiError(400, 'module required');
    assertSourceView(user, module);

    const redactionLevel = ['STRICT', 'STANDARD', 'MINIMAL'].includes(body.redactionLevel)
        ? body.redactionLevel
        : 'STRICT';
    const limit = Math.min(Number(body.limit) || settings.maximumDatasetRows, settings.maximumDatasetRows);

    const items = await AiLearningFeedback.find({
        companyId,
        sourceModule: module,
        ...notDeleted(),
        status: { $nin: ['ARCHIVED', 'DUPLICATE'] },
    }).sort({ createdAt: -1 }).limit(limit).lean();

    const rows = items.map((f) => redactRow(f, redactionLevel));
    const jsonl = rows.map((r) => JSON.stringify(r)).join('\n');
    const checksum = createHash('sha256').update(jsonl || '').digest('hex');

    const dir = path.join(exportRoot(), String(companyId));
    await fs.mkdir(dir, { recursive: true });
    const fileName = `dataset_${module}_${Date.now()}.jsonl`;
    const storageReference = path.join(dir, fileName);
    await fs.writeFile(storageReference, jsonl, 'utf8');

    const doc = await AiLearningEvaluationDataset.create({
        companyId,
        module,
        name: String(body.name || `${module}-eval-${Date.now()}`).slice(0, 120),
        version: String(body.version || '1'),
        recordCount: rows.length,
        rowCount: rows.length,
        inclusionCriteria: body.inclusionCriteria || { sourceModule: module },
        exclusionCriteria: body.exclusionCriteria || { secrets: true, rawContacts: true, base64: true },
        feedbackReferences: items.map((i) => i._id).slice(0, 5000),
        sourceReferences: items.slice(0, 500).map((i) => ({
            sourceRecordId: i.sourceRecordId,
            sourceVersion: i.sourceVersion,
        })),
        redactionLevel,
        status: 'READY',
        storageReference,
        storageKind: 'LOCAL_FILE',
        checksum,
        createdBy: userId,
        updatedBy: userId,
    });

    await writeAudit(companyId, userId, 'dataset_prepared', 'DATASET', doc._id, {
        module,
        rowCount: rows.length,
        redactionLevel,
        trainingTriggered: false,
        providerCalled: false,
        note: 'File stored outside MongoDB; metadata only in DB',
    });

    return {
        id: String(doc._id),
        name: doc.name,
        module: doc.module,
        rowCount: doc.rowCount,
        checksum: doc.checksum,
        redactionLevel: doc.redactionLevel,
        status: doc.status,
        storageKind: doc.storageKind,
        hasFileContentInMongo: false,
        trainingTriggered: false,
        providerCalled: false,
    };
}

export async function listDatasets(companyId, user = null) {
    assertDataset(user);
    const items = await AiLearningEvaluationDataset.find({ companyId, ...notDeleted() })
        .sort({ createdAt: -1 }).limit(100).lean();
    return {
        items: items.map((d) => ({
            id: String(d._id),
            name: d.name,
            module: d.module,
            rowCount: d.rowCount,
            redactionLevel: d.redactionLevel,
            status: d.status,
            checksum: d.checksum,
            storageKind: d.storageKind,
            createdAt: d.createdAt,
        })),
    };
}

export async function getDataset(companyId, id, user = null) {
    assertDataset(user);
    const doc = await AiLearningEvaluationDataset.findOne({ _id: oid(id), companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Dataset not found');
    return {
        id: String(doc._id),
        name: doc.name,
        module: doc.module,
        version: doc.version,
        rowCount: doc.rowCount,
        redactionLevel: doc.redactionLevel,
        status: doc.status,
        checksum: doc.checksum,
        storageKind: doc.storageKind,
        inclusionCriteria: doc.inclusionCriteria,
        exclusionCriteria: doc.exclusionCriteria,
        hasFileContentInMongo: false,
        fileBytesStoredInMongo: false,
    };
}

export async function exportDataset(companyId, id, user = null) {
    assertExport(user);
    assertDataset(user);
    if (isAggregateOnly(user)) throw new ApiError(403, 'Aggregate-only users cannot export datasets');
    const doc = await AiLearningEvaluationDataset.findOne({ _id: oid(id), companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Dataset not found');
    assertSourceView(user, doc.module);

    let content = '';
    if (doc.storageReference) {
        content = await fs.readFile(doc.storageReference, 'utf8');
    }
    await writeAudit(companyId, user?.id || user?._id, 'dataset_exported', 'DATASET', doc._id, {
        rowCount: doc.rowCount,
        redactionLevel: doc.redactionLevel,
    });
    return {
        id: String(doc._id),
        name: doc.name,
        format: 'jsonl',
        checksum: doc.checksum,
        content,
        note: 'Offline export only — not sent to AI providers; training not triggered',
        trainingTriggered: false,
        providerCalled: false,
    };
}

export async function archiveDataset(companyId, userId, id, user = null) {
    assertDataset(user);
    const doc = await AiLearningEvaluationDataset.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Dataset not found');
    doc.status = 'ARCHIVED';
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'dataset_prepared', 'DATASET', doc._id, { archived: true });
    return { id: String(doc._id), status: doc.status };
}

export { redactRow, sanitizeComment };
