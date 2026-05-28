/**
 * Routes that must NOT require X-Company-Id (auth bootstrap, company master, health).
 * Path is relative to the /api/v1 router (e.g. /auth/login, /companies/active).
 */
const OID = '[a-fA-F0-9]{24}';

export function isCompanyScopeExempt(req) {
    const p = req.path || '';
    const m = req.method;

    if (p === '/health') return true;
    if (p.startsWith('/public')) return true;
    if (p.startsWith('/auth')) return true;
    if (p.startsWith('/saas')) return true;   // SaaS super admin routes are company-scope exempt
    if (p.startsWith('/platform-feature-settings')) return true;

    if (p === '/companies/active' && m === 'GET') return true;
    if (p === '/companies' && (m === 'GET' || m === 'POST')) return true;
    if (p === '/companies/upload-logo' && m === 'POST') return true;
    if (m === 'GET' && new RegExp(`^/companies/${OID}$`).test(p)) return true;
    if (m === 'PUT' && new RegExp(`^/companies/${OID}$`).test(p)) return true;
    if (m === 'PATCH' && new RegExp(`^/companies/${OID}/toggle-active$`).test(p)) return true;

    // FY master is global (shared across companies) — must load without X-Company-Id
    if (p === '/financial-years' && m === 'GET') return true;
    if (p === '/financial-years/current' && m === 'GET') return true;

    return false;
}