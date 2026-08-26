/**
 * Downstream backlog picker: exclude already-processed IDs first, then apply batch limit.
 * Used by CP7 (enrichments awaiting qualification) and CP8 (qualifications awaiting genuineness).
 * Pure helper — callers supply ordered candidate ids and already-done ids.
 */
export function pickIdsAwaitingDownstream(candidateIdsOldestFirst = [], alreadyDoneIds = [], limit = 10) {
    const cap = Math.max(1, Number(limit) || 10);
    const done = new Set(
        (alreadyDoneIds || []).map((id) => String(id || '').trim()).filter(Boolean),
    );
    const out = [];
    for (const id of candidateIdsOldestFirst || []) {
        if (id == null || id === '') continue;
        if (done.has(String(id))) continue;
        out.push(id);
        if (out.length >= cap) break;
    }
    return out;
}
