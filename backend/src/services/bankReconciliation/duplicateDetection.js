import crypto from 'crypto';

export function fileContentHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function lineFingerprint({ cashBankAccountId, txnDate, amount, drCr, narration, utrRef, chequeNo }) {
    const d = txnDate instanceof Date ? txnDate.toISOString().slice(0, 10) : String(txnDate || '').slice(0, 10);
    const parts = [
        String(cashBankAccountId),
        d,
        Number(amount).toFixed(2),
        drCr,
        String(narration || '').trim().toLowerCase().slice(0, 80),
        String(utrRef || '').trim().toLowerCase(),
        String(chequeNo || '').trim().toLowerCase(),
    ];
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Find lines in DB that match imported rows (same bank account).
 */
export async function findDuplicateLines(BankStatementLine, cashBankAccountId, lines) {
    if (!lines.length) return { duplicates: [], warnings: [] };

    const fps = lines.map((l) =>
        lineFingerprint({
            cashBankAccountId,
            txnDate: l.txnDate,
            amount: l.amount,
            drCr: l.drCr,
            narration: l.narration,
            utrRef: l.utrRef,
            chequeNo: l.chequeNo,
        }),
    );

    const existing = await BankStatementLine.find({
        cashBankAccountId,
        lineFingerprint: { $in: fps },
        matchStatus: { $ne: 'Duplicate' },
    })
        .select('_id lineFingerprint txnDate amount narration utrRef importId')
        .lean();

    const fpSet = new Set(existing.map((e) => e.lineFingerprint));
    const duplicates = [];
    const warnings = [];

    lines.forEach((l, idx) => {
        const fp = fps[idx];
        if (fpSet.has(fp)) {
            const match = existing.find((e) => e.lineFingerprint === fp);
            duplicates.push({ index: idx, line: l, existingId: match?._id, fingerprint: fp });
            warnings.push(
                `Row ${idx + 1}: possible duplicate (${l.txnDate?.toISOString?.().slice(0, 10) || '?'} ₹${l.amount})`,
            );
        }
    });

    return { duplicates, warnings };
}
