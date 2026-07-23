/**
 * Opt-out / stop-word detection for Bulk Number Health (EN/HI/GU).
 * Does not auto-reactivate contacts.
 */
const OPT_OUT_PATTERNS = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bremove\b/i,
  /do\s*not\s*message/i,
  /don'?t\s*message/i,
  /no\s*message/i,
  /not\s*interested/i,
  /\bblock\b/i,
  /બંધ કરો/,
  /મેસેજ ન મોકલો/,
  /हटाओ/,
  /संदेश मत भेजो/,
  /कृपया मैसेज बंद करें/,
];

export function detectOptOutWording(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { matched: false, matchedTerms: [] };
  const matchedTerms = [];
  for (const re of OPT_OUT_PATTERNS) {
    const m = raw.match(re);
    if (m) matchedTerms.push(m[0]);
  }
  return { matched: matchedTerms.length > 0, matchedTerms };
}

export function isOptOutText(text) {
  return detectOptOutWording(text).matched;
}
