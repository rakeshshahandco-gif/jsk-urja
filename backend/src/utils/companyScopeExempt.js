/**
 * Routes that must NOT require X-Company-Id (auth bootstrap, company master, health).
 * Path is relative to the /api/v1 router (e.g. /auth/login, /companies/active).
 * Also accepts full /api/v1/... paths (HTTP test apps that mount scope at app root).
 */
const OID = '[a-fA-F0-9]{24}';

function normalizeApiV1Path(req) {
    let p = req.path || '';
    if (p.startsWith('/api/v1')) p = p.slice('/api/v1'.length) || '/';
    return p;
}

function hasDiscoveryAgentTokenHeader(req) {
    const headers = req.headers || {};
    if (headers['x-discovery-agent-token']) return true;
    const auth = headers.authorization || '';
    return typeof auth === 'string' && auth.startsWith('Agent ');
}

/**
 * Agent-facing Discovery Agent routes authenticate via X-Discovery-Agent-Token.
 * Company scope is derived from the token record in protectDiscoveryAgent —
 * do NOT require X-Company-Id before agent auth (bootstrap / connect contract).
 * CRM JWT routes under /discovery/agent/tokens (and job create/list/control) stay company-scoped.
 */
export function isDiscoveryAgentFacingPath(req) {
    const p = normalizeApiV1Path(req);
    const m = req.method;

    if (!p.startsWith('/data-extractor/discovery/agent')) return false;
    if (p.startsWith('/data-extractor/discovery/agent/tokens')) return false;

    if (p === '/data-extractor/discovery/agent/connect' && m === 'POST') return true;
    if (p === '/data-extractor/discovery/agent/presence' && m === 'POST') return true;
    if (p.startsWith('/data-extractor/discovery/agent/assisted-captures')) return true;
    if (
        m === 'POST'
        && new RegExp(`^/data-extractor/discovery/agent/jobs/${OID}/(claim|heartbeat|records)$`).test(p)
    ) {
        return true;
    }
    // Shared GET /jobs/:id — only skip X-Company-Id when the caller presents an agent token
    // (CRM JWT callers still need company scope).
    if (
        m === 'GET'
        && new RegExp(`^/data-extractor/discovery/agent/jobs/${OID}$`).test(p)
        && hasDiscoveryAgentTokenHeader(req)
    ) {
        return true;
    }
    return false;
}

export function isCompanyScopeExempt(req) {
    const p = normalizeApiV1Path(req);
    const m = req.method;

    // Discovery Agent auth-derived company (must run before X-Company-Id requirement)
    if (isDiscoveryAgentFacingPath(req)) return true;

    if (p === '/health') return true;
    if (p.startsWith('/public')) return true;
    if (p.startsWith('/auth')) return true;
    if (p.startsWith('/saas')) return true;   // SaaS super admin routes are company-scope exempt
    if (p.startsWith('/platform-feature-settings')) return true;
    if (p.startsWith('/module-locks')) return true;
    if (p.startsWith('/industry-templates')) return true;
    if (p.startsWith('/module-allocation')) return true;
    if (p.startsWith('/customer-template-field-settings')) return true;
    if (p.startsWith('/supplier-template-field-settings')) return true;
    if (p.startsWith('/item-template-field-settings')) return true;
    if (p === '/item-images/meta' && m === 'GET') return true;
    if (p === '/item-images/eligibility' && m === 'GET') return true;
    if (p.startsWith('/documents-kyc-template-settings')) return true;
    if (p.startsWith('/workflow-masters')) return true;
    if (p.startsWith('/company-workflow-assignment')) return true;

    if (p === '/companies/active' && m === 'GET') return true;
    if (p === '/companies' && (m === 'GET' || m === 'POST')) return true;
    if (p === '/companies/upload-logo' && m === 'POST') return true;
    if (m === 'GET' && new RegExp(`^/companies/${OID}$`).test(p)) return true;
    if (m === 'PUT' && new RegExp(`^/companies/${OID}$`).test(p)) return true;
    if (m === 'PATCH' && new RegExp(`^/companies/${OID}/toggle-active$`).test(p)) return true;

    // FY master is global (shared across companies) — must load without X-Company-Id
    if (p === '/financial-years' && m === 'GET') return true;
    if (p === '/financial-years/current' && m === 'GET') return true;

    // Platform backup/restore is whole-database (superadmin) — not company-scoped
    if (p.startsWith('/backups')) return true;

    return false;
}