import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { AccountingPeriodLock } from '../../models/accountingPeriodLock.model.js';

export async function getPeriodLock(financialYear) {
    if (!financialYear) return null;
    return AccountingPeriodLock.findOne({ financialYear, isActive: true }).lean();
}

export async function assertDateNotLocked({
    date,
    financialYear,
    lockType = 'books',
    adminOverride = false,
    unlockReason = '',
}) {
    if (!date || !financialYear) return;

    const lock = await getPeriodLock(financialYear);
    if (!lock) return;

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    if (lock.unlockedTill && new Date(lock.unlockedTill) >= d) {
        if (!adminOverride) return;
        if (!String(unlockReason || '').trim()) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Unlock reason is required for admin override in locked period');
        }
        return;
    }

    let till = lock.booksLockedTill;
    if (lockType === 'gst') till = lock.gstLockedTill;
    else if (lockType === 'tds') till = lock.tdsLockedTill || lock.booksLockedTill;
    if (!till) return;

    const lockDate = new Date(till);
    lockDate.setHours(23, 59, 59, 999);

    if (d <= lockDate) {
        if (adminOverride) {
            if (!String(unlockReason || '').trim()) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Unlock reason is required to post in locked period');
            }
            return;
        }
        const label = lockType === 'gst' ? 'GST' : 'Books';
        throw new ApiError(
            httpStatus.FORBIDDEN,
            `${label} are locked up to ${lockDate.toLocaleDateString('en-IN')} for F.Y. ${financialYear}`,
        );
    }
}

export async function assertTdsDateNotLocked(opts) {
    return assertDateNotLocked({ ...opts, lockType: 'tds' });
}

export async function upsertPeriodLock(payload, userId) {
    const { financialYear, booksLockedTill, gstLockedTill, tdsLockedTill, remarks } = payload;
    return AccountingPeriodLock.findOneAndUpdate(
        { financialYear },
        {
            financialYear,
            booksLockedTill: booksLockedTill || null,
            gstLockedTill: gstLockedTill || null,
            tdsLockedTill: tdsLockedTill || null,
            isActive: true,
            remarks: remarks || '',
            updatedBy: userId,
            unlockReason: '',
            unlockedTill: null,
            unlockedBy: null,
        },
        { upsert: true, new: true },
    );
}

export async function grantTemporaryUnlock({ financialYear, unlockedTill, unlockReason, userId }) {
    if (!String(unlockReason || '').trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Unlock reason is required');
    }
    return AccountingPeriodLock.findOneAndUpdate(
        { financialYear },
        {
            unlockReason,
            unlockedTill,
            unlockedBy: userId,
            isActive: true,
        },
        { upsert: true, new: true },
    );
}
