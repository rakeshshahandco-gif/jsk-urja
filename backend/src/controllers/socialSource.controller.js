import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    getSocialSourceStatus,
    startSocialExtraction,
    connectDirect,
    disconnectDirect,
} from '../services/dataExtractor/socialSources/socialExtraction.service.js';

const FORBIDDEN = ['companyId', 'tenantId', 'company_id', 'tenant_id'];
function rejectScopedBody(body = {}) {
    for (const key of FORBIDDEN) {
        if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
            throw new ApiError(400, 'Do not send ' + key + ' in the request body');
        }
    }
}

export const facebookStatus = asyncHandler(async (req, res) => {
    const data = getSocialSourceStatus({ platform: 'facebook', companyId: req.companyId });
    res.send(new ApiResponse(200, data, 'Facebook source status'));
});

export const instagramStatus = asyncHandler(async (req, res) => {
    const data = getSocialSourceStatus({ platform: 'instagram', companyId: req.companyId });
    res.send(new ApiResponse(200, data, 'Instagram source status'));
});

export const facebookStart = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await startSocialExtraction({
        companyId: req.companyId,
        user: req.user,
        headers: req.headers,
        platform: 'facebook',
        mode: req.body.mode,
        keyword: req.body.keyword,
        location: req.body.location || req.body.city || '',
        searchType: req.body.searchType,
        maxResults: req.body.maxResults,
    });
    res.send(new ApiResponse(200, data, data.ingested ? 'Facebook candidates sent to Processing' : 'No Facebook candidates found'));
});

export const instagramStart = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await startSocialExtraction({
        companyId: req.companyId,
        user: req.user,
        headers: req.headers,
        platform: 'instagram',
        mode: req.body.mode,
        keyword: req.body.keyword,
        location: req.body.location || req.body.city || '',
        searchType: req.body.searchType,
        maxResults: req.body.maxResults,
    });
    res.send(new ApiResponse(200, data, data.ingested ? 'Instagram candidates sent to Processing' : 'No Instagram candidates found'));
});

export const facebookConnect = asyncHandler(async (req, res) => {
    const data = await connectDirect({ companyId: req.companyId, user: req.user, platform: 'facebook' });
    res.send(new ApiResponse(200, data, data.status === 'connected' ? 'Facebook Direct Login connected' : 'Facebook Direct Login not connected'));
});

export const instagramConnect = asyncHandler(async (req, res) => {
    const data = await connectDirect({ companyId: req.companyId, user: req.user, platform: 'instagram' });
    res.send(new ApiResponse(200, data, data.status === 'connected' ? 'Instagram Direct Login connected' : 'Instagram Direct Login not connected'));
});

export const facebookDisconnect = asyncHandler(async (req, res) => {
    const data = await disconnectDirect({ companyId: req.companyId, user: req.user, platform: 'facebook' });
    res.send(new ApiResponse(200, data, 'Facebook Direct Login disconnected'));
});

export const instagramDisconnect = asyncHandler(async (req, res) => {
    const data = await disconnectDirect({ companyId: req.companyId, user: req.user, platform: 'instagram' });
    res.send(new ApiResponse(200, data, 'Instagram Direct Login disconnected'));
});

export const linkedinStatus = asyncHandler(async (req, res) => {
    const data = getSocialSourceStatus({ platform: 'linkedin', companyId: req.companyId });
    res.send(new ApiResponse(200, data, 'LinkedIn source status'));
});

export const xStatus = asyncHandler(async (req, res) => {
    const data = getSocialSourceStatus({ platform: 'x', companyId: req.companyId });
    res.send(new ApiResponse(200, data, 'X source status'));
});

export const linkedinStart = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await startSocialExtraction({
        companyId: req.companyId,
        user: req.user,
        headers: req.headers,
        platform: 'linkedin',
        mode: req.body.mode,
        keyword: req.body.keyword,
        location: req.body.location || req.body.city || '',
        searchType: req.body.searchType,
        maxResults: req.body.maxResults,
    });
    res.send(new ApiResponse(200, data, data.ingested ? 'LinkedIn candidates sent to Processing' : 'No LinkedIn candidates found'));
});

export const xStart = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await startSocialExtraction({
        companyId: req.companyId,
        user: req.user,
        headers: req.headers,
        platform: 'x',
        mode: req.body.mode,
        keyword: req.body.keyword,
        location: req.body.location || req.body.city || '',
        searchType: req.body.searchType,
        maxResults: req.body.maxResults,
    });
    res.send(new ApiResponse(200, data, data.ingested ? 'X candidates sent to Processing' : 'No X candidates found'));
});

export const linkedinConnect = asyncHandler(async (req, res) => {
    const data = await connectDirect({ companyId: req.companyId, user: req.user, platform: 'linkedin' });
    res.send(new ApiResponse(200, data, data.status === 'connected' ? 'LinkedIn Direct Login connected' : 'LinkedIn Direct Login not connected'));
});

export const xConnect = asyncHandler(async (req, res) => {
    const data = await connectDirect({ companyId: req.companyId, user: req.user, platform: 'x' });
    res.send(new ApiResponse(200, data, data.status === 'connected' ? 'X Direct Login connected' : 'X Direct Login not connected'));
});

export const linkedinDisconnect = asyncHandler(async (req, res) => {
    const data = await disconnectDirect({ companyId: req.companyId, user: req.user, platform: 'linkedin' });
    res.send(new ApiResponse(200, data, 'LinkedIn Direct Login disconnected'));
});

export const xDisconnect = asyncHandler(async (req, res) => {
    const data = await disconnectDirect({ companyId: req.companyId, user: req.user, platform: 'x' });
    res.send(new ApiResponse(200, data, 'X Direct Login disconnected'));
});
