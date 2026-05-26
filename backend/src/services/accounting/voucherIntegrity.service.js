import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { Voucher } from '../../models/voucher.model.js';

/**
 * Ensures voucher number is not reused while an active (non-cancelled) voucher holds it.
 * Cancelled vouchers keep the number blocked per unique index (existing behaviour).
 */
export async function assertVoucherNumberAvailable({
    financialYear,
    voucherTypeId,
    voucherNo,
    excludeVoucherId = null,
    session = null,
}) {
    const filter = {
        financialYear,
        voucherType: voucherTypeId,
        voucherNo,
        status: { $ne: 'Cancelled' },
    };
    if (excludeVoucherId) {
        filter._id = { $ne: excludeVoucherId };
    }
    const q = Voucher.findOne(filter);
    if (session) q.session(session);
    const clash = await q.lean();
    if (clash) {
        throw new ApiError(
            httpStatus.CONFLICT,
            `Voucher number ${voucherNo} already exists for this company, financial year, and voucher type`,
        );
    }
}

export async function assertVoucherEditable(voucher) {
    if (!voucher) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
    }
    if (voucher.status === 'Cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cancelled voucher cannot be edited or reposted');
    }
}
