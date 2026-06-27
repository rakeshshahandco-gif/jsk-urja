import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { resolveLoginBranding } from '../services/loginBranding.service.js';

function requestBaseUrl(req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    return host ? `${proto}://${host}` : '';
}

export const getPublicBranding = asyncHandler(async (req, res) => {
    const slug = req.params.slug || req.query.slug || req.query.tenant || '';
    const branding = await resolveLoginBranding({
        slug,
        baseUrl: requestBaseUrl(req),
    });
    res.status(200).json(new ApiResponse(200, branding, 'Login branding'));
});
