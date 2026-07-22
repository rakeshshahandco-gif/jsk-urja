/**
 * Phase 1C.0 — Entity extractor framework (deterministic keyword heuristics).
 * No LLM. Expandable later without changing orchestrator contract.
 */

import { emptyEntityMap } from './entitySchema.js';

const PRODUCT_PATTERNS = [
    { re: /\bdali\s*driver\b/i, name: 'DALI Driver' },
    { re: /\bphase\s*cut\s*driver\b/i, name: 'Phase Cut Driver' },
    { re: /\bble\s*mesh\s*driver\b/i, name: 'BLE Mesh Driver' },
    { re: /\bzigbee\s*driver\b/i, name: 'Zigbee Driver' },
    { re: /\bsmart\s*switch\b/i, name: 'Smart Switch' },
    { re: /\bscene\s*controller\b/i, name: 'Scene Controller' },
    { re: /\bdali\b/i, name: 'DALI Driver' },
];

function detectLanguage(text = '') {
    const s = String(text || '');
    if (/[\u0A80-\u0AFF]/.test(s)) return 'gu';
    if (/[\u0900-\u097F]/.test(s)) return 'hi';
    return 'en';
}

/** @returns {{ extract: (text: string, hints?: object) => object }} */
export function createEntityExtractor() {
    return {
        extract(text, hints = {}) {
            const raw = String(text || '');
            const lower = raw.toLowerCase();
            const language = hints.language || detectLanguage(raw);
            const entities = emptyEntityMap(language);

            for (const p of PRODUCT_PATTERNS) {
                if (p.re.test(raw)) {
                    entities.productName = p.name;
                    break;
                }
            }

            const qty = raw.match(/\b(\d{1,5})\s*(pcs|pieces|nos|qty|units?)\b/i)
                || raw.match(/\bqty[:\s]*(\d{1,5})\b/i);
            if (qty) entities.quantity = Number(qty[1]);

            const watt = raw.match(/\b(\d{1,4})\s*w(att)?s?\b/i);
            if (watt) entities.wattage = Number(watt[1]);

            const volt = raw.match(/\b(\d{2,3})\s*v(olt)?s?\b/i);
            if (volt) entities.voltage = Number(volt[1]);

            const amp = raw.match(/\b(\d+(?:\.\d+)?)\s*(a|amp|amps|ma)\b/i);
            if (amp) entities.current = amp[0];

            entities.dt6 = /\bdt\s*6\b/i.test(lower);
            entities.dt8 = /\bdt\s*8\b/i.test(lower);
            entities.ble = /\bble\b/i.test(lower);
            entities.zigbee = /\bzigbee\b/i.test(lower);
            entities.wifi = /\bwi[-\s]?fi\b/i.test(lower);

            const cct = raw.match(/\b(\d{3,4})\s*k\b/i);
            if (cct) entities.colourTemperature = Number(cct[1]);

            const company = raw.match(/\b(?:from|company|for)\s+([A-Z][A-Za-z0-9 &.\-]{2,60})/);
            if (company) entities.customerCompany = company[1].trim();

            return entities;
        },
    };
}

export default createEntityExtractor;
