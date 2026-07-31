import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    syncMergeReviewsFromJob,
    listMergeReviews,
    getMergeReview,
    resolveMergeReview,
} from '../services/dataExtractor/discovery/entityResolution/mergeReview.service.js';
import { compareTwoRecords } from '../services/dataExtractor/discovery/entityResolution/compareRecords.js';

const FORBIDDEN = ['companyId', 'tenantId', 'company_id', 'tenant_id'];
function rejectScopedBody(body = {}) {
    for (const key of FORBIDDEN) {
        if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
            throw new ApiError(400, 'Do not send ' + key + ' in the request body');
        }
    }
}

export const syncFromJob = asyncHandler(async (req, res) => {
    const data = await syncMergeReviewsFromJob(req.companyId, req.params.jobId, req.user.id);
    res.send(new ApiResponse(200, data, 'Merge reviews synced from discovery job'));
});

export const list = asyncHandler(async (req, res) => {
    const data = await listMergeReviews(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Merge reviews'));
});

export const getOne = asyncHandler(async (req, res) => {
    const review = await getMergeReview(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { review }, 'Merge review'));
});

export const resolve = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const review = await resolveMergeReview(req.companyId, req.params.id, req.user.id, req.body || {});
    res.send(new ApiResponse(200, { review }, 'Merge review resolved'));
});

export const compare = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const { recordA, recordB } = req.body || {};
    if (!recordA || !recordB) throw new ApiError(400, 'recordA and recordB are required');
    const result = compareTwoRecords(recordA, recordB, {
        candidateType: req.body.candidateType || 'manual_compare',
        candidateId: req.body.candidateId || null,
        candidateLabel: req.body.candidateLabel || recordB.companyName,
    });
    res.send(new ApiResponse(200, { comparison: result }, 'Side-by-side comparison'));
});
