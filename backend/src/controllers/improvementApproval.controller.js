import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/improvementApproval/normalize.util.js';
import * as caseService from '../services/dataExtractor/improvementApproval/case.service.js';
import * as specService from '../services/dataExtractor/improvementApproval/specification.service.js';
import * as savedViewsService from '../services/dataExtractor/improvementApproval/savedViews.service.js';
import { getPolicyForUser, saveApprovalPolicy } from '../services/dataExtractor/improvementApproval/policy.service.js';
import { evaluateProposalEligibility } from '../services/dataExtractor/improvementApproval/eligibility.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null
        || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function uid(req) {
    return req.user?.id || req.user?._id;
}

function wrap(fn) {
    return asyncHandler(async (req, res) => {
        rejectTenantOverrides(req);
        try {
            const data = await fn(req);
            res.send(new ApiResponse(200, data, 'Improvement Approval OK'));
        } catch (err) {
            throw new ApiError(err.statusCode || 500, sanitizeError(err));
        }
    });
}

export const listCasesHandler = wrap(async (req) => caseService.listCases(req.companyId, req.query, req.user));
export const createCaseHandler = wrap(async (req) => caseService.createCase(req.companyId, uid(req), req.body || {}, req.user));
export const getCaseHandler = wrap(async (req) => caseService.getCase(req.companyId, req.params.id, req.user));
export const submitCaseHandler = wrap(async (req) => caseService.submitCase(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const requestEvidenceHandler = wrap(async (req) => caseService.requestEvidence(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const reviewCaseHandler = wrap(async (req) => caseService.addReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const finalDecisionHandler = wrap(async (req) => caseService.finalDecision(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const archiveCaseHandler = wrap(async (req) => caseService.archiveCase(req.companyId, uid(req), req.params.id, req.user));
export const caseHistoryHandler = wrap(async (req) => caseService.getCaseHistory(req.companyId, req.params.id, req.user));

export const listReviewsHandler = wrap(async (req) => caseService.listReviews(req.companyId, req.query, req.user));
export const getReviewHandler = wrap(async (req) => {
    const data = await caseService.listReviews(req.companyId, { ...req.query }, req.user);
    const item = (data.items || []).find((r) => r.id === req.params.id);
    if (!item) throw new ApiError(404, 'Review not found');
    return item;
});

export const listSpecsHandler = wrap(async (req) => specService.listSpecifications(req.companyId, req.query, req.user));
export const generateSpecHandler = wrap(async (req) => specService.generateSpecification(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getSpecHandler = wrap(async (req) => specService.getSpecification(req.companyId, req.params.id, req.user));
export const updateSpecHandler = wrap(async (req) => specService.updateSpecification(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const finalizeSpecHandler = wrap(async (req) => specService.finalizeSpecification(req.companyId, uid(req), req.params.id, req.user));
export const archiveSpecHandler = wrap(async (req) => specService.archiveSpecification(req.companyId, uid(req), req.params.id, req.user));
export const exportSpecHandler = wrap(async (req) => specService.exportSpecification(req.companyId, req.params.id, req.user));
export const specHistoryHandler = wrap(async (req) => specService.getSpecificationHistory(req.companyId, req.params.id, req.user));

export const getPolicyHandler = wrap(async (req) => getPolicyForUser(req.companyId, req.user));
export const savePolicyHandler = wrap(async (req) => saveApprovalPolicy(req.companyId, uid(req), req.body || {}, req.user));

export const listViewsHandler = wrap(async (req) => savedViewsService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => savedViewsService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const updateViewHandler = wrap(async (req) => savedViewsService.updateSavedView(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => savedViewsService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));

export const auditHandler = wrap(async (req) => savedViewsService.listAudit(req.companyId, req.query, req.user));
export const exportHandler = wrap(async (req) => savedViewsService.exportCases(req.companyId, req.query, req.user));
export const eligibilityHandler = wrap(async (req) => evaluateProposalEligibility(req.companyId, req.query.proposalId || req.body?.proposalId, req.user));
