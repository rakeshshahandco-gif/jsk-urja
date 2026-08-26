import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    getSocialSourceStatus,
    startSocialExtraction,
    ingestPublicSocialUrl,
    connectDirect,
    disconnectDirect,
    listSocialCaptures,
    exportSocialCaptures,
    enrichInstagramCapturedWebsites,
    stopInstagramExtraction,
    stopFacebookExtraction,
    pauseFacebookExtraction,
    facebookExtractProgress,
    findFacebookGroups,
    listJoinedFacebookGroups,
    lookupExactFacebookGroup,
    getFacebookMemberCampaign,
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
        groupUrl: req.body.groupUrl,
        groupName: req.body.groupName,
        collectorMode: req.body.collectorMode,
        reviewPriority: req.body.reviewPriority,
        autoReviewAfterDiscovery: req.body.autoReviewAfterDiscovery,
    });
    res.send(new ApiResponse(200, data, data.started
        ? 'Automatic Facebook group collection started'
        : (data.alreadyRunning
            ? (data.message || 'This group collection is already running.')
            : (data.ingested ? 'Facebook candidates sent to Processing' : 'No Facebook candidates found'))));
});

export const facebookStop = asyncHandler(async (req, res) => {
    const data = stopFacebookExtraction({ companyId: req.companyId, user: req.user });
    res.send(new ApiResponse(200, data, data.stopRequested ? 'Facebook extract stop requested' : 'No Facebook extract was running'));
});

export const facebookPause = asyncHandler(async (req, res) => {
    const data = pauseFacebookExtraction({ companyId: req.companyId, user: req.user });
    res.send(new ApiResponse(200, data, data.pauseRequested ? 'Facebook extract pause requested' : 'No Facebook extract was running'));
});

export const facebookProgress = asyncHandler(async (req, res) => {
    const data = facebookExtractProgress({ companyId: req.companyId, user: req.user });
    res.send(new ApiResponse(200, data, data.running ? 'Facebook extract running' : 'No Facebook extract is running'));
});

export const facebookFindGroups = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await findFacebookGroups({
        companyId: req.companyId,
        user: req.user,
        keyword: req.body.keyword,
        location: req.body.location || req.body.city || '',
    });
    res.send(new ApiResponse(200, data, data.groups?.length ? 'Facebook groups found' : 'No Facebook groups found'));
});

export const facebookJoinedGroups = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await listJoinedFacebookGroups({
        companyId: req.companyId,
        user: req.user,
        groupId: req.body.groupId || req.body.q || '',
        q: req.body.q || req.body.groupId || '',
    });
    res.send(new ApiResponse(200, data, data.groups?.length ? 'Joined Facebook groups' : 'No joined Facebook groups found'));
});

export const facebookExactGroup = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await lookupExactFacebookGroup({
        companyId: req.companyId,
        user: req.user,
        groupId: req.body.groupId || req.body.q || '',
        groupUrl: req.body.groupUrl || '',
        q: req.body.q || req.body.groupId || req.body.groupUrl || '',
    });
    res.send(new ApiResponse(200, data, data.ok ? 'Exact Facebook group verified' : (data.error || 'Exact Facebook group was not verified')));
});

export const facebookMemberCampaign = asyncHandler(async (req, res) => {
    const data = await getFacebookMemberCampaign({
        companyId: req.companyId,
        user: req.user,
        groupUrl: req.query.groupUrl || '',
        keyword: req.query.keyword || '',
    });
    res.send(new ApiResponse(200, data, 'Facebook group member campaign'));
});

export const facebookCaptures = asyncHandler(async (req, res) => {
    const data = await listSocialCaptures({
        companyId: req.companyId,
        user: req.user,
        platform: 'facebook',
        keyword: req.query.keyword || '',
        location: req.query.location || req.query.city || '',
        campaignId: req.query.campaignId || '',
        groupUrl: req.query.groupUrl || '',
        page: req.query.page,
        limit: req.query.limit,
        q: req.query.q || req.query.search || '',
        memberFilter: req.query.memberFilter || req.query.filter || '',
    });
    res.send(new ApiResponse(200, data, 'Facebook captured results'));
});

export const facebookCapturesExport = asyncHandler(async (req, res) => {
    const data = await exportSocialCaptures({
        companyId: req.companyId,
        user: req.user,
        platform: 'facebook',
        keyword: req.query.keyword || '',
        location: req.query.location || req.query.city || '',
        campaignId: req.query.campaignId || '',
        groupUrl: req.query.groupUrl || '',
        format: req.query.format,
        scope: req.query.scope || '',
    });
    res.setHeader('Content-Type', data.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
    res.setHeader('X-Export-Count', String(data.count));
    res.setHeader('X-Export-Total', String(data.total ?? data.count));
    res.setHeader('X-Export-Capped', data.capped ? 'true' : 'false');
    res.send(data.content);
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

export const instagramStop = asyncHandler(async (req, res) => {
    const data = stopInstagramExtraction({ companyId: req.companyId, user: req.user });
    res.send(new ApiResponse(200, data, data.stopRequested ? 'Instagram extract stop requested' : 'No Instagram extract was running'));
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

export const instagramCaptures = asyncHandler(async (req, res) => {
    const data = await listSocialCaptures({
        companyId: req.companyId,
        user: req.user,
        platform: 'instagram',
        keyword: req.query.keyword || '',
        location: req.query.location || req.query.city || '',
        campaignId: req.query.campaignId || '',
        page: req.query.page,
        limit: req.query.limit,
    });
    res.send(new ApiResponse(200, data, 'Instagram captured results'));
});

export const instagramCapturesExport = asyncHandler(async (req, res) => {
    const data = await exportSocialCaptures({
        companyId: req.companyId,
        user: req.user,
        platform: 'instagram',
        keyword: req.query.keyword || '',
        location: req.query.location || req.query.city || '',
        campaignId: req.query.campaignId || '',
        format: req.query.format,
    });
    res.setHeader('Content-Type', data.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
    res.setHeader('X-Export-Count', String(data.count));
    res.setHeader('X-Export-Total', String(data.total ?? data.count));
    res.setHeader('X-Export-Capped', data.capped ? 'true' : 'false');
    res.send(data.content);
});

export const instagramCapturesEnrichWebsites = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await enrichInstagramCapturedWebsites({
        companyId: req.companyId,
        user: req.user,
        keyword: req.body.keyword || req.query.keyword || '',
        location: req.body.location || req.body.city || req.query.location || '',
        campaignId: req.body.campaignId || req.query.campaignId || '',
        captureIds: req.body.captureIds || [],
        sessionId: req.body.sessionId || '',
    });
    res.send(new ApiResponse(200, data, 'Instagram website enrichment finished'));
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

export const linkedinTestPublicUrl = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await ingestPublicSocialUrl({
        companyId: req.companyId,
        user: req.user,
        headers: req.headers,
        platform: 'linkedin',
        publicUrl: req.body.publicUrl || req.body.url,
        website: req.body.website || req.body.knownWebsite || '',
        keyword: req.body.keyword || '',
        location: req.body.location || req.body.city || '',
        title: req.body.title || '',
        snippet: req.body.snippet || '',
        testOnly: req.body.testOnly,
    });
    res.send(new ApiResponse(200, data, data.duplicate ? 'LinkedIn public URL already in Processing (updated)' : 'LinkedIn public URL sent to Processing'));
});

export const xTestPublicUrl = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const data = await ingestPublicSocialUrl({
        companyId: req.companyId,
        user: req.user,
        headers: req.headers,
        platform: 'x',
        publicUrl: req.body.publicUrl || req.body.url,
        website: req.body.website || req.body.knownWebsite || '',
        keyword: req.body.keyword || '',
        location: req.body.location || req.body.city || '',
        title: req.body.title || '',
        snippet: req.body.snippet || '',
        testOnly: req.body.testOnly,
    });
    res.send(new ApiResponse(200, data, data.duplicate ? 'X public URL already in Processing (updated)' : 'X public URL sent to Processing'));
});
