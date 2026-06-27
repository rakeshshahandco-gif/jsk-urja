const USER_AGENT = 'CRM-Data-Extractor/1.0 (+https://localhost; public-business-data-only)';

function parseRobotsDisallows(text) {
    const lines = String(text || '').split(/\r?\n/);
    const disallows = [];
    let inWildcard = false;

    for (const raw of lines) {
        const line = raw.split('#')[0].trim();
        if (!line) continue;
        const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
        if (agentMatch) {
            const agent = agentMatch[1].trim().toLowerCase();
            inWildcard = agent === '*';
            continue;
        }
        if (!inWildcard) continue;
        const disallowMatch = line.match(/^Disallow:\s*(.*)$/i);
        if (disallowMatch) {
            const path = disallowMatch[1].trim();
            if (path) disallows.push(path);
        }
    }
    return disallows;
}

function pathIsDisallowed(pathname, disallows) {
    for (const rule of disallows) {
        if (rule === '/') return true;
        if (pathname.startsWith(rule)) return true;
    }
    return false;
}

/** Returns false when robots.txt disallows fetching this URL path. */
export async function isUrlAllowedByRobots(url, timeoutMs = 5000) {
    try {
        const u = new URL(url);
        const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
        const res = await fetch(robotsUrl, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'User-Agent': USER_AGENT },
        });
        if (!res.ok) return true;
        const text = await res.text();
        const disallows = parseRobotsDisallows(text);
        return !pathIsDisallowed(u.pathname || '/', disallows);
    } catch {
        return true;
    }
}
