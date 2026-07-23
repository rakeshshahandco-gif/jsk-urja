/**
 * Phase 1C.1 — Language detection with confidence (script + light lexicon).
 */

const GU_WORDS = ['નમસ્તે', 'નમસ્કાર', 'કિંમત', 'ભાવ', 'જોઈએ', 'મદદ', 'કેટલા'];
const HI_WORDS = ['नमस्ते', 'नमस्कार', 'कीमत', 'भाव', 'चाहिए', 'मदद', 'कितना'];
const EN_WORDS = ['hello', 'price', 'quotation', 'driver', 'need', 'please', 'watt', 'stock'];

function countChars(text, re) {
    const m = String(text || '').match(re);
    return m ? m.length : 0;
}

function wordHits(text, words) {
    const lower = String(text || '').toLowerCase();
    let n = 0;
    for (const w of words) {
        if (lower.includes(w.toLowerCase()) || text.includes(w)) n += 1;
    }
    return n;
}

/**
 * @param {string} text
 * @returns {{ code: 'en'|'hi'|'gu'|'mixed', confidence: number, scores: object, scriptHints: object }}
 */
export function detectLanguageDetailed(text = '') {
    const raw = String(text || '');
    const guChars = countChars(raw, /[\u0A80-\u0AFF]/g);
    const hiChars = countChars(raw, /[\u0900-\u097F]/g);
    const latinChars = countChars(raw, /[A-Za-z]/g);
    const totalScript = guChars + hiChars + latinChars;

    const guLex = wordHits(raw, GU_WORDS);
    const hiLex = wordHits(raw, HI_WORDS);
    const enLex = wordHits(raw, EN_WORDS);

    const scores = {
        gu: (totalScript ? guChars / totalScript : 0) * 0.7 + Math.min(1, guLex / 3) * 0.3,
        hi: (totalScript ? hiChars / totalScript : 0) * 0.7 + Math.min(1, hiLex / 3) * 0.3,
        en: (totalScript ? latinChars / totalScript : 0) * 0.7 + Math.min(1, enLex / 3) * 0.3,
    };

    if (!raw.trim()) {
        return {
            code: 'en',
            confidence: 0.3,
            scores,
            scriptHints: { guChars, hiChars, latinChars },
        };
    }

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topCode, topScore] = ranked[0];
    const secondScore = ranked[1][1];

    let code = topCode;
    let confidence = Math.max(0.35, Math.min(0.99, topScore));

    // Mixed: significant secondary script/lexicon
    const significant = ranked.filter(([, s]) => s >= 0.22);
    if (significant.length >= 2 && secondScore >= 0.22 && (topScore - secondScore) < 0.25) {
        code = 'mixed';
        confidence = Math.max(0.4, Math.min(0.9, (topScore + secondScore) / 2));
    }

    return {
        code,
        confidence: Number(confidence.toFixed(3)),
        scores: {
            en: Number(scores.en.toFixed(3)),
            hi: Number(scores.hi.toFixed(3)),
            gu: Number(scores.gu.toFixed(3)),
        },
        scriptHints: { guChars, hiChars, latinChars },
    };
}

/** @returns {'en'|'hi'|'gu'} primary code for legacy entity map */
export function detectPrimaryLanguageCode(text) {
    const d = detectLanguageDetailed(text);
    if (d.code === 'mixed') {
        const ranked = Object.entries(d.scores).sort((a, b) => b[1] - a[1]);
        return ranked[0][0];
    }
    return d.code;
}

export default detectLanguageDetailed;
