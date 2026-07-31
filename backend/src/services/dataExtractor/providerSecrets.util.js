/** Mask and strip provider secrets before returning settings to the frontend. */

export function maskApiKey(key) {
    const s = String(key || '').trim();
    if (!s) return '';
    if (s.length <= 4) return '\u2022\u2022\u2022\u2022';
    return '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' + s.slice(-4);
}

export function isBlank(value) {
    if (value == null) return true;
    if (typeof value === 'string') return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/** Prefer existing non-empty values; never replace with empty/lower-confidence blanks. */
export function preferNonEmpty(existing, incoming) {
    if (isBlank(incoming)) return existing;
    if (isBlank(existing)) return incoming;
    return existing;
}

export function preferNonEmptyPreferIncoming(existing, incoming) {
    if (isBlank(incoming)) return existing;
    if (isBlank(existing)) return incoming;
    return incoming;
}

/**
 * Clone settings for API responses: strip full API keys; expose masked hints only.
 * Never send full keys to the frontend after save.
 */
export function sanitizeExtractorSettingsForClient(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    const out = { ...settings };
    const connectors = { ...(out.sourceConnectors || {}) };

    if (connectors.google) {
        const g = { ...connectors.google };
        if (g.cseApiKey) {
            g.cseApiKeyMasked = maskApiKey(g.cseApiKey);
            delete g.cseApiKey;
        }
        if (g.placesApiKey) {
            g.placesApiKeyMasked = maskApiKey(g.placesApiKey);
            delete g.placesApiKey;
        }
        connectors.google = g;
    }

    if (connectors.brave) {
        const b = { ...connectors.brave };
        if (b.apiKey) {
            b.apiKeyMasked = maskApiKey(b.apiKey);
            delete b.apiKey;
        }
        connectors.brave = b;
    }

    if (connectors.serpapi) {
        const s = { ...connectors.serpapi };
        if (s.apiKey) {
            s.apiKeyMasked = maskApiKey(s.apiKey);
            delete s.apiKey;
        }
        connectors.serpapi = s;
    }

    out.sourceConnectors = connectors;
    return out;
}
