import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { resolveAgentToken } from '../services/dataExtractor/discovery/agent/agentToken.service.js';
import { companyScopeAls } from '../utils/companyScopeContext.js';

export const protectDiscoveryAgent = asyncHandler(async (req, res, next) => {
    const plain = req.headers['x-discovery-agent-token']
        || (req.headers.authorization && req.headers.authorization.startsWith('Agent ')
            ? req.headers.authorization.slice(6).trim()
            : '');
    if (!plain) throw new ApiError(401, 'Missing X-Discovery-Agent-Token');

    const tokenDoc = await resolveAgentToken(plain);
    const tokenCompanyId = String(tokenDoc.companyId);

    const claimed = req.headers['x-company-id'] || (req.body && req.body.companyId) || (req.query && req.query.companyId);
    if (claimed != null && String(claimed) && String(claimed) !== tokenCompanyId) {
        throw new ApiError(403, 'Company scope cannot be overridden by agent');
    }

    req.agentToken = tokenDoc;
    req.companyId = tokenDoc.companyId;
    req.user = {
        id: tokenDoc.createdBy || null,
        _id: tokenDoc.createdBy || null,
        isDiscoveryAgent: true,
        agentTokenId: tokenDoc._id,
    };
    return companyScopeAls.run({ companyId: tokenDoc.companyId }, () => next());
});
