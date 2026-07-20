import { Company } from '../models/company.model.js';
import {
    canUserAccessCompany,
    resolvePreferredCompanyId,
    userCanSwitchCompany,
} from '../services/companyUserAccess.service.js';
import { getLocalAppIdentity } from '../utils/localAppIdentity.js';
import config from '../config/config.js';

/**
 * Build safe company-context fields for login / getMe / active-context.
 */
export async function buildUserCompanyContext(user, { activeCompanyId = null } = {}) {
    const preferredId = resolvePreferredCompanyId(user);
    const assignedIds = (user.assignedCompanyIds || []).map((id) => String(id));

    let activeId = activeCompanyId ? String(activeCompanyId) : null;
    if (activeId && !canUserAccessCompany(user, activeId)) {
        activeId = null;
    }
    if (!activeId) {
        activeId = preferredId;
    }

    const idsToLoad = [...new Set([
        ...assignedIds,
        preferredId,
        activeId,
    ].filter(Boolean))];

    const companies = idsToLoad.length
        ? await Company.find({ _id: { $in: idsToLoad } })
            .select('companyName legalName brandName isDefault isActive industryTemplateRef')
            .lean()
        : [];

    const byId = Object.fromEntries(companies.map((c) => [String(c._id), c]));
    const mapCompany = (id) => {
        if (!id || !byId[id]) return null;
        const c = byId[id];
        return {
            _id: String(c._id),
            companyName: c.companyName || c.legalName || '',
            legalName: c.legalName || '',
            brandName: c.brandName || '',
            isDefault: Boolean(c.isDefault),
            isActive: c.isActive !== false,
        };
    };

    return {
        assignedCompanyIds: assignedIds,
        companyAccessConfigured: user.companyAccessConfigured === true,
        defaultCompanyId: user.defaultCompanyId ? String(user.defaultCompanyId) : null,
        canSwitchCompany: userCanSwitchCompany(user),
        preferredCompanyId: preferredId,
        defaultCompany: mapCompany(preferredId || (user.defaultCompanyId ? String(user.defaultCompanyId) : null)),
        assignedCompanies: assignedIds.map(mapCompany).filter(Boolean),
        activeCompanyId: activeId,
        activeCompany: mapCompany(activeId),
        accountType: user.accountType || null,
        applicationIdentity: config.env === 'development'
            ? getLocalAppIdentity({ mongoUrl: config.mongoose.url, port: config.port })
            : null,
    };
}

export default buildUserCompanyContext;
