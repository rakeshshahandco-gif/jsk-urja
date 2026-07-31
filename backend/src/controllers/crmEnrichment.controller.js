import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listDrafts, getDraft, getDraftHistory, prepareDraft, setFieldDecisions,
    previewDraft, finalApproveDraft, createLeadFromDraft, applyEnrichmentFromDraft,
    rejectDraft, lockDraft, exportDrafts,
} from '../services/dataExtractor/crmEnrichment/draft.service.js';
import { rollbackTransaction, getTransaction } from '../services/dataExtractor/crmEnrichment/rollback.service.js';
import {
    createEnrichmentBatch, getEnrichmentBatch, listEnrichmentBatches,
    controlEnrichmentBatch, processEnrichmentBatchChunk,
} from '../services/dataExtractor/crmEnrichment/batch.service.js';
import { evaluateEligibility } from '../services/dataExtractor/crmEnrichment/eligibility.service.js';
import { scoreCrmCandidate, classifyCrmMatches } from '../services/dataExtractor/crmEnrichment/matching.service.js';
import { buildFieldComparisons, buildProposedFieldsFromSource } from '../services/dataExtractor/crmEnrichment/comparison.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listDrafts(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'CRM enrichment drafts'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getDraft(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'CRM enrichment draft'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getDraftHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'CRM enrichment history'));
});

export const prepare = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await prepareDraft(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'CRM enrichment draft prepared'));
});

export const matchSample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const body = req.body || {};
    const eligibility = evaluateEligibility(body);
    const candidates = (body.crmCandidates || []).map((c) => scoreCrmCandidate(body.source || {}, c, c.entityType || 'LEAD'));
    const match = classifyCrmMatches(candidates.sort((a, b) => b.score - a.score));
    const proposed = buildProposedFieldsFromSource(body.source || {}, body.snapshots || {});
    const comparisons = buildFieldComparisons({
        entityType: match.matchedCrmEntityType === 'NONE' ? 'LEAD' : (match.top?.entityType || 'LEAD'),
        crmEntity: body.crmEntity || null,
        proposed,
        sourceMeta: body.sourceMeta || {},
    });
    const data = { eligibility, match, proposed, comparisons, noAutoCustomerCreate: true, noAutoSupplierCreate: true };
    const blob = JSON.stringify(data);
    if (/password|cookie|sk-[a-z0-9]|sessiontoken|data:image\/|base64,/i.test(blob)) {
        throw new ApiError(500, 'Refusing to return secret/session/media values');
    }
    res.send(new ApiResponse(200, data, 'Sample CRM match/compare'));
});

export const reviewFields = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await setFieldDecisions(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Field decisions saved'));
});

export const preview = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await previewDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Enrichment preview'));
});

export const finalApprove = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await finalApproveDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Draft finally approved'));
});

export const createLead = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createLeadFromDraft(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'CRM Lead created from draft'));
});

export const applyEnrichment = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await applyEnrichmentFromDraft(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'CRM enrichment applied'));
});

export const rejectOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await rejectDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Draft rejected'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) throw new ApiError(400, 'action must be lock or unlock');
    const data = await lockDraft(req.companyId, req.user.id, req.params.id, { action, reason: req.body?.reason || '' });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Unlocked' : 'Locked'));
});

export const exportApproved = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportDrafts(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'CRM enrichment export'));
});

export const getTx = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getTransaction(req.companyId, req.params.txId);
    res.send(new ApiResponse(200, data, 'Enrichment transaction'));
});

export const rollback = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await rollbackTransaction(req.companyId, req.user.id, req.params.txId, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Rollback result'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createEnrichmentBatch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Enrichment batch created'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listEnrichmentBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Enrichment batches'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getEnrichmentBatch(req.companyId, req.params.id);
    const { auditLog, ...safe } = data || {};
    res.send(new ApiResponse(200, safe, 'Enrichment batch'));
});

export const getBatchAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getEnrichmentBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { _id: data._id, auditLog: data.auditLog || [] }, 'Batch audit'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlEnrichmentBatch(req.companyId, req.user.id, req.params.id, req.body?.action, {
        reason: req.body?.reason || req.body?.pauseReason || '',
    });
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processEnrichmentBatchChunk(req.companyId, req.user.id, req.params.id, {
        maxItems: Number(req.body?.maxItems) || 5,
    });
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});
