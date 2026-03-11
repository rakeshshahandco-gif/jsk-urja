import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { VoucherType } from '../models/voucherType.model.js';

export const createVoucherType = asyncHandler(async (req, res) => {
    const existing = await VoucherType.findOne({ name: req.body.name });
    if (existing) throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher type name already exists');

    const voucherType = await VoucherType.create({
        ...req.body,
        nextNumber: req.body.startingNumber || 1,
        createdBy: req.user.id
    });

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, voucherType, 'Voucher type created successfully'));
});

export const getVoucherTypes = asyncHandler(async (req, res) => {
    const { nature, active } = req.query;
    const filter = {};
    if (nature) filter.nature = nature;
    if (active !== undefined) filter.active = active === 'true';

    const types = await VoucherType.find(filter).sort({ name: 1 });
    res.send(new ApiResponse(httpStatus.OK, types));
});

export const updateVoucherType = asyncHandler(async (req, res) => {
    const type = await VoucherType.findById(req.params.id);
    if (!type) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher type not found');

    Object.assign(type, req.body);
    await type.save();

    res.send(new ApiResponse(httpStatus.OK, type, 'Voucher type updated successfully'));
});

export const deleteVoucherType = asyncHandler(async (req, res) => {
    const type = await VoucherType.findById(req.params.id);
    if (!type) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher type not found');

    // Check if any vouchers exist

    await type.deleteOne();
    res.send(new ApiResponse(httpStatus.OK, null, 'Voucher type deleted successfully'));
});
