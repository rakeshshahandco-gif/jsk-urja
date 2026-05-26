/**
 * Pure matching/scoring for bank reconciliation (no DB).
 */

export const DATE_TOLERANCE_PRESETS = {
    exact: 0,
    plusMinus1: 1,
    plusMinus3: 3,
    plusMinus7: 7,
};

export const DEFAULT_MATCH_CONFIG = {
    dateToleranceDays: DATE_TOLERANCE_PRESETS.plusMinus3,
    amountToleranceAbs: 0.01,
    amountTolerancePct: 0,
    autoThreshold: 85,
    possibleThreshold: 55,
};

/** Bank ledger: Debit = deposit, Credit = withdrawal */
export function ledgerTypeToMovement(ledgerEntryType) {
    return ledgerEntryType === 'Debit' ? 'Deposit' : 'Withdrawal';
}

export function normalizeText(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function tokenSet(s) {
    const n = normalizeText(s);
    if (!n) return new Set();
    return new Set(n.split(' ').filter((t) => t.length > 1));
}

/** Dice coefficient 0–1 */
export function textSimilarity(a, b) {
    const sa = tokenSet(a);
    const sb = tokenSet(b);
    if (!sa.size && !sb.size) return 0;
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    for (const t of sa) {
        if (sb.has(t)) inter += 1;
    }
    return (2 * inter) / (sa.size + sb.size);
}

export function amountsMatch(amountA, amountB, config = DEFAULT_MATCH_CONFIG) {
    const a = Math.abs(Number(amountA) || 0);
    const b = Math.abs(Number(amountB) || 0);
    const diff = Math.abs(a - b);
    const pctTol = (config.amountTolerancePct || 0) * Math.max(a, b);
    const tol = Math.max(config.amountToleranceAbs || 0.01, pctTol);
    return diff <= tol;
}

export function daysBetween(a, b) {
    if (!a || !b) return null;
    const d1 = new Date(a);
    const d2 = new Date(b);
    return Math.abs(Math.round((d1 - d2) / (24 * 60 * 60 * 1000)));
}

export function dateScoreDays(bookDate, bankDate, toleranceDays) {
    const days = daysBetween(bookDate, bankDate);
    if (days == null) return 0;
    const tol = toleranceDays ?? DEFAULT_MATCH_CONFIG.dateToleranceDays;
    if (days === 0) return 1;
    if (days <= tol) return 1 - days / (tol + 1);
    if (days <= tol * 3) return Math.max(0, 0.35 - (days - tol) / (tol * 6));
    return 0;
}

export function refBoost(book, bank) {
    let boost = 0;
    const utrB = normalizeText(bank.utrRef);
    const utrBk = normalizeText(book.bankReference || book.utrRef);
    if (utrB && utrBk && (utrB === utrBk || utrB.includes(utrBk) || utrBk.includes(utrB))) {
        boost += 0.35;
    }
    const chB = normalizeText(bank.chequeNo);
    const chBk = normalizeText(book.instrumentNo || book.chequeNo);
    if (chB && chBk && chB === chBk) boost += 0.25;
    return Math.min(boost, 0.5);
}

/**
 * Priority 1–5 per spec (higher priority = lower number).
 */
export function matchPriority(book, bank, config = DEFAULT_MATCH_CONFIG) {
    if (book.movement !== bank.drCr) return { priority: 99, reasons: ['direction_mismatch'] };
    if (!amountsMatch(book.amount, bank.amount, config)) {
        return { priority: 99, reasons: ['amount_mismatch'] };
    }

    const days = daysBetween(book.date, bank.txnDate) ?? 999;
    const tol = config.dateToleranceDays ?? DEFAULT_MATCH_CONFIG.dateToleranceDays;
    const ref = refBoost(book, bank);
    const hasRef = ref >= 0.25;
    const exactDate = days === 0;
    const nearDate = days <= tol;

    const narr = textSimilarity(
        [book.narration, book.partyName, book.voucherNo].filter(Boolean).join(' '),
        [bank.narration, bank.counterpartyName, bank.utrRef].filter(Boolean).join(' '),
    );

    if (exactDate && hasRef) return { priority: 1, reasons: ['exact_amount_date_reference'], days, narr, ref };
    if (nearDate && hasRef) return { priority: 2, reasons: ['exact_amount_near_date_reference'], days, narr, ref };
    if (exactDate && narr >= 0.35) return { priority: 3, reasons: ['exact_amount_date_narration'], days, narr, ref };
    if (nearDate && narr >= 0.25) return { priority: 4, reasons: ['exact_amount_near_date_narration'], days, narr, ref };
    if (nearDate || narr >= 0.2) return { priority: 5, reasons: ['exact_amount_possible_combo'], days, narr, ref };
    return { priority: 6, reasons: ['weak_match'], days, narr, ref };
}

/**
 * Score 0–100 between one book line and one bank line.
 */
export function scorePair(book, bank, config = DEFAULT_MATCH_CONFIG) {
    const { priority, reasons, days, narr, ref } = matchPriority(book, bank, config);
    if (priority >= 99) return { score: 0, reasons, matchPriority: priority, dateDifferenceDays: days, narrationSimilarity: narr, amountDifference: Math.abs((book.amount || 0) - (bank.amount || 0)) };

    const datePart = dateScoreDays(book.date, bank.txnDate, config.dateToleranceDays);
    const raw = datePart * 0.35 + (narr || 0) * 0.4 + (ref || 0);
    const priorityBoost = Math.max(0, (6 - priority) * 8);
    const score = Math.round(Math.min(100, raw * 100 + priorityBoost));
    return {
        score,
        reasons,
        matchPriority: priority,
        dateDifferenceDays: days ?? 0,
        narrationSimilarity: Math.round((narr || 0) * 100),
        amountDifference: 0,
    };
}

export function classifyScore(score, config = DEFAULT_MATCH_CONFIG) {
    if (score >= config.autoThreshold) return 'Auto';
    if (score >= config.possibleThreshold) return 'Possible';
    return 'Unmatched';
}

/**
 * Greedy best-match suggestions (does not persist).
 */
export function suggestMatches(bookLines, bankLines, config = DEFAULT_MATCH_CONFIG) {
    const suggestions = [];
    const usedBook = new Set();
    const usedBank = new Set();

    const skipBank = new Set(['Reconciled', 'Ignored', 'BankCharge', 'Duplicate']);
    const pairs = [];
    for (const bank of bankLines) {
        if (skipBank.has(bank.matchStatus)) continue;
        for (const book of bookLines) {
            if (book.reconciled && !book.partiallyReconciled) continue;
            const openBook = (book.amount || 0) - (book.reconciledAmount || 0);
            const bookAmt = book.partiallyReconciled ? openBook : book.amount;
            const scored = scorePair({ ...book, amount: bookAmt }, bank, config);
            if (scored.score >= config.possibleThreshold) {
                pairs.push({
                    bankLineId: bank._id,
                    bookRefId: book._id,
                    score: scored.score,
                    matchKind: classifyScore(scored.score, config),
                    matchPriority: scored.matchPriority,
                    matchReasons: scored.reasons,
                    dateDifferenceDays: scored.dateDifferenceDays,
                    narrationSimilarity: scored.narrationSimilarity,
                    amountDifference: scored.amountDifference,
                    confidence: scored.score,
                    book,
                    bank,
                });
            }
        }
    }
    pairs.sort((a, b) => a.matchPriority - b.matchPriority || b.score - a.score);

    for (const p of pairs) {
        const bid = String(p.bankLineId);
        const bk = String(p.bookRefId);
        if (usedBank.has(bid) || usedBook.has(bk)) continue;
        usedBank.add(bid);
        usedBook.add(bk);
        suggestions.push({
            bankLineId: p.bankLineId,
            bookRefId: p.bookRefId,
            confidence: p.confidence,
            matchKind: p.matchKind,
            matchPriority: p.matchPriority,
            matchReasons: p.matchReasons,
            dateDifferenceDays: p.dateDifferenceDays,
            narrationSimilarity: p.narrationSimilarity,
            amountDifference: p.amountDifference,
            bank: p.bank,
            book: p.book,
        });
    }

    const combo = suggestOneToManyCombinations(bookLines, bankLines, config, usedBank, usedBook);
    suggestions.push(...combo);

    return suggestions;
}

/**
 * Simple one-bank to many-book sum match (Priority 5).
 */
export function suggestOneToManyCombinations(bookLines, bankLines, config, usedBank, usedBook) {
    const out = [];
    const tol = config.amountToleranceAbs || 0.01;

    for (const bank of bankLines) {
        if (usedBank?.has(String(bank._id))) continue;
        if (['Reconciled', 'Ignored', 'BankCharge', 'Duplicate'].includes(bank.matchStatus)) continue;

        const candidates = bookLines.filter((b) => {
            if (usedBook?.has(String(b._id))) return false;
            if (b.reconciled && !b.partiallyReconciled) return false;
            return b.movement === bank.drCr;
        });

        if (candidates.length < 2 || candidates.length > 6) continue;

        const target = bank.amount;
        const subset = findAmountSubset(
            candidates.map((b) => ({
                book: b,
                amount: (b.amount || 0) - (b.reconciledAmount || 0),
            })),
            target,
            tol,
        );
        if (!subset || subset.length < 2) continue;

        out.push({
            bankLineId: bank._id,
            matchKind: 'Possible',
            matchPriority: 5,
            matchReasons: ['one_to_many_amount_sum'],
            confidence: 70,
            isCombo: true,
            bookRefIds: subset.map((s) => s.book._id),
            books: subset.map((s) => s.book),
            bank,
            allocatedAmounts: subset.map((s) => ({ bookRefId: s.book._id, amount: s.amount })),
        });
    }
    return out;
}

function findAmountSubset(items, target, tol, maxDepth = 5) {
    const sorted = [...items].sort((a, b) => b.amount - a.amount);
    let best = null;

    function dfs(start, picked, sum) {
        if (picked.length > maxDepth) return;
        if (Math.abs(sum - target) <= tol && picked.length >= 2) {
            best = [...picked];
            return;
        }
        if (sum > target + tol || start >= sorted.length) return;
        for (let i = start; i < sorted.length; i++) {
            picked.push(sorted[i]);
            dfs(i + 1, picked, sum + sorted[i].amount);
            picked.pop();
            if (best) return;
        }
    }
    dfs(0, [], 0);
    return best;
}
