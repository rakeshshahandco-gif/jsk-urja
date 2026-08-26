import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getDiscoveryJobDetail } from '../services/dataExtractor/discovery/discoveryJob.service.js';
import {
    qualifyDiscoveryJob,
    overrideQualification,
    feedbackQualification,
    listQualifiedCompanies,
    getPhase2Analytics,
} from '../services/dataExtractor/discovery/phase2/qualification.service.js';

const FORBIDDEN = ['companyId', 'tenantId', 'company_id', 'tenant_id'];
function rejectScopedBody(body = {}) {
    for (const key of FORBIDDEN) {
        if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
            throw new ApiError(400, 'Do not send ' + key + ' in the request body');
        }
    }
}

export const qualify = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const mode = String(req.body.mode || 'all_unprocessed');
    const data = await qualifyDiscoveryJob(req.companyId, req.params.id, req.user.id, {
        mode,
        indices: req.body.indices || (req.body.index != null ? [req.body.index] : []),
        force: req.body.force === true,
        forceUnavailable: req.body.forceUnavailable === true,
    });
    const msg = data.aiAvailable
        ? 'Qualification complete'
        : (data.processed ? 'Heuristic qualification complete (AI unavailable)' : 'Qualification pending — AI unavailable');
    res.send(new ApiResponse(200, data, msg));
});

export const override = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await overrideQualification(req.companyId, req.params.id, req.user.id, {
        index: req.body.index,
        category: req.body.category,
    });
    res.send(new ApiResponse(200, data, 'Qualification overridden'));
});

export const feedback = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await feedbackQualification(req.companyId, req.params.id, req.user.id, {
        index: req.body.index,
        verdict: req.body.verdict,
        correctedCategory: req.body.correctedCategory,
    });
    res.send(new ApiResponse(200, data, 'Feedback saved'));
});

export const qualifiedCompanies = asyncHandler(async (req, res) => {
    const job = await getDiscoveryJobDetail(req.companyId, req.params.id);
    const data = listQualifiedCompanies(job, req.query);
    res.send(new ApiResponse(200, { jobId: job._id, keyword: job.keyword, ...data }, 'Qualified companies'));
});

export const analytics = asyncHandler(async (req, res) => {
    const data = await getPhase2Analytics(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Extraction run analytics'));
});
