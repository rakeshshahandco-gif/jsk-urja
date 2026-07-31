/**
 * Multi-address extraction from public contact/about HTML (CP6 address enhancement only).
 * Does not invent addresses — only labelled / structured blocks with city or PIN evidence.
 */

const OFFICE_TYPE_PATTERNS = [
    { type: 'Registered/Office', re: /\b(registered\s+office|head\s+office|corporate\s+office|ho\b|main\s+office)\b/i },
    { type: 'Experience Point', re: /\b(experience\s+point|experience\s+centre|experience\s+center)\b/i },
    { type: 'Showroom', re: /\b(showroom|experience\s+studio)\b/i },
    { type: 'Branch Office', re: /\b(branch\s+office|branch)\b/i },
    { type: 'Office', re: /\b([a-z]+)\s+office\b/i },
    { type: 'Manufacturing', re: /\b(manufacturing|factory|plant|production\s+unit)\b/i },
    { type: 'Warehouse', re: /\b(warehouse|godown)\b/i },
    { type: 'Service Centre', re: /\b(service\s+centre|service\s+center|service\s+hub)\b/i },
    { type: 'Office', re: /\b(address|location|contact\s+us|get\s+in\s+touch)\b/i },
];

const CITY_PIN_HINTS = [
    { city: 'Gurugram', state: 'Haryana', re: /\b(gurugram|gurgaon)\b/i, pins: [/^122/] },
    { city: 'Noida', state: 'Uttar Pradesh', re: /\bnoida\b/i, pins: [/^201/] },
    { city: 'Delhi', state: 'Delhi', re: /\b(new\s+delhi|delhi|bijwasan)\b/i, pins: [/^110/] },
    { city: 'Bengaluru', state: 'Karnataka', re: /\b(bengaluru|bangalore|bengaluru\s+urban)\b/i, pins: [/^560/] },
    { city: 'Mumbai', state: 'Maharashtra', re: /\b(mumbai|bombay)\b/i, pins: [/^400/] },
    { city: 'Pune', state: 'Maharashtra', re: /\bpune\b/i, pins: [/^411/] },
    { city: 'Hyderabad', state: 'Telangana', re: /\bhyderabad\b/i, pins: [/^500/] },
    { city: 'Chennai', state: 'Tamil Nadu', re: /\bchennai\b/i, pins: [/^600/] },
    { city: 'Kolkata', state: 'West Bengal', re: /\b(kolkata|calcutta)\b/i, pins: [/^700/] },
    { city: 'Ahmedabad', state: 'Gujarat', re: /\bahmedabad\b/i, pins: [/^380/] },
];

function htmlToVisibleText(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h\d|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#?\w+;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function detectOfficeType(labelText) {
    const t = String(labelText || '');
    for (const row of OFFICE_TYPE_PATTERNS) {
        if (row.re.test(t)) {
            if (row.type === 'Office' && /\bnoida\b/i.test(t)) return 'Office';
            return row.type;
        }
    }
    return 'Office';
}

function inferCityState(raw) {
    const text = String(raw || '');
    const pin = (text.match(/\b(\d{6})\b/) || [])[1] || '';
    for (const hint of CITY_PIN_HINTS) {
        if (hint.re.test(text)) {
            return { city: hint.city, state: hint.state, pinCode: pin, country: 'India' };
        }
        if (pin && hint.pins.some((p) => p.test(pin))) {
            return { city: hint.city, state: hint.state, pinCode: pin, country: 'India' };
        }
    }
    // Generic "City State – PIN" / "City, State PIN"
    const m = text.match(
        /([A-Za-z][A-Za-z .]{2,40}?)\s*[,–-]\s*([A-Za-z][A-Za-z .]{2,40}?)\s*[–-]?\s*(\d{6})\b/,
    );
    if (m) {
        return {
            city: m[1].trim(),
            state: m[2].trim(),
            pinCode: m[3],
            country: 'India',
        };
    }
    if (pin) return { city: '', state: '', pinCode: pin, country: 'India' };
    return { city: '', state: '', pinCode: '', country: '' };
}

function normalizeAddressKey(raw) {
    return String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 180);
}

/**
 * Deduplicate address objects by normalized raw text.
 */
export function dedupeAddresses(list = []) {
    const out = [];
    const seen = new Set();
    for (const a of list) {
        if (!a || !String(a.raw || '').trim()) continue;
        const key = normalizeAddressKey(a.raw);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(a);
    }
    return out;
}

/**
 * Extract labelled address blocks from HTML (contact / locations pages).
 */
export function extractLabeledAddressesFromHtml(html, pageUrl = '') {
    const text = htmlToVisibleText(html);
    if (!text || text.length < 20) return [];

    const found = [];
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

    const labelLineRe =
        /^(Head\s+Office|Registered\s+Office|Corporate\s+Office|Branch\s+Office|Experience\s+Point|Experience\s+Centre|Experience\s+Center|Showroom|Manufacturing|Factory|Warehouse|Service\s+Centre|Service\s+Center|[A-Za-z][A-Za-z .]{0,24}\s+[Oo]ffice|Address|Location)\s*[-:]?\s*(.*)$/i;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const m = labelLineRe.exec(line);
        if (!m) continue;
        const label = String(m[1] || '').trim();
        let body = String(m[2] || '').trim();
        // If label-only line, take following line(s) until next label / blank-ish break
        if (body.length < 12) {
            const parts = [];
            for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
                if (labelLineRe.test(lines[j])) break;
                if (lines[j].length < 8) break;
                parts.push(lines[j]);
                // Prefer stop after a PIN-bearing line
                if (/\b\d{6}\b/.test(lines[j])) break;
            }
            body = parts.join(', ').trim();
        }
        if (body.length < 12) continue;
        if (!/\d/.test(body) && !inferCityState(body).city) continue;
        const geo = inferCityState(`${label} ${body}`);
        if (!geo.city && !geo.pinCode && body.length < 25) continue;
        found.push({
            raw: body.slice(0, 1000),
            city: geo.city,
            state: geo.state,
            country: geo.country || 'India',
            pinCode: geo.pinCode || '',
            type: detectOfficeType(label),
            evidenceLabel: label.replace(/[-:]\s*$/, '').trim().slice(0, 120),
            confidence: geo.city || geo.pinCode ? 'high' : 'medium',
            sourceUrl: pageUrl || '',
        });
    }

    // Fallback: lines containing PIN codes (Indian 6-digit)
    if (!found.length) {
        const pinLines = lines.filter((l) => /\b\d{6}\b/.test(l) && l.length >= 20 && l.length <= 300);
        for (const line of pinLines.slice(0, 8)) {
            const geo = inferCityState(line);
            if (!geo.city && !geo.pinCode) continue;
            found.push({
                raw: line.slice(0, 1000),
                city: geo.city,
                state: geo.state,
                country: geo.country || 'India',
                pinCode: geo.pinCode || '',
                type: 'Office',
                evidenceLabel: 'Address',
                confidence: geo.city ? 'medium' : 'low',
                sourceUrl: pageUrl || '',
            });
        }
    }

    return dedupeAddresses(found).slice(0, 20);
}

/**
 * Merge JSON-LD + labelled addresses; prefer richer structured fields.
 */
export function mergeAddressLists(...lists) {
    return dedupeAddresses(lists.flat().filter(Boolean));
}
